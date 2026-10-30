import type { Pool } from 'pg';
import { queryOne } from '../../db/src/client';
import { DomainError, mapPostgresError } from './errors';
import type { StudentRow } from './types';

const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateStudentInput {
  name: string;
  phone: string;
  email?: string | null;
  whatsappConsent?: boolean;
}

export async function createStudent(
  pool: Pool,
  input: CreateStudentInput,
): Promise<StudentRow> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const email = input.email?.trim().toLowerCase() || null;

  if (!name) {
    throw new DomainError('VALIDATION_ERROR', 'El nombre del estudiante es obligatorio');
  }
  if (!E164.test(phone)) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'El teléfono debe tener formato E.164, por ejemplo +5491123456789',
    );
  }
  if (email && !EMAIL.test(email)) {
    throw new DomainError('VALIDATION_ERROR', 'El email no tiene un formato válido');
  }

  try {
    const student = await queryOne<StudentRow>(
      pool,
      `INSERT INTO students (name, phone_e164, email, whatsapp_consent_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, phone, email, input.whatsappConsent === false ? null : new Date()],
    );

    if (!student) {
      throw new DomainError('CONFLICT', 'No se pudo crear el estudiante');
    }
    return student;
  } catch (error) {
    const mapped = mapPostgresError(error);
    if (mapped?.code === 'CONFLICT') {
      throw new DomainError(
        'DUPLICATE_STUDENT',
        'Ya existe un estudiante con ese teléfono o email',
      );
    }
    throw error;
  }
}

export async function getStudent(pool: Pool, studentId: string): Promise<StudentRow | null> {
  return queryOne<StudentRow>(pool, 'SELECT * FROM students WHERE id = $1', [studentId]);
}
