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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const body = (await response.json().catch(() => null)) as
    | { message?: string; code?: string }
    | null;

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
