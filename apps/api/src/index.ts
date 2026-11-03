import 'dotenv/config';
import { createPool } from '../../../packages/db/src/client';
import { loadEnv } from '../../../packages/shared/src/env';
import { buildServer } from './server';

const env = loadEnv();
const pool = createPool(env.DATABASE_URL);
const app = buildServer(pool, { enableDevRoutes: env.NODE_ENV !== 'production' });

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  console.log(`API escuchando en http://${env.HOST}:${env.PORT}`);
} catch (error) {
  console.error(error);
  await pool.end();
  process.exit(1);
}

const shutdown = async (): Promise<void> => {
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
