export type StaffRole = 'admin' | 'instructor';
export type PackageStatus = 'active' | 'exhausted' | 'expired';
export type MovementType = 'purchase' | 'booking' | 'refund' | 'expiration' | 'adjustment';
export type ActorType = 'student' | 'staff' | 'system';
export type SessionStatus = 'scheduled' | 'cancelled' | 'completed';
export type BookingStatus =
  | 'confirmed'
  | 'waitlisted'
  | 'offered'
  | 'attended'
  | 'absent'
  | 'cancelled'
  | 'offer_expired';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface StudentRow {
  id: string;
  name: string;
  phone_e164: string;
  email: string | null;
  whatsapp_consent_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface StaffUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: StaffRole;
  active: boolean;
  created_at: Date;
}

export interface PackagePlanRow {
  id: string;
  name: string;
  credits: number;
  validity_days: number | null;
  active: boolean;
  created_at: Date;
}

export interface StudentPackageRow {
  id: string;
  student_id: string;
  plan_id: string;
  credits_purchased: number;
  balance: number;
  purchased_at: Date;
  expires_at: Date | null;
  status: PackageStatus;
  created_at: Date;
}

export interface CreditMovementRow {
  seq: string;
  id: string;
  student_package_id: string;
  student_id: string;
  type: MovementType;
  delta: number;
  balance_after: number;
  booking_id: string | null;
  class_session_id: string | null;
  actor_type: ActorType;
  actor_id: string | null;
  reason: string | null;
  created_at: Date;
}

export interface ClassTemplateRow {
  id: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  instructor_id: string;
  active: boolean;
  created_at: Date;
}

export interface ClassSessionRow {
  id: string;
  template_id: string | null;
  starts_at: Date;
  duration_minutes: number;
  capacity: number;
  instructor_id: string;
  status: SessionStatus;
  cancelled_at: Date | null;
  cancelled_by_type: ActorType | null;
  cancelled_by_id: string | null;
  created_at: Date;
}

export interface BookingRow {
  id: string;
  session_id: string;
  student_id: string;
  status: BookingStatus;
  created_at: Date;
  offer_expires_at: Date | null;
  attended_at: Date | null;
  cancelled_at: Date | null;
  cancelled_by_type: ActorType | null;
  cancelled_by_id: string | null;
}

export interface NotificationRow {
  id: string;
  event: string;
  recipient_student_id: string | null;
  recipient_phone: string;
  template: string;
  payload: unknown;
  status: NotificationStatus;
  attempts: number;
  idempotency_key: string;
  next_attempt_at: Date;
  locked_until: Date | null;
  last_error: string | null;
  created_at: Date;
  sent_at: Date | null;
}

export interface StaffActor {
  id: string;
  role: StaffRole;
}
