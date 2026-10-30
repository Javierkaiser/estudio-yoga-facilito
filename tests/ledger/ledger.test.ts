import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, queryRows, withTransaction } from '../../packages/db/src/client';
import {
  adjustCredits,
  debitCredits,
  expireDuePackages,
  getBalance,
  getPackage,
  hasVigentCredit,
  listMovements,
  refundForBooking,
} from '../../packages/core/src/ledger';
import {
  createAdmin,
  createBooking,
  createPlanAsAdmin,
  createSession,
  createStaff,
  createStudent,
  createStudentPackage,
  getPackageRow,
  truncateAll,
} from '../../packages/testing/src/factories';

const pool = createPool(process.env.DATABASE_URL);
const DAY = 24 * 60 * 60 * 1000;

describe('ledger de créditos', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('consume primero el paquete con vencimiento más próximo', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);

    const soonPlan = await createPlanAsAdmin(pool, admin, {
      name: 'Vence pronto',
      credits: 10,
      validityDays: 90,
    });
    const soon = await createStudentPackage(
      pool,
      admin,
      student,
      soonPlan,
      new Date(Date.now() - 80 * DAY),
    );

    const laterPlan = await createPlanAsAdmin(pool, admin, {
      name: 'Vence después',
      credits: 10,
      validityDays: 90,
    });
    const later = await createStudentPackage(pool, admin, student, laterPlan);

    const debit = await withTransaction(pool, (client) =>
      debitCredits(client, { studentId: student.id }),
    );

    expect(debit.movement.student_package_id).toBe(soon.id);
    expect((await getPackage(pool, soon.id)).balance).toBe(9);
    expect((await getPackage(pool, later.id)).balance).toBe(10);
  });

  it('no consume paquetes vencidos', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const expiredPlan = await createPlanAsAdmin(pool, admin, {
      name: 'Vencido',
      credits: 10,
      validityDays: 30,
    });
    const expired = await createStudentPackage(
      pool,
      admin,
      student,
      expiredPlan,
      new Date(Date.now() - 40 * DAY),
    );

    expect(expired.status).toBe('expired');
    await expect(
      withTransaction(pool, (client) => debitCredits(client, { studentId: student.id })),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
    expect((await getPackageRow(pool, expired.id)).balance).toBe(10);
  });

  it('no vence paquetes sin vigencia', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, {
      name: 'Libre',
      credits: 10,
      validityDays: null,
    });
    const pkg = await createStudentPackage(pool, admin, student, plan);

    expect(pkg.expires_at).toBeNull();
    await expireDuePackages(pool);
    expect((await getPackageRow(pool, pkg.id)).balance).toBe(10);
  });

  it('devuelve una sola vez al paquete de origen', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 10 });
    await createStudentPackage(pool, admin, student, plan);
    const session = await createSession(pool, { instructorId: instructor.id });
    const booking = await createBooking(pool, {
      sessionId: session.id,
      studentId: student.id,
    });

    await withTransaction(pool, (client) =>
      debitCredits(client, {
        studentId: student.id,
        bookingId: booking.id,
        classSessionId: session.id,
      }),
    );

    const first = await withTransaction(pool, (client) =>
      refundForBooking(client, { bookingId: booking.id }),
    );
    expect(first.alreadyRefunded).toBe(false);
    expect(first.package.balance).toBe(10);

    const second = await withTransaction(pool, (client) =>
      refundForBooking(client, { bookingId: booking.id }),
    );
    expect(second.alreadyRefunded).toBe(true);
    expect(second.package.balance).toBe(10);

    const refunds = await queryRows<{ count: string }>(
      pool,
      `SELECT count(*)::text AS count
         FROM credit_movements
        WHERE booking_id = $1 AND type = 'refund'`,
      [booking.id],
    );
    expect(refunds[0]?.count).toBe('1');
  });

  it('devuelve a un paquete vencido sin extender la vigencia y luego lo consume', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 10 });
    const pkg = await createStudentPackage(pool, admin, student, plan);
    const session = await createSession(pool, { instructorId: instructor.id });
    const booking = await createBooking(pool, {
      sessionId: session.id,
      studentId: student.id,
    });

    await withTransaction(pool, (client) =>
      debitCredits(client, {
        studentId: student.id,
        bookingId: booking.id,
        classSessionId: session.id,
      }),
    );

    const expiresAt = new Date(Date.now() - DAY);
    await pool.query('UPDATE student_packages SET expires_at = $2 WHERE id = $1', [
      pkg.id,
      expiresAt,
    ]);

    const refund = await withTransaction(pool, (client) =>
      refundForBooking(client, { bookingId: booking.id }),
    );
    expect(refund.package.balance).toBe(10);
    expect(refund.package.status).toBe('expired');
    expect(refund.package.expires_at?.getTime()).toBe(expiresAt.getTime());

    await expireDuePackages(pool);
    const writtenOff = await getPackageRow(pool, pkg.id);
    expect(writtenOff.balance).toBe(0);
    expect(writtenOff.status).toBe('expired');

    const balance = await getBalance(pool, pkg.id);
    expect(balance).toEqual({ balance: 0, sum: 0 });
  });

  it('registra vencimiento con saldo y omite el movimiento sin saldo', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, {
      name: 'Tres clases',
      credits: 3,
    });

    const withBalance = await createStudentPackage(pool, admin, student, plan);
    const withoutBalance = await createStudentPackage(pool, admin, student, plan);

    await adjustCredits(
      pool,
      { studentPackageId: withoutBalance.id, delta: -3, reason: 'Agotar' },
      { id: admin.id, role: 'admin' },
    );

    const past = new Date(Date.now() - DAY);
    await pool.query('UPDATE student_packages SET expires_at = $2 WHERE id = ANY($1::uuid[])', [
      [withBalance.id, withoutBalance.id],
      past,
    ]);

    const result = await expireDuePackages(pool);
    expect(result.processed).toBe(2);

    expect(await getPackageRow(pool, withBalance.id)).toMatchObject({
      balance: 0,
      status: 'expired',
    });
    expect(await getPackageRow(pool, withoutBalance.id)).toMatchObject({
      balance: 0,
      status: 'expired',
    });

    const expirationMovements = await queryRows<{ count: string }>(
      pool,
      `SELECT count(*)::text AS count
         FROM credit_movements
        WHERE student_package_id = $1 AND type = 'expiration'`,
      [withBalance.id],
    );
    expect(expirationMovements[0]?.count).toBe('1');

    const emptyExpirations = await queryRows<{ count: string }>(
      pool,
      `SELECT count(*)::text AS count
         FROM credit_movements
        WHERE student_package_id = $1 AND type = 'expiration'`,
      [withoutBalance.id],
    );
    expect(emptyExpirations[0]?.count).toBe('0');
  });

  it('expone si hay saldo vigente y ordena el historial', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 10 });
    const pkg = await createStudentPackage(pool, admin, student, plan);

    expect(await hasVigentCredit(pool, student.id)).toBe(true);

    await withTransaction(pool, (client) => debitCredits(client, { studentId: student.id }));
    const movements = await listMovements(pool, student.id);
    expect(movements[0]?.type).toBe('booking');
    expect(movements[1]?.type).toBe('purchase');

    await pool.query('UPDATE student_packages SET expires_at = $2 WHERE id = $1', [
      pkg.id,
      new Date(Date.now() - DAY),
    ]);
    expect(await hasVigentCredit(pool, student.id)).toBe(false);
  });
});
