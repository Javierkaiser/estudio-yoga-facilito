import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, withTransaction } from '../../packages/db/src/client';
import { debitCredits, getBalance } from '../../packages/core/src/ledger';
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

describe('concurrencia de débitos', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('con un solo crédito, confirma una reserva y rechaza la otra', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 1 });
    const pkg = await createStudentPackage(pool, admin, student, plan);

    const sessionA = await createSession(pool, { instructorId: instructor.id });
    const sessionB = await createSession(pool, { instructorId: instructor.id });
    const bookingA = await createBooking(pool, {
      sessionId: sessionA.id,
      studentId: student.id,
    });
    const bookingB = await createBooking(pool, {
      sessionId: sessionB.id,
      studentId: student.id,
    });

    const results = await Promise.allSettled([
      withTransaction(pool, (client) =>
        debitCredits(client, {
          studentId: student.id,
          bookingId: bookingA.id,
          classSessionId: sessionA.id,
        }),
      ),
      withTransaction(pool, (client) =>
        debitCredits(client, {
          studentId: student.id,
          bookingId: bookingB.id,
          classSessionId: sessionB.id,
        }),
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
    });

    const updated = await getPackageRow(pool, pkg.id);
    expect(updated.balance).toBe(0);
    expect(updated.status).toBe('exhausted');

    const balance = await getBalance(pool, pkg.id);
    expect(balance).toEqual({ balance: 0, sum: 0 });
  });
});
