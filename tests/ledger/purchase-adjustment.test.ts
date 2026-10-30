import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool } from '../../packages/db/src/client';
import {
  adjustCredits,
  createPlan,
  listMovements,
  purchasePackage,
} from '../../packages/core/src/ledger';
import {
  adminActor,
  createAdmin,
  createStaff,
  createStudent,
  getPackageRow,
  truncateAll,
} from '../../packages/testing/src/factories';

const pool = createPool(process.env.DATABASE_URL);
const DAY = 24 * 60 * 60 * 1000;

describe('planes, compras y ajustes', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('crea un plan con vigencia por defecto de 90 días', async () => {
    const admin = await createAdmin(pool);
    const plan = await createPlan(
      pool,
      { name: 'Plan de 10 clases', credits: 10 },
      adminActor(admin),
    );

    expect(plan).toMatchObject({ credits: 10, validity_days: 90, active: true });
  });

  it('permite un plan sin vencimiento', async () => {
    const admin = await createAdmin(pool);
    const plan = await createPlan(
      pool,
      { name: 'Plan libre', credits: 5, validityDays: null },
      adminActor(admin),
    );

    expect(plan.validity_days).toBeNull();
  });

  it('rechaza planes inválidos', async () => {
    const admin = await createAdmin(pool);

    await expect(
      createPlan(pool, { name: 'Cero', credits: 0 }, adminActor(admin)),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      createPlan(pool, { name: 'Vigencia', credits: 1, validityDays: 0 }, adminActor(admin)),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('solo la administradora crea planes, paquetes y ajustes', async () => {
    const admin = await createAdmin(pool);
    const instructor = await createStaff(pool, { role: 'instructor' });
    const student = await createStudent(pool);
    const plan = await createPlan(pool, { name: 'Plan', credits: 10 }, adminActor(admin));

    await expect(
      createPlan(pool, { name: 'Plan instructor', credits: 10 }, instructor),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      purchasePackage(pool, { studentId: student.id, planId: plan.id }, instructor),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const pkg = await purchasePackage(
      pool,
      { studentId: student.id, planId: plan.id },
      adminActor(admin),
    );

    await expect(
      adjustCredits(
        pool,
        { studentPackageId: pkg.id, delta: 1, reason: 'Intento' },
        instructor,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('registra la compra con saldo inicial, vencimiento y movimiento de compra', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlan(pool, { name: 'Plan', credits: 10 }, adminActor(admin));
    const purchasedAt = new Date(Date.now() - 10 * DAY);

    const pkg = await purchasePackage(
      pool,
      { studentId: student.id, planId: plan.id, purchasedAt },
      adminActor(admin),
    );

    expect(pkg.credits_purchased).toBe(10);
    expect(pkg.balance).toBe(10);
    expect(pkg.status).toBe('active');
    expect(pkg.expires_at?.getTime()).toBe(purchasedAt.getTime() + 90 * DAY);

    const movements = await listMovements(pool, student.id);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: 'purchase',
      delta: 10,
      balance_after: 10,
      actor_type: 'staff',
      actor_id: admin.id,
    });
  });

  it('registra una compra sin vencimiento', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlan(
      pool,
      { name: 'Plan libre', credits: 4, validityDays: null },
      adminActor(admin),
    );

    const pkg = await purchasePackage(
      pool,
      { studentId: student.id, planId: plan.id },
      adminActor(admin),
    );

    expect(pkg.expires_at).toBeNull();
  });

  it('ajusta créditos con motivo y rechaza ajustes inválidos', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlan(pool, { name: 'Plan', credits: 10 }, adminActor(admin));
    const pkg = await purchasePackage(
      pool,
      { studentId: student.id, planId: plan.id },
      adminActor(admin),
    );

    const increased = await adjustCredits(
      pool,
      { studentPackageId: pkg.id, delta: 2, reason: 'Compensación' },
      adminActor(admin),
    );
    expect(increased.balance).toBe(12);

    const decreased = await adjustCredits(
      pool,
      { studentPackageId: pkg.id, delta: -1, reason: 'Corrección' },
      adminActor(admin),
    );
    expect(decreased.balance).toBe(11);

    await expect(
      adjustCredits(
        pool,
        { studentPackageId: pkg.id, delta: 1, reason: '   ' },
        adminActor(admin),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      adjustCredits(
        pool,
        { studentPackageId: pkg.id, delta: -100, reason: 'Imposible' },
        adminActor(admin),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });

    expect((await getPackageRow(pool, pkg.id)).balance).toBe(11);

    const movement = (await listMovements(pool, student.id))[0];
    expect(movement).toMatchObject({
      type: 'adjustment',
      delta: -1,
      reason: 'Corrección',
      actor_type: 'staff',
      actor_id: admin.id,
    });
  });

  it('rechaza compras de estudiantes o planes inexistentes', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlan(pool, { name: 'Plan', credits: 10 }, adminActor(admin));

    await expect(
      purchasePackage(
        pool,
        { studentId: '00000000-0000-0000-0000-000000000000', planId: plan.id },
        adminActor(admin),
      ),
    ).rejects.toMatchObject({ code: 'STUDENT_NOT_FOUND' });

    await expect(
      purchasePackage(
        pool,
        { studentId: student.id, planId: '00000000-0000-0000-0000-000000000000' },
        adminActor(admin),
      ),
    ).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND' });
  });
});
