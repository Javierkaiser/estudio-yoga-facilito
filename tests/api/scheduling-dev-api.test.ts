import { DateTime } from 'luxon';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../apps/api/src/server';
import { createPool } from '../../packages/db/src/client';
import { truncateAll } from '../../packages/testing/src/factories';

const pool = createPool(process.env.DATABASE_URL);
const app = buildServer(pool, { enableDevRoutes: true, serveWeb: false });
const ZONE = 'America/Argentina/Buenos_Aires';

async function request(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const response = await app.inject({ method, url, payload });
  return { status: response.statusCode, body: response.json() };
}

async function futureTuesday(): Promise<DateTime> {
  let cursor = DateTime.now().setZone(ZONE).startOf('day').plus({ days: 1 });
  while (cursor.weekday !== 2) {
    cursor = cursor.plus({ days: 1 });
  }
  return cursor;
}

describe('API de desarrollo de clases', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('crea instructoras demo, plantilla, sesiones y permite editarlas y cancelarlas', async () => {
    const empty = await request('GET', '/api/dev/scheduling/overview');
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ templates: [], instructors: [], sessions: [] });

    const demo = await request('POST', '/api/dev/scheduling/demo-instructors');
    expect(demo.status).toBe(200);
    expect(demo.body.instructors).toHaveLength(2);
    const instructor = demo.body.instructors[0];

    const invalid = await request('POST', '/api/dev/scheduling/templates', {
      weekday: 2,
      startTime: '18:00',
      durationMinutes: 60,
      capacity: 0,
      instructorId: instructor.id,
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');

    const created = await request('POST', '/api/dev/scheduling/templates', {
      weekday: 2,
      startTime: '18:00',
      durationMinutes: 60,
      capacity: 12,
      instructorId: instructor.id,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ weekday: 2, capacity: 12, instructor_id: instructor.id });

    const tuesday = await futureTuesday();
    const generated = await request(
      'POST',
      `/api/dev/scheduling/templates/${created.body.id}/generate`,
      {
        from: tuesday.toISODate(),
        to: tuesday.plus({ days: 27 }).toISODate(),
      },
    );
    expect(generated.status).toBe(200);
    expect(generated.body).toEqual({ created: 4, skipped: 0 });

    const overview = await request('GET', '/api/dev/scheduling/overview');
    expect(overview.body.sessions).toHaveLength(4);
    const first = overview.body.sessions[0];
    expect(first).toMatchObject({
      instructor_name: instructor.name,
      status: 'scheduled',
      capacity: 12,
      occupied: 0,
      waitlisted: 0,
      available: 12,
    });
    expect(first.starts_at).toBe(`${tuesday.toISODate()}T21:00:00.000Z`);

    const edited = await request('PATCH', `/api/dev/scheduling/sessions/${first.id}`, {
      capacity: 14,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.session.capacity).toBe(14);
    expect(edited.body.promoted).toBeNull();

    const cancelled = await request('POST', `/api/dev/scheduling/sessions/${first.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toEqual({ refunded: 0, notified: 0, alreadyCancelled: false });

    const again = await request('POST', `/api/dev/scheduling/sessions/${first.id}/cancel`);
    expect(again.body).toEqual({ refunded: 0, notified: 0, alreadyCancelled: true });

    const after = await request('GET', '/api/dev/scheduling/overview');
    expect(after.body.sessions[0].status).toBe('cancelled');
  });

  it('rechaza rangos invertidos y plantillas inexistentes', async () => {
    const demo = await request('POST', '/api/dev/scheduling/demo-instructors');
    const instructor = demo.body.instructors[0];
    const created = await request('POST', '/api/dev/scheduling/templates', {
      weekday: 2,
      startTime: '18:00',
      durationMinutes: 60,
      capacity: 12,
      instructorId: instructor.id,
    });

    const inverted = await request(
      'POST',
      `/api/dev/scheduling/templates/${created.body.id}/generate`,
      { from: '2026-12-01', to: '2026-11-01' },
    );
    expect(inverted.status).toBe(400);
    expect(inverted.body.code).toBe('VALIDATION_ERROR');

    const missingTemplate = await request('POST', '/api/dev/scheduling/templates', {
      weekday: 2,
      startTime: '18:00',
      durationMinutes: 60,
      capacity: 12,
      instructorId: '00000000-0000-0000-0000-000000000000',
    });
    expect(missingTemplate.status).toBe(400);
    expect(missingTemplate.body.code).toBe('VALIDATION_ERROR');
  });
});
