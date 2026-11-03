import type { PoolClient } from 'pg';
import { queryOne } from '../../db/src/client';
import { formatInStudio } from '../../shared/src/time';
import { DomainError } from './errors';
import type { ClassSessionRow, NotificationRow } from './types';

export type NotificationTemplate = 'class_cancelled_v1' | 'spot_offered_v1';

export interface NotificationStudent {
  id: string;
  name: string;
  phone_e164: string;
  whatsapp_consent_at: Date | null;
}

const TEMPLATES: Record<NotificationTemplate, { event: string; paramCount: number }> = {
  class_cancelled_v1: { event: 'class_cancelled', paramCount: 3 },
  spot_offered_v1: { event: 'spot_offered', paramCount: 3 },
};

export interface EnqueueNotificationInput {
  student: NotificationStudent;
  template: NotificationTemplate;
  params: string[];
  idempotencyKey: string;
}

export async function enqueueNotification(
  client: PoolClient,
  input: EnqueueNotificationInput,
): Promise<NotificationRow | null> {
  const definition = TEMPLATES[input.template];
  if (!definition) {
    throw new DomainError('VALIDATION_ERROR', 'Plantilla de aviso inválida');
  }
  if (input.params.length !== definition.paramCount) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `La plantilla ${input.template} requiere ${definition.paramCount} parámetros`,
    );
  }

  const status = input.student.whatsapp_consent_at ? 'pending' : 'skipped';

  return queryOne<NotificationRow>(
    client,
    `INSERT INTO notifications
       (event, recipient_student_id, recipient_phone, template, payload, status,
        idempotency_key)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      definition.event,
      input.student.id,
      input.student.phone_e164,
      input.template,
      JSON.stringify(input.params),
      status,
      input.idempotencyKey,
    ],
  );
}

export async function enqueueClassCancelled(
  client: PoolClient,
  input: {
    session: Pick<ClassSessionRow, 'id' | 'starts_at'>;
    student: NotificationStudent;
    refunded: boolean;
  },
): Promise<NotificationRow | null> {
  return enqueueNotification(client, {
    student: input.student,
    template: 'class_cancelled_v1',
    params: [
      input.student.name,
      formatInStudio(input.session.starts_at),
      input.refunded ? 'Crédito devuelto' : 'Sin devolución',
    ],
    idempotencyKey: `class:${input.session.id}:cancelled:${input.student.id}`,
  });
}

export async function enqueueSpotOffered(
  client: PoolClient,
  input: {
    bookingId: string;
    session: Pick<ClassSessionRow, 'id' | 'starts_at'>;
    student: NotificationStudent;
    deadline: Date;
  },
): Promise<NotificationRow | null> {
  return enqueueNotification(client, {
    student: input.student,
    template: 'spot_offered_v1',
    params: [
      input.student.name,
      formatInStudio(input.session.starts_at),
      formatInStudio(input.deadline, { dateStyle: 'short', timeStyle: 'short' }),
    ],
    idempotencyKey: `booking:${input.bookingId}:spot_offered`,
  });
}
