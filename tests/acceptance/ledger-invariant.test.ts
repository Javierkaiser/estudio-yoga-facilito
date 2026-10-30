import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, queryRows, withTransaction } from '../../packages/db/src/client';
import {
  adjustCredits,
  debitCredits,
  expireDuePackages,
  getBalance,
  refundForBooking,
} from '../../packages/core/src/ledger';
import type { CreditMovementRow, StudentPackageRow } from '../../packages/core/src/types';
import {
  createAdmin,
  createBooking,
  createPlanAsAdmin,
  createSession,
  createStaff,
  createStudent,
  createStudentPackage,
  truncateAll,
} from '../../packages/testing/src/factories';

const pool = createPool(process.env.DATABASE_URL);
const DAY = 24 * 60 * 60 * 1000;

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('aceptación: invariante del ledger', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('mantiene suma de movimientos, saldo y balance_after tras 100 operaciones', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 10, validityDays: 90 });

    const packages: StudentPackageRow[] = [
      await createStudentPackage(pool, admin, student, plan),
    ];
    const refundable: Array<{ bookingId: string; sessionId: string }> = [];
    const random = mulberry32(20261029);

    for (let operation = 0; operation < 100; operation += 1) {
      const roll = random();

      if (roll < 0.2) {
        const purchased = await createStudentPackage(pool, admin, student, plan);
        packages.push(purchased);
        continue;
      }

      if (roll < 0.45) {
        const session = await createSession(pool, { instructorId: instructor.id });
        const booking = await createBooking(pool, {
          sessionId: session.id,
          studentId: student.id,
        });

        try {
          await withTransaction(pool, (client) =>
            debitCredits(client, {
              studentId: student.id,
              bookingId: booking.id,
              classSessionId: session.id,
            }),
          );
          refundable.push({ bookingId: booking.id, sessionId: session.id });
        } catch (error) {
          expect(error).toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
        }
        continue;
      }

      if (roll < 0.65) {
        const index = Math.floor(random() * refundable.length);
        const candidate = refundable[index];
        if (!candidate) {
          continue;
        }
        refundable.splice(index, 1);
        await withTransaction(pool, (client) =>
          refundForBooking(client, { bookingId: candidate.bookingId }),
        );
        continue;
      }

      if (roll < 0.85) {
        const index = Math.floor(random() * packages.length);
        const target = packages[index];
        if (!target) {
          continue;
        }
        const delta = Math.floor(random() * 7) - 3;
        if (delta === 0) {
          continue;
        }
        try {
          await adjustCredits(
            pool,
            { studentPackageId: target.id, delta, reason: `Ajuste aleatorio ${operation}` },
            { id: admin.id, role: 'admin' },
          );
        } catch (error) {
          expect(error).toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
        }
        continue;
      }

      const index = Math.floor(random() * packages.length);
      const target = packages[index];
      if (!target) {
        continue;
      }
      await pool.query('UPDATE student_packages SET expires_at = $2 WHERE id = $1', [
        target.id,
        new Date(Date.now() - DAY),
      ]);
      await expireDuePackages(pool);
    }

    await expireDuePackages(pool);

    const allPackages = await queryRows<StudentPackageRow>(
      pool,
      'SELECT * FROM student_packages WHERE student_id = $1 ORDER BY created_at, id',
      [student.id],
    );

    expect(allPackages.length).toBeGreaterThan(0);

    for (const pkg of allPackages) {
      const balance = await getBalance(pool, pkg.id);
      expect(balance.balance).toBe(balance.sum);
      expect(balance.balance).toBeGreaterThanOrEqual(0);

      const movements = await queryRows<CreditMovementRow>(
        pool,
        `SELECT * FROM credit_movements
          WHERE student_package_id = $1
          ORDER BY seq ASC`,
        [pkg.id],
      );

      let running = 0;
      for (const movement of movements) {
        running += movement.delta;
        expect(movement.balance_after).toBe(running);
      }
      expect(running).toBe(balance.balance);
    }
  });
});
