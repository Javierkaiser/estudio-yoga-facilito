import 'dotenv/config';
import { loadEnv } from '../../shared/src/env';
import { createPool } from './client';
import { runMigrations } from './migrate';

const env = loadEnv();
const pool = createPool(env.DATABASE_URL);

try {
  const result = await runMigrations(pool);
  console.log(
    `Migraciones: ${result.applied.length} aplicadas, ${result.skipped.length} ya estaban aplicadas.`,
  );
  for (const file of result.applied) {
    console.log(`  + ${file}`);
  }
} finally {
  await pool.end();
}
