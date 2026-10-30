import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { purchasePackage, createPlan } from '../../core/src/ledger';
import { queryOne, queryRows } from '../../db/src/client';
import type {
  BookingRow,
  ClassSessionRow,
  PackagePlanRow,
  StaffActor,
  StaffUserRow,
  StudentPackageRow,
  StudentRow,
} from '../../core/src/types';

let studentSequence = 0;
let staffSequence = 0;

export function resetFactorySequences(): void {
  studentSequence = 0;
  staffSequence = 0;
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      credit_movements,
      bookings,
      class_sessions,
      class_templates,
      notifications,
      student_packages,
      package_plans,
      auth_tokens,
      student_sessions,
      staff_sessions,
      students,
      staff_users
    RESTART IDENTITY CASCADE
  `);
  resetFactorySequences();
}

export interface CreateStudentOptions {
  name?: string;
  phone?: string;
  email?: string | null;
  whatsappConsentAt?: Date | null;
}

export async function createStudent(
  pool: Pool,
  options: CreateStudentOptions = {},
): Promise<StudentRow> {
  studentSequence += 1;
  const student = await queryOne<StudentRow>(
    pool,
    `INSERT INTO students (name, phone_e164, email, whatsapp_consent_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      options.name ?? `Estudiante ${studentSequence}`,
      options.phone ?? `+54911${String(1000000 + studentSequence).padStart(7, '0')}`,
      options.email ?? `estudiante${studentSequence}@example.com`,
      options.whatsappConsentAt === undefined ? new Date() : options.whatsappConsentAt,
    ],
  );
  if (!student) {
    throw new Error('No se pudo crear el estudiante');
  }
  return student;
}

export interface CreateStaffOptions {
  name?: string;
  email?: string;
  role?: 'admin' | 'instructor';
  passwordHash?: string;
  active?: boolean;
}

export async function createStaff(
  pool: Pool,
  options: CreateStaffOptions = {},
): Promise<StaffUserRow> {
  staffSequence += 1;
  const role = options.role ?? 'instructor';
  const staff = await queryOne<StaffUserRow>(
    pool,
    `INSERT INTO staff_users (name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      options.name ?? (role === 'admin' ? 'Andrea' : `Instructora ${staffSequence}`),
      options.email ?? `${role}${staffSequence}@example.com`,
      options.passwordHash ?? 'test-password-hash',
      role,
      options.active ?? true,
    ],
  );
  if (!staff) {
    throw new Error('No se pudo crear el staff');
  }
  return staff;
}

export async function createAdmin(pool: Pool): Promise<StaffUserRow> {
  return createStaff(pool, { role: 'admin', name: 'Andrea' });
}

export interface CreatePlanOptions {
  name?: string;
  credits?: number;
  validityDays?: number | null;
}

export async function createPlanFixture(
  pool: Pool,
  options: CreatePlanOptions = {},
): Promise<PackagePlanRow> {
  const plan = await queryOne<PackagePlanRow>(
    pool,
    `INSERT INTO package_plans (name, credits, validity_days)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [
      options.name ?? 'Plan de 10 clases',
      options.credits ?? 10,
      options.validityDays === undefined ? 90 : options.validityDays,
    ],
  );
  if (!plan) {
    throw new Error('No se pudo crear el plan');
  }
  return plan;
}

export async function createPlanAsAdmin(
  pool: Pool,
  admin: StaffUserRow,
  options: CreatePlanOptions = {},
): Promise<PackagePlanRow> {
  return createPlan(
    pool,
    {
      name: options.name ?? 'Plan de 10 clases',
      credits: options.credits ?? 10,
      validityDays: options.validityDays,
    },
    { id: admin.id, role: 'admin' },
  );
}

export async function createStudentPackage(
  pool: Pool,
  admin: StaffUserRow,
  student: StudentRow,
  plan: PackagePlanRow,
  purchasedAt?: Date,
): Promise<StudentPackageRow> {
  return purchasePackage(
    pool,
    { studentId: student.id, planId: plan.id, purchasedAt },
    { id: admin.id, role: 'admin' },
  );
}

export interface CreateSessionOptions {
  instructorId: string;
  capacity?: number;
  startsAt?: Date;
  durationMinutes?: number;
  status?: 'scheduled' | 'cancelled' | 'completed';
  templateId?: string | null;
}

export async function createSession(
  pool: Pool,
  options: CreateSessionOptions,
): Promise<ClassSessionRow> {
  const session = await queryOne<ClassSessionRow>(
    pool,
    `INSERT INTO class_sessions
       (template_id, starts_at, duration_minutes, capacity, instructor_id, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      options.templateId ?? null,
      options.startsAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      options.durationMinutes ?? 60,
      options.capacity ?? 12,
      options.instructorId,
      options.status ?? 'scheduled',
    ],
  );
  if (!session) {
    throw new Error('No se pudo crear la sesión');
  }
  return session;
}

export interface CreateBookingOptions {
  sessionId: string;
  studentId: string;
  status?: BookingRow['status'];
}

export async function createBooking(
  pool: Pool,
  options: CreateBookingOptions,
): Promise<BookingRow> {
  const booking = await queryOne<BookingRow>(
    pool,
    `INSERT INTO bookings (session_id, student_id, status)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [options.sessionId, options.studentId, options.status ?? 'confirmed'],
  );
  if (!booking) {
    throw new Error('No se pudo crear la reserva');
  }
  return booking;
}

export async function createBookingFixture(
  pool: Pool,
  options: CreateBookingOptions,
): Promise<BookingRow> {
  return createBooking(pool, options);
}

export async function getPackageRow(
  pool: Pool,
  packageId: string,
): Promise<StudentPackageRow> {
  const rows = await queryRows<StudentPackageRow>(
    pool,
    'SELECT * FROM student_packages WHERE id = $1',
    [packageId],
  );
  const pkg = rows[0];
  if (!pkg) {
    throw new Error(`No existe el paquete ${packageId}`);
  }
  return pkg;
}

export function adminActor(admin: StaffUserRow): StaffActor {
  return { id: admin.id, role: 'admin' };
}

export function uniquePhone(): string {
  return `+54911${String(1000000 + Math.floor(Math.random() * 9000000)).padStart(7, '0')}`;
}

export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}-${randomUUID()}@example.com`;
}
