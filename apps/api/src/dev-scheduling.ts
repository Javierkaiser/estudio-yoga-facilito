import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  cancelClass,
  createTemplate,
  editSession,
  generateSessions,
  listInstructors,
  listSessions,
  listTemplates,
  updateTemplate,
} from '../../../packages/core/src/scheduling';
import { addDays } from '../../../packages/shared/src/time';
import { getDevAdmin } from './dev-ledger';

const templateSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora debe ser HH:mm'),
  durationMinutes: z.number().int().positive(),
  capacity: z.number().int().positive(),
  instructorId: z.string().uuid(),
});

const templatePatchSchema = templateSchema.partial().extend({
  active: z.boolean().optional(),
});

const generateSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser YYYY-MM-DD'),
});

const sessionPatchSchema = z.object({
  capacity: z.number().int().positive().optional(),
  instructorId: z.string().uuid().optional(),
});

const idParams = z.object({ id: z.string().uuid('Identificador inválido') });

export function registerDevSchedulingRoutes(app: FastifyInstance, pool: Pool): void {
  app.get('/api/dev/scheduling/overview', async () => {
    const from = new Date();
    const [templates, instructors, sessions] = await Promise.all([
      listTemplates(pool),
      listInstructors(pool),
      listSessions(pool, { from, to: addDays(from, 56) }),
    ]);

    return { templates, instructors, sessions };
  });

  app.post('/api/dev/scheduling/demo-instructors', async () => {
    await pool.query(
      `INSERT INTO staff_users (name, email, password_hash, role, active)
       VALUES
         ('Ana', 'ana@estudio.local', 'demo-instructor-no-login', 'instructor', true),
         ('Lucía', 'lucia@estudio.local', 'demo-instructor-no-login', 'instructor', true)
       ON CONFLICT DO NOTHING`,
    );
    return { instructors: await listInstructors(pool) };
  });

  app.post('/api/dev/scheduling/templates', async (request, reply) => {
    const input = templateSchema.parse(request.body);
    const template = await createTemplate(pool, input, await getDevAdmin(pool));
    return reply.status(201).send(template);
  });

  app.patch('/api/dev/scheduling/templates/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const input = templatePatchSchema.parse(request.body);
    return updateTemplate(pool, id, input, await getDevAdmin(pool));
  });

  app.post('/api/dev/scheduling/templates/:id/generate', async (request) => {
    const { id } = idParams.parse(request.params);
    const input = generateSchema.parse(request.body);
    return generateSessions(pool, { templateId: id, ...input }, await getDevAdmin(pool));
  });

  app.patch('/api/dev/scheduling/sessions/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const input = sessionPatchSchema.parse(request.body);
    return editSession(pool, { sessionId: id, ...input }, await getDevAdmin(pool));
  });

  app.post('/api/dev/scheduling/sessions/:id/cancel', async (request) => {
    const { id } = idParams.parse(request.params);
    return cancelClass(pool, { sessionId: id, actor: await getDevAdmin(pool) });
  });
}
