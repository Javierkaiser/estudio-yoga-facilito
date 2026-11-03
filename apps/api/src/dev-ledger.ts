import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { DomainError } from '../../../packages/core/src/errors';
import {
  adjustCredits,
  createPlan,
  expireDuePackages,
  getLedgerTotals,
  listMovements,
  listPackages,
  listPlans,
  listStudentLedgerSummaries,
  purchasePackage,
} from '../../../packages/core/src/ledger';
import { createStudent, getStudent } from '../../../packages/core/src/students';
import { queryOne } from '../../../packages/db/src/client';
import type { StaffActor, StaffUserRow } from '../../../packages/core/src/types';

const studentSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio'),
  phone: z.string().trim().min(1, 'El teléfono es obligatorio'),
  email: z.string().trim().email('El email no es válido').optional().or(z.literal('')),
  whatsappConsent: z.boolean().optional(),
});

const planSchema = z.object({
  name: z.string().trim().min(1, 'El nombre del plan es obligatorio'),
  credits: z.number().int().positive('Los créditos deben ser positivos'),
  validityDays: z.number().int().positive('La vigencia debe ser positiva').nullable().optional(),
});

const purchaseSchema = z.object({
  studentId: z.string().uuid('Estudiante inválido'),
  planId: z.string().uuid('Plan inválido'),
});

const adjustmentSchema = z.object({
  packageId: z.string().uuid('Paquete inválido'),
  delta: z
    .number()
    .int()
    .refine((value) => value !== 0, 'El ajuste debe ser distinto de cero'),
  reason: z.string().trim().min(1, 'El motivo es obligatorio'),
});

const idParams = z.object({
  id: z.string().uuid('Identificador inválido'),
});

export async function getDevAdmin(pool: Pool): Promise<StaffActor> {
  const existing = await queryOne<StaffUserRow>(
    pool,
    `SELECT *
       FROM staff_users
      WHERE active = true AND role = 'admin'
      ORDER BY created_at ASC
      LIMIT 1`,
  );
  if (existing) {
    return { id: existing.id, role: 'admin' };
  }

  const inserted = await queryOne<StaffUserRow>(
    pool,
    `INSERT INTO staff_users (name, email, password_hash, role, active)
     VALUES ('Modo desarrollo', 'dev-admin@local', 'dev-only-no-login', 'admin', true)
     ON CONFLICT DO NOTHING
     RETURNING *`,
  );
  if (inserted) {
    return { id: inserted.id, role: 'admin' };
  }

  const fallback = await queryOne<StaffUserRow>(
    pool,
    `SELECT * FROM staff_users WHERE lower(email) = 'dev-admin@local' LIMIT 1`,
  );
  if (!fallback) {
    throw new Error('No se pudo preparar la administradora de desarrollo');
  }
  return { id: fallback.id, role: 'admin' };
}

export function registerDevLedgerRoutes(app: FastifyInstance, pool: Pool): void {
  app.get('/api/dev/ledger/overview', async () => {
    const [students, plans, totals] = await Promise.all([
      listStudentLedgerSummaries(pool),
      listPlans(pool),
      getLedgerTotals(pool),
    ]);
    return { students, plans, totals };
  });

  app.get('/api/dev/ledger/students/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const student = await getStudent(pool, id);
    if (!student) {
      throw new DomainError('STUDENT_NOT_FOUND', 'El estudiante no existe');
    }

    const [packages, movements] = await Promise.all([
      listPackages(pool, id),
      listMovements(pool, id, { limit: 100 }),
    ]);

    return { student, packages, movements };
  });

  app.post('/api/dev/ledger/students', async (request, reply) => {
    const input = studentSchema.parse(request.body);
    const student = await createStudent(pool, {
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      whatsappConsent: input.whatsappConsent,
    });
    return reply.status(201).send(student);
  });

  app.post('/api/dev/ledger/plans', async (request, reply) => {
    const input = planSchema.parse(request.body);
    const plan = await createPlan(
      pool,
      {
        name: input.name,
        credits: input.credits,
        validityDays: input.validityDays,
      },
      await getDevAdmin(pool),
    );
    return reply.status(201).send(plan);
  });

  app.post('/api/dev/ledger/purchases', async (request, reply) => {
    const input = purchaseSchema.parse(request.body);
    const pkg = await purchasePackage(
      pool,
      { studentId: input.studentId, planId: input.planId },
      await getDevAdmin(pool),
    );
    return reply.status(201).send(pkg);
  });

  app.post('/api/dev/ledger/adjustments', async (request) => {
    const input = adjustmentSchema.parse(request.body);
    return adjustCredits(
      pool,
      {
        studentPackageId: input.packageId,
        delta: input.delta,
        reason: input.reason,
      },
      await getDevAdmin(pool),
    );
  });

  app.post('/api/dev/ledger/expire', async () => {
    return expireDuePackages(pool);
  });
}
