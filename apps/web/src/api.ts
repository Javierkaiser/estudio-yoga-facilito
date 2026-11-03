export type PackageStatus = 'active' | 'exhausted' | 'expired';
export type MovementType = 'purchase' | 'booking' | 'refund' | 'expiration' | 'adjustment';

export interface StudentRecord {
  id: string;
  name: string;
  phone_e164: string;
  email: string | null;
  whatsapp_consent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentSummary extends StudentRecord {
  total_balance: number;
  active_packages: number;
}

export interface Plan {
  id: string;
  name: string;
  credits: number;
  validity_days: number | null;
  active: boolean;
  created_at: string;
}

export interface Totals {
  students: number;
  active_packages: number;
  total_balance: number;
  movements: number;
}

export interface Overview {
  students: StudentSummary[];
  plans: Plan[];
  totals: Totals;
}

export interface StudentPackage {
  id: string;
  student_id: string;
  plan_id: string;
  plan_name: string;
  credits_purchased: number;
  balance: number;
  purchased_at: string;
  expires_at: string | null;
  status: PackageStatus;
  created_at: string;
}

export interface Movement {
  seq: string;
  id: string;
  student_package_id: string;
  student_id: string;
  type: MovementType;
  delta: number;
  balance_after: number;
  booking_id: string | null;
  class_session_id: string | null;
  actor_type: 'student' | 'staff' | 'system';
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface StudentDetail {
  student: StudentRecord;
  packages: StudentPackage[];
  movements: Movement[];
}

export interface CreateStudentInput {
  name: string;
  phone: string;
  email?: string;
  whatsappConsent: boolean;
}

export interface CreatePlanInput {
  name: string;
  credits: number;
  validityDays: number | null;
}

export interface PurchaseInput {
  studentId: string;
  planId: string;
}

export interface AdjustInput {
  packageId: string;
  delta: number;
  reason: string;
}

export type SessionStatus = 'scheduled' | 'cancelled' | 'completed';

export interface Instructor {
  id: string;
  name: string;
  email: string;
  role: 'instructor';
  active: boolean;
}

export interface ClassTemplate {
  id: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  instructor_id: string;
  active: boolean;
  created_at: string;
  instructor_name: string;
}

export interface ClassSession {
  id: string;
  template_id: string | null;
  starts_at: string;
  duration_minutes: number;
  capacity: number;
  instructor_id: string;
  status: SessionStatus;
  cancelled_at: string | null;
  cancelled_by_type: 'student' | 'staff' | 'system' | null;
  cancelled_by_id: string | null;
  created_at: string;
  instructor_name: string;
  occupied: number;
  waitlisted: number;
  available: number;
}

export interface SchedulingOverview {
  templates: ClassTemplate[];
  instructors: Instructor[];
  sessions: ClassSession[];
}

export interface CreateTemplateInput {
  weekday: number;
  startTime: string;
  durationMinutes: number;
  capacity: number;
  instructorId: string;
}

export type UpdateTemplateInput = Partial<CreateTemplateInput> & { active?: boolean };

export interface GenerateSessionsInput {
  from: string;
  to: string;
}

export interface EditSessionInput {
  capacity?: number;
  instructorId?: string;
}

export interface EditSessionResult {
  session: Omit<ClassSession, 'instructor_name' | 'occupied' | 'waitlisted' | 'available'>;
  promoted: { id: string; status: string } | null;
}

export interface CancelClassResult {
  refunded: number;
  notified: number;
  alreadyCancelled: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const body = (await response.json().catch(() => null)) as {
    message?: string;
    code?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.message ?? `La operación falló (${response.status})`);
  }

  return body as T;
}

export const ledgerApi = {
  overview: () => request<Overview>('/api/dev/ledger/overview'),

  studentDetail: (studentId: string) =>
    request<StudentDetail>(`/api/dev/ledger/students/${studentId}`),

  createStudent: (input: CreateStudentInput) =>
    request<StudentRecord>('/api/dev/ledger/students', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  createPlan: (input: CreatePlanInput) =>
    request<Plan>('/api/dev/ledger/plans', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  purchase: (input: PurchaseInput) =>
    request<StudentPackage>('/api/dev/ledger/purchases', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  adjust: (input: AdjustInput) =>
    request<StudentPackage>('/api/dev/ledger/adjustments', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  expire: () =>
    request<{ processed: number }>('/api/dev/ledger/expire', {
      method: 'POST',
    }),
};

export const schedulingApi = {
  overview: () => request<SchedulingOverview>('/api/dev/scheduling/overview'),

  demoInstructors: () =>
    request<{ instructors: Instructor[] }>('/api/dev/scheduling/demo-instructors', {
      method: 'POST',
    }),

  createTemplate: (input: CreateTemplateInput) =>
    request<ClassTemplate>('/api/dev/scheduling/templates', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateTemplate: (templateId: string, input: UpdateTemplateInput) =>
    request<ClassTemplate>(`/api/dev/scheduling/templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  generate: (templateId: string, input: GenerateSessionsInput) =>
    request<{ created: number; skipped: number }>(
      `/api/dev/scheduling/templates/${templateId}/generate`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  editSession: (sessionId: string, input: EditSessionInput) =>
    request<EditSessionResult>(`/api/dev/scheduling/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  cancelSession: (sessionId: string) =>
    request<CancelClassResult>(`/api/dev/scheduling/sessions/${sessionId}/cancel`, {
      method: 'POST',
    }),
};

const STUDIO_TIMEZONE = 'America/Argentina/Buenos_Aires';

export const WEEKDAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
] as const;

export function weekdayLabel(value: number): string {
  return WEEKDAYS.find((day) => day.value === value)?.label ?? '';
}

export function templateTimeLabel(value: string): string {
  return value.slice(0, 5);
}

export function formatSessionTime(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: STUDIO_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

export function formatSessionDayLabel(value: string): string {
  const label = new Intl.DateTimeFormat('es-AR', {
    timeZone: STUDIO_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(value));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function sessionDayKey(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STUDIO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function studioTodayInput(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STUDIO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDaysToInput(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function formatDate(value: string | null): string {
  if (!value) {
    return 'Sin vencimiento';
  }
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(value));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-AR').format(value);
}

export function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function statusLabel(status: PackageStatus): string {
  if (status === 'active') return 'Activo';
  if (status === 'exhausted') return 'Agotado';
  return 'Vencido';
}

export function movementLabel(type: MovementType): string {
  if (type === 'purchase') return 'Compra';
  if (type === 'booking') return 'Reserva';
  if (type === 'refund') return 'Devolución';
  if (type === 'expiration') return 'Vencimiento';
  return 'Ajuste';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function planValidity(plan: Plan): string {
  return plan.validity_days === null ? 'Sin vencimiento' : `${plan.validity_days} días`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado';
}
