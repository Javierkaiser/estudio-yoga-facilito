import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../packages/db/src/client';

const pool = createPool(process.env.DATABASE_URL);

describe('arranque de PostgreSQL de test', () => {
  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('usa la base de test configurada y creada desde cero', async () => {
    const result = await pool.query<{ current_database: string }>('SELECT current_database()');
    const expected = new URL(process.env.DATABASE_URL ?? '').pathname.replace(/^\//, '');
    expect(result.rows[0]?.current_database).toBe(expected);
  });

  it('aplica la migración inicial', async () => {
    const migrations = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
    expect(migrations.rows.map((row) => row.version)).toContain('0001_init.sql');

    const table = await pool.query<{ regclass: string | null }>(
      `SELECT to_regclass('public.credit_movements')::text AS regclass`,
    );
    expect(table.rows[0]?.regclass).toBe('credit_movements');
  });

  it('bloquea cualquier llamada de red', () => {
    expect(() => fetch('https://example.com')).toThrow(/Network access is disabled/);
  });
});
