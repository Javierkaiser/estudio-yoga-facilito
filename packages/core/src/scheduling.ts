import { DateTime } from 'luxon';
import type { Pool, PoolClient } from 'pg';
import { queryOne, queryRows, withTransaction } from '../../db/src/client';
import {
  addDays,
  formatInStudio,
  localDateTimeToUtc,
  STUDIO_TIMEZONE,
} from '../../shared/src/time';
import { countOccupied, promoteWaitlist } from './bookings';
import { DomainError } from './errors';
import { refundForBooking } from './ledger';
import { enqueueClassCancelled } from './notifications';
import type {
  BookingRow,
  ClassSessionRow,
  ClassTemplateRow,
  StaffActor,
  StaffUserRow,
} from './types';

export interface TemplateWithInstructor extends ClassTemplateRow {
  instructor_name: string;
}

export interface SessionWithCounts extends ClassSessionRow {
  instructor_name: string;
  occupied: number;
  waitlisted: number;
  available: number;
}

export interface InstructorOption {
  id: string;
  name: string;
  email: string;
  role: 'instructor';
  active: boolean;
}

export interface CreateTemplateInput {
  weekday: number;
  startTime: string;
  durationMinutes: number;
  capacity: number;
  instructorId: string;
}

export interface UpdateTemplateInput {
  weekday?: number;
  startTime?: string;
  durationMinutes?: number;
  capacity?: number;
  instructorId?: string;
  active?: boolean;
}

export interface GenerateSessionsInput {
  templateId: string;
  from: string;
  to: string;
  now?: Date;
}

export interface EditSessionInput {
  sessionId: string;
  capacity?: number;
  instructorId?: string;
  now?: Date;
}

export interface CancelClassInput {
  sessionId: string;
  actor: StaffActor;
  now?: Date;
}

export interface CancelClassResult {
  refunded: number;
  notified: number;
  alreadyCancelled: boolean;
}

interface CancelCandidate {
  booking_id: string;
  student_id: string;
  booking_status: BookingRow['status'];
  student_name: string;
  phone_e164: string;
  whatsapp_consent_at: Date | null;
}

const START_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export async function createTemplate(
  pool: Pool,
  input: CreateTemplateInput,
  actor: StaffActor,
): Promise<ClassTemplateRow> {
  return withTransaction(pool, async (client) => {
    await assertAdmin(client, actor);
    await validateTemplate(client, input);

    const template = await queryOne<ClassTemplateRow>(
      client,
      `INSERT INTO class_templates
         (weekday, start_time, duration_minutes, capacity, instructor_id, active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [input.weekday, input.startTime, input.durationMinutes, input.capacity, input.instructorId],
    );
    if (!template) {
      throw new DomainError('CONFLICT', 'No se pudo crear la plantilla');
    }
    return template;
  });
}

export async function updateTemplate(
  pool: Pool,
  templateId: string,
  input: UpdateTemplateInput,
  actor: StaffActor,
): Promise<ClassTemplateRow> {
  return withTransaction(pool, async (client) => {
    await assertAdmin(client, actor);
    const current = await queryOne<ClassTemplateRow>(
      client,
      'SELECT * FROM class_templates WHERE id = $1 FOR UPDATE',
      [templateId],
    );
    if (!current) {
      throw new DomainError('NOT_FOUND', 'La plantilla no existe');
    }

    const next = {
      weekday: input.weekday ?? current.weekday,
      startTime: input.startTime ?? current.start_time,
      durationMinutes: input.durationMinutes ?? current.duration_minutes,
      capacity: input.capacity ?? current.capacity,
      instructorId: input.instructorId ?? current.instructor_id,
    };
    await validateTemplate(client, next);

    const updated = await queryOne<ClassTemplateRow>(
      client,
      `UPDATE class_templates
          SET weekday = $2,
              start_time = $3,
              duration_minutes = $4,
              capacity = $5,
              instructor_id = $6,
              active = $7
        WHERE id = $1
        RETURNING *`,
      [
        templateId,
        next.weekday,
        next.startTime,
        next.durationMinutes,
        next.capacity,
        next.instructorId,
        input.active ?? current.active,
      ],
    );
    if (!updated) {
      throw new DomainError('CONFLICT', 'No se pudo actualizar la plantilla');
    }
    return updated;
  });
}

export async function listTemplates(pool: Pool): Promise<TemplateWithInstructor[]> {
  return queryRows<TemplateWithInstructor>(
    pool,
    `SELECT t.*, s.name AS instructor_name
       FROM class_templates t
       JOIN staff_users s ON s.id = t.instructor_id
      ORDER BY t.weekday ASC, t.start_time ASC`,
  );
}

export async function listInstructors(pool: Pool): Promise<InstructorOption[]> {
  return queryRows<InstructorOption>(
    pool,
    `SELECT id, name, email, role, active
       FROM staff_users
      WHERE role = 'instructor' AND active = true
      ORDER BY name ASC`,
  );
}

export async function generateSessions(
  pool: Pool,
  input: GenerateSessionsInput,
  actor: StaffActor,
): Promise<{ created: number; skipped: number }> {
  return withTransaction(pool, async (client) => {
    await assertAdmin(client, actor);

    const template = await queryOne<ClassTemplateRow>(
      client,
      'SELECT * FROM class_templates WHERE id = $1',
      [input.templateId],
    );
    if (!template || !template.active) {
      throw new DomainError('NOT_FOUND', 'La plantilla no existe o está inactiva');
    }

    const start = DateTime.fromISO(input.from, { zone: STUDIO_TIMEZONE }).startOf('day');
    const end = DateTime.fromISO(input.to, { zone: STUDIO_TIMEZONE }).startOf('day');
    if (!start.isValid || !end.isValid) {
      throw new DomainError('VALIDATION_ERROR', 'El rango de fechas no es válido');
    }
    if (end < start) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'La fecha final no puede ser anterior a la inicial',
      );
    }
    if (end.diff(start, 'days').days > 182) {
      throw new DomainError('VALIDATION_ERROR', 'El rango máximo es de 26 semanas');
    }

    const now = input.now ?? new Date();
    let created = 0;
    let skipped = 0;

    for (let cursor = start; cursor <= end; cursor = cursor.plus({ days: 1 })) {
      if (cursor.weekday !== template.weekday) {
        continue;
      }

      const date = cursor.toISODate();
      if (!date) {
        continue;
      }
      const startsAt = localDateTimeToUtc(date, template.start_time, STUDIO_TIMEZONE);
      if (startsAt.getTime() <= now.getTime()) {
        skipped += 1;
        continue;
      }

      const inserted = await queryOne<{ id: string }>(
        client,
        `INSERT INTO class_sessions
           (template_id, starts_at, duration_minutes, capacity, instructor_id, status)
         VALUES ($1, $2, $3, $4, $5, 'scheduled')
         ON CONFLICT (template_id, starts_at) WHERE template_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          template.id,
          startsAt,
          template.duration_minutes,
          template.capacity,
          template.instructor_id,
        ],
      );

      if (inserted) {
        created += 1;
      } else {
        skipped += 1;
      }
    }

    return { created, skipped };
  });
}

export async function listSessions(
  pool: Pool,
  options: { from?: Date; to?: Date } = {},
): Promise<SessionWithCounts[]> {
  const from = options.from ?? new Date();
  const to = options.to ?? addDays(from, 56);

  const sessions = await queryRows<SessionWithCounts>(
    pool,
    `SELECT cs.*, s.name AS instructor_name,
            (SELECT count(*)::int
               FROM bookings b
              WHERE b.session_id = cs.id
                AND b.status IN ('confirmed', 'offered')) AS occupied,
            (SELECT count(*)::int
               FROM bookings b
              WHERE b.session_id = cs.id
                AND b.status = 'waitlisted') AS waitlisted
       FROM class_sessions cs
       JOIN staff_users s ON s.id = cs.instructor_id
      WHERE cs.starts_at >= $1 AND cs.starts_at <= $2
      ORDER BY cs.starts_at ASC, cs.id ASC`,
    [from, to],
  );

  return sessions.map((session) => ({
    ...session,
    occupied: Number(session.occupied),
    waitlisted: Number(session.waitlisted),
    available: Math.max(0, session.capacity - Number(session.occupied)),
  }));
}

export async function editSession(
  pool: Pool,
  input: EditSessionInput,
  actor: StaffActor,
): Promise<{ session: ClassSessionRow; promoted: BookingRow | null }> {
  return withTransaction(pool, async (client) => {
    await assertAdmin(client, actor);
    const now = input.now ?? new Date();

    const session = await queryOne<ClassSessionRow>(
      client,
      'SELECT * FROM class_sessions WHERE id = $1 FOR UPDATE',
      [input.sessionId],
    );
    if (!session) {
      throw new DomainError('SESSION_NOT_BOOKABLE', 'La sesión no existe');
    }
    if (session.status !== 'scheduled' || new Date(session.starts_at) <= now) {
      throw new DomainError('SESSION_STARTED', 'La sesión ya comenzó o no está programada');
    }

    if (input.capacity !== undefined) {
      if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
        throw new DomainError('VALIDATION_ERROR', 'El cupo debe ser un entero positivo');
      }
      const occupied = await countOccupied(client, session.id);
      if (input.capacity < occupied) {
        throw new DomainError(
          'CAPACITY_TOO_LOW',
          'El cupo no puede ser menor que las reservas confirmadas y ofrecidas',
        );
      }
    }

    if (input.instructorId) {
      await assertInstructor(client, input.instructorId);
    }

    const updated = await queryOne<ClassSessionRow>(
      client,
      `UPDATE class_sessions
          SET capacity = COALESCE($2, capacity),
              instructor_id = COALESCE($3, instructor_id)
        WHERE id = $1
        RETURNING *`,
      [session.id, input.capacity ?? null, input.instructorId ?? null],
    );
    if (!updated) {
      throw new DomainError('CONFLICT', 'No se pudo actualizar la sesión');
    }

    let promoted: BookingRow | null = null;
    if (input.capacity !== undefined && input.capacity > session.capacity) {
      promoted = await promoteWaitlist(client, { sessionId: session.id, now });
    }

    return { session: updated, promoted };
  });
}

export async function cancelClass(pool: Pool, input: CancelClassInput): Promise<CancelClassResult> {
  return withTransaction(pool, async (client) => {
    const staff = await queryOne<StaffUserRow>(
      client,
      'SELECT * FROM staff_users WHERE id = $1 AND active = true',
      [input.actor.id],
    );
    if (!staff || (staff.role !== 'admin' && staff.role !== 'instructor')) {
      throw new DomainError('FORBIDDEN', 'No tenés permiso para cancelar esta clase');
    }

    const session = await queryOne<ClassSessionRow>(
      client,
      'SELECT * FROM class_sessions WHERE id = $1 FOR UPDATE',
      [input.sessionId],
    );
    if (!session) {
      throw new DomainError('SESSION_NOT_BOOKABLE', 'La sesión no existe');
    }

    if (session.status === 'cancelled') {
      return { refunded: 0, notified: 0, alreadyCancelled: true };
    }
    if (staff.role === 'instructor' && session.instructor_id !== staff.id) {
      throw new DomainError('FORBIDDEN', 'La clase pertenece a otra instructora');
    }
    const now = input.now ?? new Date();
    if (session.status !== 'scheduled' || new Date(session.starts_at) <= now) {
      throw new DomainError('SESSION_STARTED', 'La clase ya comenzó o no está programada');
    }

    await client.query(
      `UPDATE class_sessions
          SET status = 'cancelled',
              cancelled_at = $2,
              cancelled_by_type = 'staff',
              cancelled_by_id = $3
        WHERE id = $1`,
      [session.id, now, staff.id],
    );

    const candidates = await queryRows<CancelCandidate>(
      client,
      `SELECT b.id AS booking_id,
              b.student_id,
              b.status AS booking_status,
              s.name AS student_name,
              s.phone_e164,
              s.whatsapp_consent_at
         FROM bookings b
         JOIN students s ON s.id = b.student_id
        WHERE b.session_id = $1
          AND b.status IN ('confirmed', 'offered', 'waitlisted')
        ORDER BY b.created_at ASC, b.id ASC
        FOR UPDATE OF b`,
      [session.id],
    );

    let refunded = 0;
    let notified = 0;

    for (const candidate of candidates) {
      let refundedThisBooking = false;
      if (candidate.booking_status === 'confirmed') {
        const refund = await refundForBooking(client, {
          bookingId: candidate.booking_id,
          actorType: 'staff',
          actorId: staff.id,
          reason: 'Cancelación de clase',
        });
        if (!refund.alreadyRefunded) {
          refunded += 1;
        }
        refundedThisBooking = true;
      }

      await client.query(
        `UPDATE bookings
            SET status = 'cancelled',
                cancelled_at = $2,
                cancelled_by_type = 'staff',
                cancelled_by_id = $3
          WHERE id = $1`,
        [candidate.booking_id, now, staff.id],
      );

      const notification = await enqueueClassCancelled(client, {
        session,
        student: {
          id: candidate.student_id,
          name: candidate.student_name,
          phone_e164: candidate.phone_e164,
          whatsapp_consent_at: candidate.whatsapp_consent_at,
        },
        refunded: refundedThisBooking,
      });
      if (notification) {
        notified += 1;
      }
    }

    return { refunded, notified, alreadyCancelled: false };
  });
}

export async function completeSessions(pool: Pool, now = new Date()): Promise<number> {
  const result = await queryRows<{ id: string }>(
    pool,
    `UPDATE class_sessions
        SET status = 'completed'
      WHERE status = 'scheduled'
        AND starts_at + (duration_minutes * interval '1 minute') <= $1
      RETURNING id`,
    [now],
  );
  return result.length;
}

export function formatSessionDate(session: Pick<ClassSessionRow, 'starts_at'>): string {
  return formatInStudio(session.starts_at);
}

async function assertAdmin(client: PoolClient, actor: StaffActor): Promise<void> {
  if (actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Solo la administradora puede realizar esta operación');
  }
  const staff = await queryOne<StaffUserRow>(
    client,
    'SELECT * FROM staff_users WHERE id = $1 AND active = true',
    [actor.id],
  );
  if (!staff || staff.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Solo la administradora puede realizar esta operación');
  }
}

async function assertInstructor(client: PoolClient, instructorId: string): Promise<void> {
  const instructor = await queryOne<StaffUserRow>(
    client,
    'SELECT * FROM staff_users WHERE id = $1 AND active = true',
    [instructorId],
  );
  if (!instructor || instructor.role !== 'instructor') {
    throw new DomainError('VALIDATION_ERROR', 'La instructora no existe o no está activa');
  }
}

async function validateTemplate(
  client: PoolClient,
  input: {
    weekday: number;
    startTime: string;
    durationMinutes: number;
    capacity: number;
    instructorId: string;
  },
): Promise<void> {
  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
    throw new DomainError('VALIDATION_ERROR', 'El día debe estar entre 1 y 7');
  }
  if (!START_TIME_PATTERN.test(input.startTime)) {
    throw new DomainError('VALIDATION_ERROR', 'La hora debe tener formato HH:mm');
  }
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new DomainError('VALIDATION_ERROR', 'La duración debe ser un entero positivo');
  }
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
    throw new DomainError('VALIDATION_ERROR', 'El cupo debe ser un entero positivo');
  }
  await assertInstructor(client, input.instructorId);
}
