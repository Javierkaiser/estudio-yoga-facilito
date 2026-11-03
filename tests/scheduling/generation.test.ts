import { DateTime } from 'luxon';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, queryRows } from '../../packages/db/src/client';
import {
  createTemplate,
  generateSessions,
  listSessions,
  updateTemplate,
} from '../../packages/core/src/scheduling';
import { createAdmin, createStaff, truncateAll } from '../../packages/testing/src/factories';

const pool = createPool(process.env.DATABASE_URL);
const ZONE = 'America/Argentina/Buenos_Aires';

async function futureTuesday(): Promise<DateTime> {
  let cursor = DateTime.now().setZone(ZONE).startOf('day').plus({ days: 1 });
  while (cursor.weekday !== 2) {
    cursor = cursor.plus({ days: 1 });
  }
  return cursor;
}

describe('generación de sesiones', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('genera cuatro martes a las 21:00 UTC y no duplica al regenerar', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool, { role: 'instructor' });
    const template = await createTemplate(
      pool,
      {
        weekday: 2,
        startTime: '18:00',
        durationMinutes: 60,
        capacity: 12,
        instructorId: instructor.id,
      },
      { id: admin.id, role: 'admin' },
    );

    const firstTuesday = await futureTuesday();
    const from = firstTuesday.toISODate()!;
    const to = firstTuesday.plus({ days: 27 }).toISODate()!;

    const first = await generateSessions(
      pool,
      { templateId: template.id, from, to },
      { id: admin.id, role: 'admin' },
    );
    expect(first).toEqual({ created: 4, skipped: 0 });

    const sessions = await queryRows<{ starts_at: Date }>(
      pool,
      'SELECT starts_at FROM class_sessions ORDER BY starts_at',
    );
    expect(sessions).toHaveLength(4);
    for (const session of sessions) {
      const startsAt = new Date(session.starts_at);
      expect(startsAt.getUTCHours()).toBe(21);
      expect(startsAt.getUTCMinutes()).toBe(0);
    }

    const second = await generateSessions(
      pool,
      { templateId: template.id, from, to },
      { id: admin.id, role: 'admin' },
    );
    expect(second).toEqual({ created: 0, skipped: 4 });
    expect(await queryRows(pool, 'SELECT id FROM class_sessions')).toHaveLength(4);
  });

  it('omite fechas pasadas', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool, { role: 'instructor' });
    const template = await createTemplate(
      pool,
      {
        weekday: 2,
        startTime: '18:00',
        durationMinutes: 60,
        capacity: 12,
        instructorId: instructor.id,
      },
      { id: admin.id, role: 'admin' },
    );

    const tuesday = await futureTuesday();
    const result = await generateSessions(
      pool,
      {
        templateId: template.id,
        from: tuesday.minus({ weeks: 2 }).toISODate()!,
        to: tuesday.plus({ weeks: 1 }).toISODate()!,
      },
      { id: admin.id, role: 'admin' },
    );

    expect(result.created).toBeGreaterThan(0);
    expect(result.skipped).toBeGreaterThan(0);
    const sessions = await listSessions(pool, {
      from: new Date(),
      to: new Date(Date.now() + 60 * 86400000),
    });
    expect(sessions.every((session) => new Date(session.starts_at) > new Date())).toBe(true);
  });

  it('las sesiones conservan el snapshot al cambiar la plantilla', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool, { role: 'instructor' });
    const template = await createTemplate(
      pool,
      {
        weekday: 2,
        startTime: '18:00',
        durationMinutes: 60,
        capacity: 12,
        instructorId: instructor.id,
      },
      { id: admin.id, role: 'admin' },
    );
    const tuesday = await futureTuesday();
    await generateSessions(
      pool,
      { templateId: template.id, from: tuesday.toISODate()!, to: tuesday.toISODate()! },
      { id: admin.id, role: 'admin' },
    );

    await updateTemplate(pool, template.id, { capacity: 15 }, { id: admin.id, role: 'admin' });

    const sessions = await listSessions(pool, {
      from: tuesday.toJSDate(),
      to: tuesday.plus({ days: 1 }).toJSDate(),
    });
    expect(sessions[0]?.capacity).toBe(12);
  });
});
