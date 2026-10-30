import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

export interface PoolOptions {
  max?: number;
}

export function createPool(
  connectionString: string | undefined = process.env.DATABASE_URL,
  options: PoolOptions = {},
): Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL es obligatorio para crear el pool de PostgreSQL');
  }

  const pool = new Pool({
    connectionString,
    max: options.max ?? 25,
    application_name: 'estudio-yoga',
    options: '-c lock_timeout=5000',
  });

  pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error', error);
  });

  return pool;
}

export async function withTransaction<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback failed', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function queryRows<T extends QueryResultRow>(
  client: Pool | PoolClient,
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result: QueryResult<T> = await client.query<T>(text, values);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  client: Pool | PoolClient,
  text: string,
  values: unknown[] = [],
): Promise<T | null> {
  const rows = await queryRows<T>(client, text, values);
  return rows[0] ?? null;
}
