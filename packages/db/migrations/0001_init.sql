CREATE TYPE staff_role AS ENUM ('admin', 'instructor');
CREATE TYPE package_status AS ENUM ('active', 'exhausted', 'expired');
CREATE TYPE movement_type AS ENUM ('purchase', 'booking', 'refund', 'expiration', 'adjustment');
CREATE TYPE actor_type AS ENUM ('student', 'staff', 'system');
CREATE TYPE session_status AS ENUM ('scheduled', 'cancelled', 'completed');
CREATE TYPE booking_status AS ENUM (
  'confirmed',
  'waitlisted',
  'offered',
  'attended',
  'absent',
  'cancelled',
  'offer_expired'
);
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed', 'skipped');

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone_e164 text NOT NULL,
  email text,
  whatsapp_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX students_phone_e164_uidx ON students (phone_e164);
CREATE UNIQUE INDEX students_email_lower_uidx ON students (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  role staff_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX staff_users_email_lower_uidx ON staff_users (lower(email));

CREATE TABLE package_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  validity_days integer CHECK (validity_days IS NULL OR validity_days > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES package_plans(id) ON DELETE RESTRICT,
  credits_purchased integer NOT NULL CHECK (credits_purchased > 0),
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  status package_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX student_packages_student_expiry_idx
  ON student_packages (student_id, expires_at NULLS LAST, purchased_at);

CREATE TABLE class_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  capacity integer NOT NULL CHECK (capacity > 0),
  instructor_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES class_templates(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  capacity integer NOT NULL CHECK (capacity > 0),
  instructor_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  status session_status NOT NULL DEFAULT 'scheduled',
  cancelled_at timestamptz,
  cancelled_by_type actor_type,
  cancelled_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX class_sessions_template_start_uidx
  ON class_sessions (template_id, starts_at)
  WHERE template_id IS NOT NULL;
CREATE INDEX class_sessions_starts_at_idx ON class_sessions (starts_at);
CREATE INDEX class_sessions_instructor_idx ON class_sessions (instructor_id, starts_at);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  status booking_status NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  offer_expires_at timestamptz,
  attended_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_type actor_type,
  cancelled_by_id uuid
);

CREATE UNIQUE INDEX bookings_active_student_session_uidx
  ON bookings (session_id, student_id)
  WHERE status IN ('confirmed', 'waitlisted', 'offered', 'attended', 'absent');
CREATE INDEX bookings_session_status_queue_idx
  ON bookings (session_id, status, created_at, id);
CREATE INDEX bookings_student_idx ON bookings (student_id, created_at DESC);

CREATE TABLE credit_movements (
  seq bigserial NOT NULL UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_package_id uuid NOT NULL REFERENCES student_packages(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  type movement_type NOT NULL,
  delta integer NOT NULL CHECK (delta <> 0),
  balance_after integer NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE RESTRICT,
  class_session_id uuid REFERENCES class_sessions(id) ON DELETE RESTRICT,
  actor_type actor_type NOT NULL,
  actor_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX credit_movements_package_idx ON credit_movements (student_package_id, seq);
CREATE INDEX credit_movements_student_idx ON credit_movements (student_id, seq DESC);
CREATE UNIQUE INDEX credit_movements_booking_type_uidx
  ON credit_movements (booking_id, type)
  WHERE booking_id IS NOT NULL AND type IN ('booking', 'refund');

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  recipient_student_id uuid REFERENCES students(id) ON DELETE RESTRICT,
  recipient_phone text NOT NULL,
  template text NOT NULL,
  payload jsonb NOT NULL,
  status notification_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  idempotency_key text NOT NULL,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT notifications_idempotency_key_uidx UNIQUE (idempotency_key)
);

CREATE INDEX notifications_outbox_idx ON notifications (status, next_attempt_at, created_at);

CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  request_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_tokens_email_created_idx ON auth_tokens (email_normalized, created_at DESC);

CREATE TABLE student_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX student_sessions_token_hash_uidx ON student_sessions (token_hash);
CREATE INDEX student_sessions_student_idx ON student_sessions (student_id, expires_at DESC);

CREATE TABLE staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX staff_sessions_token_hash_uidx ON staff_sessions (token_hash);
CREATE INDEX staff_sessions_staff_idx ON staff_sessions (staff_user_id, expires_at DESC);

CREATE OR REPLACE FUNCTION credit_movements_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_balance integer;
  package_student uuid;
BEGIN
  UPDATE student_packages
     SET balance = balance + NEW.delta,
         status = CASE
           WHEN expires_at IS NOT NULL AND expires_at <= now() THEN 'expired'::package_status
           WHEN balance + NEW.delta = 0 THEN 'exhausted'::package_status
           ELSE 'active'::package_status
         END
   WHERE id = NEW.student_package_id
     AND balance + NEW.delta >= 0
   RETURNING balance, student_id INTO new_balance, package_student;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001';
  END IF;

  NEW.student_id := package_student;
  NEW.balance_after := new_balance;
  RETURN NEW;
END;
$$;

CREATE TRIGGER credit_movements_balance_trg
BEFORE INSERT ON credit_movements
FOR EACH ROW
EXECUTE FUNCTION credit_movements_balance();

CREATE OR REPLACE FUNCTION credit_movements_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'credit_movements_append_only' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER credit_movements_append_only_trg
BEFORE UPDATE OR DELETE ON credit_movements
FOR EACH ROW
EXECUTE FUNCTION credit_movements_append_only();
