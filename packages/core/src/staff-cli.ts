import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { createPool } from '../../db/src/client';
import { loadEnv } from '../../shared/src/env';
import { createStaffUser, setStaffActive } from './staff';
import type { StaffRole } from './types';

interface CliOptions {
  email?: string;
  name?: string;
  role?: string;
  password?: string;
  deactivate?: boolean;
  help?: boolean;
}

export async function runStaffCli(argv: string[], pool: Pool): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
      password: { type: 'string' },
      deactivate: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  }) as { values: CliOptions };

  if (values.help) {
    console.log(`Uso:
  npm run staff:create -- --email <email> --name <nombre> --role admin|instructor --password <clave>
  npm run staff:create -- --deactivate --email <email>

Si se omite --password, se solicita de forma interactiva.`);
    return;
  }

  if (!values.email) {
    throw new Error('--email es obligatorio');
  }

  if (values.deactivate) {
    const user = await setStaffActive(pool, values.email, false);
    console.log(`Cuenta desactivada: ${user.email}`);
    return;
  }

  const role = values.role as StaffRole | undefined;
  if (role !== 'admin' && role !== 'instructor') {
    throw new Error('--role debe ser admin o instructor');
  }

  const name = values.name?.trim();
  if (!name) {
    throw new Error('--name es obligatorio para crear una cuenta');
  }

  let password = values.password;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      password = await rl.question('Contraseña: ');
    } finally {
      rl.close();
    }
  }

  if (!password) {
    throw new Error('La contraseña es obligatoria');
  }

  const user = await createStaffUser(pool, {
    name,
    email: values.email,
    role,
    password,
  });

  console.log(`Cuenta creada: ${user.email} (${user.role})`);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  try {
    await runStaffCli(process.argv.slice(2), pool);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
