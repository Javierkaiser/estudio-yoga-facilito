import { execFileSync } from 'node:child_process';
import { createPool } from '../../db/src/client';
import { runMigrations } from '../../db/src/migrate';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function databaseName(url: string): string {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '');
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Nombre de base de test inválido: ${name}`);
  }
  return name;
}

function adminUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

function imageExists(): boolean {
  const checks: Array<[string, string[]]> = [
    ['podman', ['image', 'exists', 'docker.io/library/postgres:16-alpine']],
    ['docker', ['image', 'inspect', 'postgres:16-alpine']],
  ];

  for (const [command, args] of checks) {
    try {
      execFileSync(command, args, { stdio: 'ignore', timeout: 10_000 });
      return true;
    } catch {
      // Probar el siguiente runtime.
    }
  }

  return false;
}

async function canConnect(url: string): Promise<boolean> {
  const pool = createPool(url, { max: 1 });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

function tryStartCompose(): void {
  if (!imageExists()) {
    throw new Error(
      'La imagen postgres:16-alpine no está disponible localmente. Descargala una vez o definí TEST_DATABASE_URL.',
    );
  }

  const commands: Array<[string, string[]]> = [
    ['podman', ['compose', 'up', '-d', 'db']],
    ['docker', ['compose', 'up', '-d', 'db']],
  ];

  for (const [command, args] of commands) {
    try {
      execFileSync(command, args, { cwd: process.cwd(), stdio: 'ignore', timeout: 60_000 });
      return;
    } catch {
      // Probar el siguiente runtime.
    }
  }

  throw new Error(
    'No hay PostgreSQL disponible. Levantá la base con `podman compose up -d db` o definí TEST_DATABASE_URL.',
  );
}

export async function ensureDatabase(url: string): Promise<void> {
  const parsed = new URL(url);
  const host = parsed.hostname;

  if (!(await canConnect(adminUrl(url)))) {
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(`No se pudo conectar a PostgreSQL en ${host}. Revisá TEST_DATABASE_URL.`);
    }
    tryStartCompose();
    let connected = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await canConnect(adminUrl(url))) {
        connected = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (!connected) {
      throw new Error('PostgreSQL no respondió después de levantar el contenedor.');
    }
  }

  const name = databaseName(url);
  const pool = createPool(adminUrl(url), { max: 1 });
  try {
    await pool.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await pool.query(`DROP DATABASE IF EXISTS "${name}"`);
    await pool.query(`CREATE DATABASE "${name}"`);
  } finally {
    await pool.end();
  }

  const testPool = createPool(url);
  try {
    await runMigrations(testPool);
  } finally {
    await testPool.end();
  }
}

export async function dropDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  const pool = createPool(adminUrl(url), { max: 1 });
  try {
    await pool.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await pool.query(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    await pool.end();
  }
}

export async function resetDatabase(url: string): Promise<void> {
  const pool = createPool(url, { max: 1 });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
