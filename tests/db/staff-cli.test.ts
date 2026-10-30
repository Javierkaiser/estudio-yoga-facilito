import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool } from '../../packages/db/src/client';
import {
  createStaffUser,
  verifyStaffCredentials,
} from '../../packages/core/src/staff';
import { runStaffCli } from '../../packages/core/src/staff-cli';
import { truncateAll } from '../../packages/testing/src/factories';

const pool = createPool(process.env.DATABASE_URL);

describe('aprovisionamiento de staff', () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('crea una cuenta con contraseña hasheada y permite verificarla', async () => {
    const email = 'andrea@example.com';
    await runStaffCli(
      [
        '--email',
        email,
        '--name',
        'Andrea',
        '--role',
        'admin',
        '--password',
        'secreto-123',
      ],
      pool,
    );

    const row = await pool.query<{ password_hash: string; role: string; active: boolean }>(
      'SELECT password_hash, role, active FROM staff_users WHERE email = $1',
      [email],
    );
    expect(row.rows[0]?.password_hash).not.toBe('secreto-123');
    expect(row.rows[0]?.role).toBe('admin');
    expect(row.rows[0]?.active).toBe(true);

    await expect(verifyStaffCredentials(pool, email, 'secreto-123')).resolves.toMatchObject({
      email,
      role: 'admin',
    });
    await expect(verifyStaffCredentials(pool, email, 'incorrecta')).resolves.toBeNull();
  });

  it('desactiva una cuenta y rechaza sus credenciales', async () => {
    const email = 'instructora@example.com';
    await createStaffUser(pool, {
      name: 'Ana',
      email,
      role: 'instructor',
      password: 'secreto-123',
    });

    await runStaffCli(['--deactivate', '--email', email], pool);
    await expect(verifyStaffCredentials(pool, email, 'secreto-123')).resolves.toBeNull();
  });

  it('rechaza emails duplicados y contraseñas cortas', async () => {
    await createStaffUser(pool, {
      name: 'Andrea',
      email: 'duplicada@example.com',
      role: 'admin',
      password: 'secreto-123',
    });

    await expect(
      createStaffUser(pool, {
        name: 'Otra',
        email: 'duplicada@example.com',
        role: 'instructor',
        password: 'secreto-123',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_STAFF_EMAIL' });

    await expect(
      createStaffUser(pool, {
        name: 'Corta',
        email: 'corta@example.com',
        role: 'instructor',
        password: 'corta',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
