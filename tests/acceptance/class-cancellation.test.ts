import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, queryOne, queryRows, withTransaction } from '../../packages/db/src/client';
import { debitCredits } from '../../packages/core/src/ledger';
import { cancelClass } from '../../packages/core/src/scheduling';
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

describe('aceptación: cancelación de clase', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('con 12 inscriptas registra 12 devoluciones y 12 avisos pendientes sin red', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool, { role: 'instructor', name: 'Ana' });
    const plan = await createPlanAsAdmin(pool, admin, { credits: 10 });
    const session = await createSession(pool, {
      instructorId: instructor.id,
      capacity: 12,
    });

    for (let index = 0; index < 12; index += 1) {
      const student = await createStudent(pool);
      const pkg = await createStudentPackage(pool, admin, student, plan);
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

      expect(pkg.balance).toBe(10);
    }

    const result = await cancelClass(pool, {
      sessionId: session.id,
      actor: { id: instructor.id, role: 'instructor' },
    });

    expect(result).toEqual({ refunded: 12, notified: 12, alreadyCancelled: false });

    const sessionRow = await queryOne<{ status: string }>(
      pool,
      'SELECT status FROM class_sessions WHERE id = $1',
      [session.id],
    );
    expect(sessionRow?.status).toBe('cancelled');

    const bookings = await queryRows<{ count: string }>(
      pool,
      `SELECT count(*)::text AS count
         FROM bookings
        WHERE session_id = $1 AND status = 'cancelled'`,
      [session.id],
    );
    expect(bookings[0]?.count).toBe('12');

    const notifications = await queryRows<{ count: string }>(
      pool,
      `SELECT count(*)::text AS count
         FROM notifications
        WHERE event = 'class_cancelled' AND status = 'pending'`,
    );
    expect(notifications[0]?.count).toBe('12');

    const balances = await queryRows<{ balance: number }>(
      pool,
      `SELECT balance FROM student_packages ORDER BY created_at`,
    );
    expect(balances.every((row) => row.balance === 10)).toBe(true);

    const again = await cancelClass(pool, {
      sessionId: session.id,
      actor: { id: instructor.id, role: 'instructor' },
    });
    expect(again).toEqual({ refunded: 0, notified: 0, alreadyCancelled: true });

    const after = await queryRows<{ count: string }>(
      pool,
      `SELECT count(*)::text AS count FROM notifications WHERE event = 'class_cancelled'`,
    );
    expect(after[0]?.count).toBe('12');
  });

  it('rechaza que una instructora cancele una clase ajena', async () => {
    const owner = await createStaff(pool, { role: 'instructor', name: 'Ana' });
    const other = await createStaff(pool, { role: 'instructor', name: 'Lucía' });
    const session = await createSession(pool, { instructorId: owner.id });

    await expect(
      cancelClass(pool, {
        sessionId: session.id,
        actor: { id: other.id, role: 'instructor' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const row = await queryOne<{ status: string }>(
      pool,
      'SELECT status FROM class_sessions WHERE id = $1',
      [session.id],
    );
    expect(row?.status).toBe('scheduled');
  });

  it('cancela la espera sin devolver crédito y avisa a todas las afectadas', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool, { role: 'instructor' });
    const plan = await createPlanAsAdmin(pool, admin, { credits: 10 });
    const session = await createSession(pool, {
      instructorId: instructor.id,
      capacity: 1,
    });

    const confirmedStudent = await createStudent(pool);
    await createStudentPackage(pool, admin, confirmedStudent, plan);
    const confirmedBooking = await createBooking(pool, {
      sessionId: session.id,
      studentId: confirmedStudent.id,
    });
    await withTransaction(pool, (client) =>
      debitCredits(client, {
        studentId: confirmedStudent.id,
        bookingId: confirmedBooking.id,
        classSessionId: session.id,
      }),
    );

    const waitingStudent = await createStudent(pool);
    const waitingBooking = await createBooking(pool, {
      sessionId: session.id,
      studentId: waitingStudent.id,
      status: 'waitlisted',
    });

    const result = await cancelClass(pool, {
      sessionId: session.id,
      actor: { id: admin.id, role: 'admin' },
    });

    expect(result).toEqual({ refunded: 1, notified: 2, alreadyCancelled: false });

    const waitingRefunds = await queryRows<{ count: string }>(
      pool,
      `SELECT count(*)::text AS count
         FROM credit_movements
        WHERE booking_id = $1`,
      [waitingBooking.id],
    );
    expect(waitingRefunds[0]?.count).toBe('0');

    const notifications = await queryRows<{ count: string }>(
      pool,
      `SELECT count(*)::text AS count
         FROM notifications
        WHERE event = 'class_cancelled'`,
    );
    expect(notifications[0]?.count).toBe('2');
  });
});
