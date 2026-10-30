import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, withTransaction } from '../../packages/db/src/client';
import { debitCredits, refundForBooking } from '../../packages/core/src/ledger';
import {
  createAdmin,
  createBooking,
  createSession,
  createStaff,
  createStudent,
  createStudentPackage,
  createPlanAsAdmin,
  getPackageRow,
  truncateAll,
} from '../../packages/testing/src/factories';

const pool = createPool(process.env.DATABASE_URL);

describe('restricciones de base de datos', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('rechaza teléfonos y emails duplicados', async () => {
    await createStudent(pool, { phone: '+5491122223333', email: 'unica@example.com' });

    await expect(createStudent(pool, { phone: '+5491122223333' })).rejects.toThrow();
    await expect(createStudent(pool, { email: 'unica@example.com' })).rejects.toThrow();
  });

  it('permite una sola reserva activa por estudiante y sesión', async () => {
    const instructor = await createStaff(pool);
    const session = await createSession(pool, { instructorId: instructor.id });
    const student = await createStudent(pool);

    await createBooking(pool, { sessionId: session.id, studentId: student.id });
    await expect(
      createBooking(pool, { sessionId: session.id, studentId: student.id }),
    ).rejects.toThrow();
  });

  it('permite volver a reservar después de cancelar', async () => {
    const instructor = await createStaff(pool);
    const session = await createSession(pool, { instructorId: instructor.id });
    const student = await createStudent(pool);

    await createBooking(pool, {
      sessionId: session.id,
      studentId: student.id,
      status: 'cancelled',
    });

    await expect(
      createBooking(pool, { sessionId: session.id, studentId: student.id }),
    ).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('rechaza dos débitos o dos devoluciones para la misma reserva', async () => {
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

    await expect(
      pool.query(
        `INSERT INTO credit_movements
           (student_package_id, student_id, type, delta, booking_id, class_session_id, actor_type, actor_id)
         VALUES ($1, $2, 'booking', -1, $3, $4, 'student', $2)`,
        [pkg.id, student.id, booking.id, session.id],
      ),
    ).rejects.toThrow();

    await withTransaction(pool, (client) =>
      refundForBooking(client, { bookingId: booking.id }),
    );

    await expect(
      pool.query(
        `INSERT INTO credit_movements
           (student_package_id, student_id, type, delta, booking_id, class_session_id, actor_type, actor_id)
         VALUES ($1, $2, 'refund', 1, $3, $4, 'system', null)`,
        [pkg.id, student.id, booking.id, session.id],
      ),
    ).rejects.toThrow();

    const updated = await getPackageRow(pool, pkg.id);
    expect(updated.balance).toBe(10);
  });
});
