import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../apps/api/src/server';
import { createPool } from '../../packages/db/src/client';
import { truncateAll } from '../../packages/testing/src/factories';

const pool = createPool(process.env.DATABASE_URL);
const app = buildServer(pool, { enableDevRoutes: true });

async function request(
  method: 'GET' | 'POST',
  url: string,
  payload?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const response = await app.inject({ method, url, payload });
  return { status: response.statusCode, body: response.json() };
}

describe('API de desarrollo del ledger', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('permite crear estudiantes, planes, compras y ajustes y ver el historial', async () => {
    const empty = await request('GET', '/api/dev/ledger/overview');
    expect(empty.status).toBe(200);
    expect(empty.body.students).toEqual([]);
    expect(empty.body.plans).toEqual([]);
    expect(empty.body.totals).toMatchObject({
      students: 0,
      active_packages: 0,
      total_balance: 0,
      movements: 0,
    });

    const studentResponse = await request('POST', '/api/dev/ledger/students', {
      name: 'Estudiante Demo',
      phone: '+5491123456789',
      email: 'demo@example.com',
      whatsappConsent: true,
    });
    expect(studentResponse.status).toBe(201);
    const student = studentResponse.body;

    const planResponse = await request('POST', '/api/dev/ledger/plans', {
      name: 'Plan de 10 clases',
      credits: 10,
      validityDays: 90,
    });
    expect(planResponse.status).toBe(201);
    const plan = planResponse.body;

    const purchaseResponse = await request('POST', '/api/dev/ledger/purchases', {
      studentId: student.id,
      planId: plan.id,
    });
    expect(purchaseResponse.status).toBe(201);
    expect(purchaseResponse.body).toMatchObject({ balance: 10, status: 'active' });
    const studentPackage = purchaseResponse.body;

    const detail = await request('GET', `/api/dev/ledger/students/${student.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.packages).toHaveLength(1);
    expect(detail.body.movements).toHaveLength(1);
    expect(detail.body.movements[0]).toMatchObject({ type: 'purchase', delta: 10 });

    const adjustmentResponse = await request('POST', '/api/dev/ledger/adjustments', {
      packageId: studentPackage.id,
      delta: 2,
      reason: 'Compensación de bienvenida',
    });
    expect(adjustmentResponse.status).toBe(200);
    expect(adjustmentResponse.body.balance).toBe(12);

    const overview = await request('GET', '/api/dev/ledger/overview');
    expect(overview.body.students).toHaveLength(1);
    expect(overview.body.students[0]).toMatchObject({
      name: 'Estudiante Demo',
      total_balance: 12,
      active_packages: 1,
    });
    expect(overview.body.totals).toMatchObject({
      students: 1,
      active_packages: 1,
      total_balance: 12,
      movements: 2,
    });

    const expire = await request('POST', '/api/dev/ledger/expire');
    expect(expire.status).toBe(200);
    expect(expire.body).toHaveProperty('processed');
  });

  it('devuelve errores de validación y conflictos entendibles', async () => {
    const invalidPhone = await request('POST', '/api/dev/ledger/students', {
      name: 'Sin teléfono válido',
      phone: '123',
    });
    expect(invalidPhone.status).toBe(400);
    expect(invalidPhone.body.code).toBe('VALIDATION_ERROR');

    const created = await request('POST', '/api/dev/ledger/students', {
      name: 'Estudiante Uno',
      phone: '+5491199999999',
      email: 'unica@example.com',
    });
    expect(created.status).toBe(201);

    const duplicate = await request('POST', '/api/dev/ledger/students', {
      name: 'Estudiante Dos',
      phone: '+5491199999999',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('DUPLICATE_STUDENT');

    const plan = await request('POST', '/api/dev/ledger/plans', {
      name: 'Plan',
      credits: 5,
    });
    const purchase = await request('POST', '/api/dev/ledger/purchases', {
      studentId: created.body.id,
      planId: plan.body.id,
    });

    const missingReason = await request('POST', '/api/dev/ledger/adjustments', {
      packageId: purchase.body.id,
      delta: 1,
    });
    expect(missingReason.status).toBe(400);
    expect(missingReason.body.code).toBe('VALIDATION_ERROR');
  });
});
