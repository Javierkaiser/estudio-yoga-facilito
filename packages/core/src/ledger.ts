import type { Pool, PoolClient } from 'pg';
import { queryOne, queryRows, withTransaction } from '../../db/src/client';
import { packageExpiry } from '../../shared/src/time';
import { DomainError, isDomainError, mapPostgresError } from './errors';
import type {
  ActorType,
  CreditMovementRow,
  MovementType,
  PackagePlanRow,
  StaffActor,
  StudentPackageRow,
} from './types';

export interface CreatePlanInput {
  name: string;
  credits: number;
  validityDays?: number | null;
}

export interface PurchasePackageInput {
  studentId: string;
  planId: string;
  purchasedAt?: Date;
}

export interface AdjustCreditsInput {
  studentPackageId: string;
  delta: number;
  reason: string;
}

export interface DebitCreditsInput {
  studentId: string;
  bookingId?: string | null;
  classSessionId?: string | null;
  actorType?: ActorType;
  actorId?: string | null;
}

export interface RefundForBookingInput {
  bookingId: string;
  actorType?: ActorType;
  actorId?: string | null;
  reason?: string;
}

interface InsertMovementInput {
  studentPackageId: string;
  studentId: string;
  type: MovementType;
  delta: number;
  bookingId?: string | null;
  classSessionId?: string | null;
  actorType: ActorType;
  actorId?: string | null;
  reason?: string | null;
}

export interface RefundResult {
  package: StudentPackageRow;
  movement: CreditMovementRow;
  alreadyRefunded: boolean;
}

export interface BalanceCheck {
  balance: number;
  sum: number;
}

export interface StudentLedgerSummary {
  id: string;
  name: string;
  phone_e164: string;
  email: string | null;
  whatsapp_consent_at: Date | null;
  created_at: Date;
  updated_at: Date;
  total_balance: number;
  active_packages: number;
}

export interface LedgerTotals {
  students: number;
  active_packages: number;
  total_balance: number;
  movements: number;
}

export async function createPlan(
  pool: Pool,
  input: CreatePlanInput,
  actor: StaffActor,
): Promise<PackagePlanRow> {
  return withTransaction(pool, async (client) => {
    await assertAdmin(client, actor);

    if (!input.name.trim()) {
      throw new DomainError('VALIDATION_ERROR', 'El nombre del plan es obligatorio');
    }
    if (!Number.isInteger(input.credits) || input.credits <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Los créditos deben ser un entero positivo');
    }

    const validityDays = input.validityDays === undefined ? 90 : input.validityDays;
    if (
      validityDays !== null &&
      (!Number.isInteger(validityDays) || validityDays <= 0)
    ) {
      throw new DomainError('VALIDATION_ERROR', 'La vigencia debe ser un entero positivo o null');
    }

    const plan = await queryOne<PackagePlanRow>(
      client,
      `INSERT INTO package_plans (name, credits, validity_days)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.name.trim(), input.credits, validityDays],
    );

    if (!plan) {
      throw new DomainError('CONFLICT', 'No se pudo crear el plan');
    }
    return plan;
  });
}

export async function purchasePackage(
  pool: Pool,
  input: PurchasePackageInput,
  actor: StaffActor,
): Promise<StudentPackageRow> {
  return withTransaction(pool, async (client) => {
    await assertAdmin(client, actor);

    const student = await queryOne<{ id: string }>(client, 'SELECT id FROM students WHERE id = $1', [
      input.studentId,
    ]);
    if (!student) {
      throw new DomainError('STUDENT_NOT_FOUND', 'El estudiante no existe');
    }

    const plan = await queryOne<PackagePlanRow>(
      client,
      'SELECT * FROM package_plans WHERE id = $1 AND active = true',
      [input.planId],
    );
    if (!plan) {
      throw new DomainError('PLAN_NOT_FOUND', 'El plan no existe o está inactivo');
    }

    const purchasedAt = input.purchasedAt ?? new Date();
    const expiresAt = packageExpiry(purchasedAt, plan.validity_days);

    const created = await queryOne<StudentPackageRow>(
      client,
      `INSERT INTO student_packages
         (student_id, plan_id, credits_purchased, balance, purchased_at, expires_at, status)
       VALUES ($1, $2, $3, 0, $4, $5, 'active')
       RETURNING *`,
      [input.studentId, input.planId, plan.credits, purchasedAt, expiresAt],
    );

    if (!created) {
      throw new DomainError('CONFLICT', 'No se pudo crear el paquete');
    }

    await insertMovement(client, {
      studentPackageId: created.id,
      studentId: created.student_id,
      type: 'purchase',
      delta: plan.credits,
      actorType: 'staff',
      actorId: actor.id,
      reason: `Compra del plan ${plan.name}`,
    });

    return getPackage(client, created.id);
  });
}

export async function adjustCredits(
  pool: Pool,
  input: AdjustCreditsInput,
  actor: StaffActor,
): Promise<StudentPackageRow> {
  return withTransaction(pool, async (client) => {
    await assertAdmin(client, actor);

    if (!Number.isInteger(input.delta) || input.delta === 0) {
      throw new DomainError('VALIDATION_ERROR', 'El ajuste debe ser un entero distinto de cero');
    }
    if (!input.reason.trim()) {
      throw new DomainError('VALIDATION_ERROR', 'El motivo del ajuste es obligatorio');
    }

    const pkg = await queryOne<StudentPackageRow>(
      client,
      'SELECT * FROM student_packages WHERE id = $1 FOR UPDATE',
      [input.studentPackageId],
    );
    if (!pkg) {
      throw new DomainError('PACKAGE_NOT_FOUND', 'El paquete no existe');
    }

    await insertMovement(client, {
      studentPackageId: pkg.id,
      studentId: pkg.student_id,
      type: 'adjustment',
      delta: input.delta,
      actorType: 'staff',
      actorId: actor.id,
      reason: input.reason.trim(),
    });

    return getPackage(client, pkg.id);
  });
}

export async function debitCredits(
  client: PoolClient,
  input: DebitCreditsInput,
): Promise<{ package: StudentPackageRow; movement: CreditMovementRow }> {
  const pkg = await queryOne<StudentPackageRow>(
    client,
    `SELECT *
       FROM student_packages
      WHERE student_id = $1
        AND status = 'active'
        AND balance > 0
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY expires_at ASC NULLS LAST, purchased_at ASC, id ASC
      LIMIT 1
      FOR UPDATE`,
    [input.studentId],
  );

  if (!pkg) {
    throw new DomainError('INSUFFICIENT_CREDITS', 'No hay créditos vigentes disponibles');
  }

  const movement = await insertMovement(client, {
    studentPackageId: pkg.id,
    studentId: pkg.student_id,
    type: 'booking',
    delta: -1,
    bookingId: input.bookingId ?? null,
    classSessionId: input.classSessionId ?? null,
    actorType: input.actorType ?? 'student',
    actorId: input.actorId ?? input.studentId,
    reason: 'Reserva de clase',
  });

  return { package: await getPackage(client, pkg.id), movement };
}

export const debitForBooking = debitCredits;

export async function refundForBooking(
  client: PoolClient,
  input: RefundForBookingInput,
): Promise<RefundResult> {
  const booking = await queryOne<{ id: string; session_id: string }>(
    client,
    'SELECT id, session_id FROM bookings WHERE id = $1',
    [input.bookingId],
  );
  if (!booking) {
    throw new DomainError('BOOKING_NOT_FOUND', 'La reserva no existe');
  }

  const existingRefund = await queryOne<CreditMovementRow>(
    client,
    `SELECT * FROM credit_movements WHERE booking_id = $1 AND type = 'refund' LIMIT 1`,
    [input.bookingId],
  );
  if (existingRefund) {
    return {
      package: await getPackage(client, existingRefund.student_package_id),
      movement: existingRefund,
      alreadyRefunded: true,
    };
  }

  const bookingMovement = await queryOne<CreditMovementRow>(
    client,
    `SELECT * FROM credit_movements WHERE booking_id = $1 AND type = 'booking' LIMIT 1`,
    [input.bookingId],
  );
  if (!bookingMovement) {
    throw new DomainError('MOVEMENT_NOT_FOUND', 'La reserva no tiene un débito asociado');
  }

  try {
    const movement = await insertMovement(client, {
      studentPackageId: bookingMovement.student_package_id,
      studentId: bookingMovement.student_id,
      type: 'refund',
      delta: 1,
      bookingId: booking.id,
      classSessionId: booking.session_id,
      actorType: input.actorType ?? 'system',
      actorId: input.actorId ?? null,
      reason: input.reason ?? 'Devolución de crédito',
    });

    return {
      package: await getPackage(client, bookingMovement.student_package_id),
      movement,
      alreadyRefunded: false,
    };
  } catch (error) {
    const mapped = mapPostgresError(error);
    if (mapped?.code === 'CONFLICT' || (isDomainError(error) && error.code === 'CONFLICT')) {
      const concurrentRefund = await queryOne<CreditMovementRow>(
        client,
        `SELECT * FROM credit_movements WHERE booking_id = $1 AND type = 'refund' LIMIT 1`,
        [input.bookingId],
      );
      if (concurrentRefund) {
        return {
          package: await getPackage(client, concurrentRefund.student_package_id),
          movement: concurrentRefund,
          alreadyRefunded: true,
        };
      }
    }
    throw error;
  }
}

export async function expirePackage(
  client: PoolClient,
  packageId: string,
  now = new Date(),
): Promise<StudentPackageRow> {
  const pkg = await queryOne<StudentPackageRow>(
    client,
    'SELECT * FROM student_packages WHERE id = $1 FOR UPDATE',
    [packageId],
  );
  if (!pkg) {
    throw new DomainError('PACKAGE_NOT_FOUND', 'El paquete no existe');
  }
  if (pkg.expires_at === null || pkg.expires_at > now) {
    throw new DomainError('VALIDATION_ERROR', 'El paquete todavía no venció');
  }

  if (pkg.balance > 0) {
    await insertMovement(client, {
      studentPackageId: pkg.id,
      studentId: pkg.student_id,
      type: 'expiration',
      delta: -pkg.balance,
      actorType: 'system',
      reason: 'Vencimiento de paquete',
    });
  } else if (pkg.status !== 'expired') {
    await client.query(`UPDATE student_packages SET status = 'expired' WHERE id = $1`, [pkg.id]);
  }

  return getPackage(client, pkg.id);
}

export async function expireDuePackages(
  pool: Pool,
  options: { now?: Date; limit?: number } = {},
): Promise<{ processed: number }> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 100;

  return withTransaction(pool, async (client) => {
    const rows = await queryRows<{ id: string }>(
      client,
      `SELECT id
         FROM student_packages
        WHERE expires_at IS NOT NULL
          AND expires_at <= $1
          AND (balance > 0 OR status <> 'expired')
        ORDER BY expires_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $2`,
      [now, limit],
    );

    for (const row of rows) {
      await expirePackage(client, row.id, now);
    }

    return { processed: rows.length };
  });
}

export async function getPackage(
  client: Pool | PoolClient,
  packageId: string,
): Promise<StudentPackageRow> {
  const pkg = await queryOne<StudentPackageRow>(
    client,
    'SELECT * FROM student_packages WHERE id = $1',
    [packageId],
  );
  if (!pkg) {
    throw new DomainError('PACKAGE_NOT_FOUND', 'El paquete no existe');
  }
  return pkg;
}

export async function getBalance(
  client: Pool | PoolClient,
  packageId: string,
): Promise<BalanceCheck> {
  const row = await queryOne<{ balance: number; sum: number }>(
    client,
    `SELECT sp.balance, COALESCE(SUM(cm.delta), 0)::int AS sum
       FROM student_packages sp
       LEFT JOIN credit_movements cm ON cm.student_package_id = sp.id
      WHERE sp.id = $1
      GROUP BY sp.id, sp.balance`,
    [packageId],
  );
  if (!row) {
    throw new DomainError('PACKAGE_NOT_FOUND', 'El paquete no existe');
  }
  return { balance: row.balance, sum: row.sum };
}

export async function hasVigentCredit(
  client: Pool | PoolClient,
  studentId: string,
  now = new Date(),
): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    client,
    `SELECT EXISTS (
       SELECT 1
         FROM student_packages
        WHERE student_id = $1
          AND status = 'active'
          AND balance > 0
          AND (expires_at IS NULL OR expires_at > $2)
     ) AS exists`,
    [studentId, now],
  );
  return row?.exists ?? false;
}

export async function listStudentLedgerSummaries(
  client: Pool | PoolClient,
): Promise<StudentLedgerSummary[]> {
  return queryRows<StudentLedgerSummary>(
    client,
    `SELECT s.*,
            COALESCE(SUM(sp.balance) FILTER (WHERE sp.status = 'active'), 0)::int
              AS total_balance,
            COUNT(sp.id) FILTER (WHERE sp.status = 'active')::int AS active_packages
       FROM students s
       LEFT JOIN student_packages sp ON sp.student_id = s.id
      GROUP BY s.id
      ORDER BY s.name ASC, s.created_at ASC`,
  );
}

export async function listPlans(client: Pool | PoolClient): Promise<PackagePlanRow[]> {
  return queryRows<PackagePlanRow>(
    client,
    'SELECT * FROM package_plans ORDER BY created_at DESC, name ASC',
  );
}

export async function getLedgerTotals(client: Pool | PoolClient): Promise<LedgerTotals> {
  const row = await queryOne<LedgerTotals>(
    client,
    `SELECT
       (SELECT count(*)::int FROM students) AS students,
       (SELECT count(*)::int FROM student_packages WHERE status = 'active') AS active_packages,
       (SELECT COALESCE(SUM(balance), 0)::int FROM student_packages WHERE status = 'active')
         AS total_balance,
       (SELECT count(*)::int FROM credit_movements) AS movements`,
  );

  if (!row) {
    return { students: 0, active_packages: 0, total_balance: 0, movements: 0 };
  }
  return row;
}

export async function listPackages(
  client: Pool | PoolClient,
  studentId: string,
): Promise<Array<StudentPackageRow & { plan_name: string }>> {
  return queryRows<StudentPackageRow & { plan_name: string }>(
    client,
    `SELECT sp.*, pp.name AS plan_name
       FROM student_packages sp
       JOIN package_plans pp ON pp.id = sp.plan_id
      WHERE sp.student_id = $1
      ORDER BY sp.purchased_at DESC, sp.id DESC`,
    [studentId],
  );
}

export async function listMovements(
  client: Pool | PoolClient,
  studentId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<CreditMovementRow[]> {
  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;
  return queryRows<CreditMovementRow>(
    client,
    `SELECT *
       FROM credit_movements
      WHERE student_id = $1
      ORDER BY seq DESC
      LIMIT $2 OFFSET $3`,
    [studentId, limit, offset],
  );
}

async function insertMovement(
  client: PoolClient,
  input: InsertMovementInput,
): Promise<CreditMovementRow> {
  try {
    const movement = await queryOne<CreditMovementRow>(
      client,
      `INSERT INTO credit_movements
         (student_package_id, student_id, type, delta, booking_id, class_session_id,
          actor_type, actor_id, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.studentPackageId,
        input.studentId,
        input.type,
        input.delta,
        input.bookingId ?? null,
        input.classSessionId ?? null,
        input.actorType,
        input.actorId ?? null,
        input.reason ?? null,
      ],
    );

    if (!movement) {
      throw new DomainError('CONFLICT', 'No se pudo registrar el movimiento de crédito');
    }
    return movement;
  } catch (error) {
    const mapped = mapPostgresError(error);
    if (mapped) {
      throw mapped;
    }
    throw error;
  }
}

async function assertAdmin(client: Pool | PoolClient, actor: StaffActor): Promise<void> {
  if (actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Solo la administradora puede realizar esta operación');
  }

  const staff = await queryOne<{ role: string; active: boolean }>(
    client,
    'SELECT role, active FROM staff_users WHERE id = $1',
    [actor.id],
  );

  if (!staff || !staff.active || staff.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Solo la administradora puede realizar esta operación');
  }
}
