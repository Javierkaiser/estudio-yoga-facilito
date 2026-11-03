import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool } from '../../packages/db/src/client';
import { createTemplate, listTemplates, updateTemplate } from '../../packages/core/src/scheduling';
import { createAdmin, createStaff, truncateAll } from '../../packages/testing/src/factories';

const pool = createPool(process.env.DATABASE_URL);

describe('plantillas de clases', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('crea una plantilla con instructora activa', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool, { role: 'instructor', name: 'Ana' });

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

    expect(template).toMatchObject({
      weekday: 2,
      duration_minutes: 60,
      capacity: 12,
      instructor_id: instructor.id,
      active: true,
    });
    expect(await listTemplates(pool)).toHaveLength(1);
  });

  it('rechaza cupos, duraciones e instructoras inválidas', async () => {
    const admin = await createAdmin(pool);
    const adminInstructor = await createStaff(pool, { role: 'admin', name: 'Otra' });
    const instructor = await createStaff(pool, { role: 'instructor' });

    await expect(
      createTemplate(
        pool,
        {
          weekday: 2,
          startTime: '18:00',
          durationMinutes: 60,
          capacity: 0,
          instructorId: instructor.id,
        },
        { id: admin.id, role: 'admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      createTemplate(
        pool,
        {
          weekday: 2,
          startTime: '18:00',
          durationMinutes: 0,
          capacity: 12,
          instructorId: instructor.id,
        },
        { id: admin.id, role: 'admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      createTemplate(
        pool,
        {
          weekday: 2,
          startTime: '18:00',
          durationMinutes: 60,
          capacity: 12,
          instructorId: adminInstructor.id,
        },
        { id: admin.id, role: 'admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('solo la administradora puede crear o editar plantillas', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool, { role: 'instructor' });

    await expect(
      createTemplate(
        pool,
        {
          weekday: 2,
          startTime: '18:00',
          durationMinutes: 60,
          capacity: 12,
          instructorId: instructor.id,
        },
        { id: instructor.id, role: 'instructor' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

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

    await expect(
      updateTemplate(
        pool,
        template.id,
        { capacity: 14 },
        { id: instructor.id, role: 'instructor' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('edita una plantilla sin modificar sesiones ya generadas', async () => {
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

    const updated = await updateTemplate(
      pool,
      template.id,
      { capacity: 15, startTime: '19:00' },
      { id: admin.id, role: 'admin' },
    );

    expect(updated).toMatchObject({ capacity: 15, start_time: '19:00:00' });
  });
});
