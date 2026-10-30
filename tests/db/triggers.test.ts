import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, withTransaction } from '../../packages/db/src/client';
import {
  adjustCredits,
  debitCredits,
  expireDuePackages,
  getBalance,
  listMovements,
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

describe('triggers de créditos', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('calcula saldo y balance_after al insertar movimientos', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 10 });
    const pkg = await createStudentPackage(pool, admin, student, plan);

    const balance = await getBalance(pool, pkg.id);
    expect(balance).toEqual({ balance: 10, sum: 10 });

    const purchase = (await listMovements(pool, student.id)).find(
      (movement) => movement.type === 'purchase',
    );
    expect(purchase).toMatchObject({ delta: 10, balance_after: 10 });

    const adjusted = await adjustCredits(
      pool,
      { studentPackageId: pkg.id, delta: -2, reason: 'Corrección' },
      { id: admin.id, role: 'admin' },
    );
    expect(adjusted.balance).toBe(8);

    const latest = (await listMovements(pool, student.id))[0];
    expect(latest).toMatchObject({ type: 'adjustment', delta: -2, balance_after: 8 });
  });

  it('serializa dos débitos concurrentes sobre el mismo paquete', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 1 });
    const pkg = await createStudentPackage(pool, admin, student, plan);
    const firstSession = await createSession(pool, { instructorId: instructor.id });
    const secondSession = await createSession(pool, { instructorId: instructor.id });
    const firstBooking = await createBooking(pool, {
      sessionId: firstSession.id,
      studentId: student.id,
    });
    const secondBooking = await createBooking(pool, {
      sessionId: secondSession.id,
      studentId: student.id,
    });

    const results = await Promise.allSettled([
      withTransaction(pool, (client) =>
        debitCredits(client, {
          studentId: student.id,
          bookingId: firstBooking.id,
          classSessionId: firstSession.id,
        }),
      ),
      withTransaction(pool, (client) =>
        debitCredits(client, {
          studentId: student.id,
          bookingId: secondBooking.id,
          classSessionId: secondSession.id,
        }),
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await getPackageRow(pool, pkg.id)).balance).toBe(0);
  });

  it('rechaza saldo negativo y no inserta el movimiento', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 10 });
    const pkg = await createStudentPackage(pool, admin, student, plan);

    await expect(
      adjustCredits(
        pool,
        { studentPackageId: pkg.id, delta: -100, reason: 'Imposible' },
        { id: admin.id, role: 'admin' },
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });

    expect((await getPackageRow(pool, pkg.id)).balance).toBe(10);
    expect(await listMovements(pool, student.id)).toHaveLength(1);
  });

  it('impide actualizar y borrar movimientos', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 10 });
    const pkg = await createStudentPackage(pool, admin, student, plan);
    const movement = (await listMovements(pool, student.id))[0]!;

    await expect(
      pool.query('DELETE FROM credit_movements WHERE id = $1', [movement.id]),
    ).rejects.toThrow(/append_only/);

    await expect(
      pool.query('UPDATE credit_movements SET delta = 99 WHERE id = $1', [movement.id]),
    ).rejects.toThrow(/append_only/);

    expect((await getPackageRow(pool, pkg.id)).balance).toBe(10);
    expect(await listMovements(pool, student.id)).toHaveLength(1);
  });

  it('actualiza el estado a agotado y vencido', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 3 });
    const pkg = await createStudentPackage(pool, admin, student, plan);

    const exhausted = await adjustCredits(
      pool,
      { studentPackageId: pkg.id, delta: -3, reason: 'Consumo total' },
      { id: admin.id, role: 'admin' },
    );
    expect(exhausted).toMatchObject({ balance: 0, status: 'exhausted' });

    const expiredPlan = await createPlanAsAdmin(pool, admin, {
      name: 'Plan vencido',
      credits: 3,
      validityDays: 30,
    });
    const expiredPackage = await createStudentPackage(
      pool,
      admin,
      student,
      expiredPlan,
      new Date(Date.now() - 40 * DAY),
    );
    expect(expiredPackage.status).toBe('expired');

    await expireDuePackages(pool);
    const writtenOff = await getPackageRow(pool, expiredPackage.id);
    expect(writtenOff).toMatchObject({ balance: 0, status: 'expired' });
  });
});
