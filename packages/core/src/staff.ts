import { hash, verify } from '@node-rs/argon2';
import type { Pool } from 'pg';
import { queryOne } from '../../db/src/client';
import { DomainError, mapPostgresError } from './errors';
import type { StaffRole, StaffUserRow } from './types';

export interface CreateStaffInput {
  name: string;
  email: string;
  role: StaffRole;
  password: string;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export async function createStaffUser(pool: Pool, input: CreateStaffInput): Promise<StaffUserRow> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new DomainError('VALIDATION_ERROR', 'El email del staff es obligatorio');
  }
  if (!input.name.trim()) {
    throw new DomainError('VALIDATION_ERROR', 'El nombre del staff es obligatorio');
  }
  if (input.password.length < 8) {
    throw new DomainError('VALIDATION_ERROR', 'La contraseña debe tener al menos 8 caracteres');
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const user = await queryOne<StaffUserRow>(
      pool,
      `INSERT INTO staff_users (name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING *`,
      [input.name.trim(), email, passwordHash, input.role],
    );
    if (!user) {
      throw new DomainError('CONFLICT', 'No se pudo crear la cuenta de staff');
    }
    return user;
  } catch (error) {
    const mapped = mapPostgresError(error);
    if (mapped?.code === 'CONFLICT') {
      throw new DomainError('DUPLICATE_STAFF_EMAIL', 'Ya existe una cuenta con ese email');
    }
    throw error;
  }
}

export async function verifyStaffCredentials(
  pool: Pool,
  email: string,
  password: string,
): Promise<StaffUserRow | null> {
  const user = await queryOne<StaffUserRow>(
    pool,
    'SELECT * FROM staff_users WHERE lower(email) = lower($1) LIMIT 1',
    [email.trim()],
  );
  if (!user || !user.active) {
    return null;
  }
  const valid = await verifyPassword(user.password_hash, password);
  return valid ? user : null;
}

export async function setStaffActive(
  pool: Pool,
  email: string,
  active: boolean,
): Promise<StaffUserRow> {
  const user = await queryOne<StaffUserRow>(
    pool,
    'UPDATE staff_users SET active = $2 WHERE lower(email) = lower($1) RETURNING *',
    [email.trim(), active],
  );
  if (!user) {
    throw new DomainError('NOT_FOUND', 'La cuenta de staff no existe');
  }
  return user;
}
