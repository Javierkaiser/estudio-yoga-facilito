import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, queryRows } from '../../packages/db/src/client';
import { completeSessions, editSession, listSessions } from '../../packages/core/src/scheduling';
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

describe('edición de sesiones', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('calcula disponibilidad incluyendo confirmadas y ofrecidas', async () => {
    const instructor = await createStaff(pool, { role: 'instructor' });
    const session = await createSession(pool, {
      instructorId: instructor.id,
      capacity: 12,
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    for (let index = 0; index < 5; index += 1) {
      const student = await createStudent(pool);
      await createBooking(pool, { sessionId: session.id, studentId: student.id });
    }

    const [listed] = await listSessions(pool, {
      from: new Date(),
      to: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });

    expect(listed).toMatchObject({ occupied: 5, available: 7, waitlisted: 0 });
  });

  it('rechaza reducir el cupo por debajo de las reservas ocupadas', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool, { role: 'instructor' });
    const session = await createSession(pool, {
      instructorId: instructor.id,
      capacity: 12,
    });

    for (let index = 0; index < 10; index += 1) {
      const student = await createStudent(pool);
      await createBooking(pool, { sessionId: session.id, studentId: student.id });
    }

    await expect(
      editSession(pool, { sessionId: session.id, capacity: 8 }, { id: admin.id, role: 'admin' }),
    ).rejects.toMatchObject({ code: 'CAPACITY_TOO_LOW' });

    const [current] = await listSessions(pool);
    expect(current?.capacity).toBe(12);
  });

  it('al aumentar el cupo ofrece el lugar a la primera persona elegible de la espera', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool, { role: 'instructor' });
    const session = await createSession(pool, {
      instructorId: instructor.id,
      capacity: 12,
    });

    for (let index = 0; index < 12; index += 1) {
      const student = await createStudent(pool);
      await createBooking(pool, { sessionId: session.id, studentId: student.id });
    }

    const waitingStudent = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 10 });
    await createStudentPackage(pool, admin, waitingStudent, plan);
    const waiting = await createBooking(pool, {
      sessionId: session.id,
      studentId: waitingStudent.id,
      status: 'waitlisted',
    });

    const result = await editSession(
      pool,
      { sessionId: session.id, capacity: 13 },
      { id: admin.id, role: 'admin' },
    );

    expect(result.session.capacity).toBe(13);
    expect(result.promoted).toMatchObject({ id: waiting.id, status: 'offered' });

    const notifications = await queryRows<{ count: string }>(
      pool,
      `SELECT count(*)::text AS count
         FROM notifications
        WHERE event = 'spot_offered'`,
    );
    expect(notifications[0]?.count).toBe('1');
  });

  it('rechaza editar una sesión que ya comenzó', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool, { role: 'instructor' });
    const session = await createSession(pool, {
      instructorId: instructor.id,
      capacity: 12,
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    await expect(
      editSession(pool, { sessionId: session.id, capacity: 13 }, { id: admin.id, role: 'admin' }),
    ).rejects.toMatchObject({ code: 'SESSION_STARTED' });
  });

  it('cierra sesiones terminadas de forma idempotente', async () => {
    const instructor = await createStaff(pool, { role: 'instructor' });
    const session = await createSession(pool, {
      instructorId: instructor.id,
      startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      durationMinutes: 60,
    });

    expect(await completeSessions(pool)).toBe(1);
    expect(await completeSessions(pool)).toBe(0);

    const rows = await queryRows<{ status: string }>(
      pool,
      'SELECT status FROM class_sessions WHERE id = $1',
      [session.id],
    );
    expect(rows[0]?.status).toBe('completed');
  });
});
