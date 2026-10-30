import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, queryRows } from '../../packages/db/src/client';
import {
  getBalance,
  listMovements,
} from '../../packages/core/src/ledger';
import {
  createAdmin,
  createPlanAsAdmin,
  createStudent,
  createStudentPackage,
  getPackageRow,
  truncateAll,
} from '../../packages/testing/src/factories';

const pool = createPool(process.env.DATABASE_URL);

describe('aceptación: historial append-only', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('rechaza borrar o editar un movimiento y no altera el saldo', async () => {
    const admin = await createAdmin(pool);
    const student = await createStudent(pool);
    const plan = await createPlanAsAdmin(pool, admin, { credits: 10 });
    const pkg = await createStudentPackage(pool, admin, student, plan);
    const movement = (await listMovements(pool, student.id))[0]!;

    await expect(
      pool.query('DELETE FROM credit_movements WHERE id = $1', [movement.id]),
    ).rejects.toThrow(/append_only/);

    await expect(
      pool.query('UPDATE credit_movements SET delta = 99 WHERE id = $1', [movement.id]),
    ).rejects.toThrow(/append_only/);

    const rows = await queryRows<{ count: string }>(
      pool,
      'SELECT count(*)::text AS count FROM credit_movements WHERE id = $1',
      [movement.id],
    );
    expect(rows[0]?.count).toBe('1');

    const balance = await getBalance(pool, pkg.id);
    expect(balance).toEqual({ balance: 10, sum: 10 });
    expect((await getPackageRow(pool, pkg.id)).balance).toBe(10);
  });
});
