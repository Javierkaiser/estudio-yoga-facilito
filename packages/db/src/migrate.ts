import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Pool } from 'pg';

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function runMigrations(
  pool: Pool,
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
): Promise<MigrationResult> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  const existing = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
  const alreadyApplied = new Set(existing.rows.map((row) => row.version));

  for (const file of files) {
    if (alreadyApplied.has(file)) {
      skipped.push(file);
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    } finally {
      client.release();
    }
  }

  return { applied, skipped };
}
