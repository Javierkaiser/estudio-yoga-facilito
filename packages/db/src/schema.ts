import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const staffRole = pgEnum('staff_role', ['admin', 'instructor']);
export const packageStatus = pgEnum('package_status', ['active', 'exhausted', 'expired']);
export const movementType = pgEnum('movement_type', [
  'purchase',
  'booking',
  'refund',
  'expiration',
  'adjustment',
]);
export const actorType = pgEnum('actor_type', ['student', 'staff', 'system']);
export const sessionStatus = pgEnum('session_status', ['scheduled', 'cancelled', 'completed']);
export const bookingStatus = pgEnum('booking_status', [
  'confirmed',
  'waitlisted',
  'offered',
  'attended',
  'absent',
  'cancelled',
  'offer_expired',
]);
export const notificationStatus = pgEnum('notification_status', [
  'pending',
  'sent',
  'failed',
  'skipped',
]);

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    phoneE164: text('phone_e164').notNull(),
    email: text('email'),
    whatsappConsentAt: timestamp('whatsapp_consent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('students_phone_e164_uidx').on(table.phoneE164),
    uniqueIndex('students_email_lower_uidx')
      .on(sql`lower(${table.email})`)
      .where(sql`${table.email} is not null`),
  ],
);

export const staffUsers = pgTable(
  'staff_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: staffRole('role').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('staff_users_email_lower_uidx').on(sql`lower(${table.email})`)],
);

export const packagePlans = pgTable(
  'package_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    credits: integer('credits').notNull(),
    validityDays: integer('validity_days'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('package_plans_credits_check', sql`${table.credits} > 0`),
    check(
      'package_plans_validity_days_check',
      sql`${table.validityDays} is null or ${table.validityDays} > 0`,
    ),
  ],
);

export const studentPackages = pgTable(
  'student_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => packagePlans.id, { onDelete: 'restrict' }),
    creditsPurchased: integer('credits_purchased').notNull(),
    balance: integer('balance').notNull().default(0),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: packageStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('student_packages_credits_purchased_check', sql`${table.creditsPurchased} > 0`),
    check('student_packages_balance_check', sql`${table.balance} >= 0`),
    index('student_packages_student_expiry_idx').on(
      table.studentId,
      table.expiresAt,
      table.purchasedAt,
    ),
  ],
);

export const classTemplates = pgTable(
  'class_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weekday: integer('weekday').notNull(),
    startTime: time('start_time').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    capacity: integer('capacity').notNull(),
    instructorId: uuid('instructor_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'restrict' }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('class_templates_weekday_check', sql`${table.weekday} between 1 and 7`),
    check('class_templates_duration_check', sql`${table.durationMinutes} > 0`),
    check('class_templates_capacity_check', sql`${table.capacity} > 0`),
  ],
);

export const classSessions = pgTable(
  'class_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id').references(() => classTemplates.id, { onDelete: 'set null' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    capacity: integer('capacity').notNull(),
    instructorId: uuid('instructor_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'restrict' }),
    status: sessionStatus('status').notNull().default('scheduled'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledByType: actorType('cancelled_by_type'),
    cancelledById: uuid('cancelled_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('class_sessions_duration_check', sql`${table.durationMinutes} > 0`),
    check('class_sessions_capacity_check', sql`${table.capacity} > 0`),
    uniqueIndex('class_sessions_template_start_uidx')
      .on(table.templateId, table.startsAt)
      .where(sql`${table.templateId} is not null`),
    index('class_sessions_starts_at_idx').on(table.startsAt),
    index('class_sessions_instructor_idx').on(table.instructorId, table.startsAt),
  ],
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    status: bookingStatus('status').notNull().default('confirmed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    offerExpiresAt: timestamp('offer_expires_at', { withTimezone: true }),
    attendedAt: timestamp('attended_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledByType: actorType('cancelled_by_type'),
    cancelledById: uuid('cancelled_by_id'),
  },
  (table) => [
    uniqueIndex('bookings_active_student_session_uidx')
      .on(table.sessionId, table.studentId)
      .where(sql`${table.status} in ('confirmed', 'waitlisted', 'offered', 'attended', 'absent')`),
    index('bookings_session_status_queue_idx').on(
      table.sessionId,
      table.status,
      table.createdAt,
      table.id,
    ),
    index('bookings_student_idx').on(table.studentId, table.createdAt.desc()),
  ],
);

export const creditMovements = pgTable(
  'credit_movements',
  {
    seq: bigserial('seq', { mode: 'number' }).notNull().unique(),
    id: uuid('id').primaryKey().defaultRandom(),
    studentPackageId: uuid('student_package_id')
      .notNull()
      .references(() => studentPackages.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    type: movementType('type').notNull(),
    delta: integer('delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'restrict' }),
    classSessionId: uuid('class_session_id').references(() => classSessions.id, {
      onDelete: 'restrict',
    }),
    actorType: actorType('actor_type').notNull(),
    actorId: uuid('actor_id'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('credit_movements_delta_check', sql`${table.delta} <> 0`),
    index('credit_movements_package_idx').on(table.studentPackageId, table.seq),
    index('credit_movements_student_idx').on(table.studentId, table.seq.desc()),
    uniqueIndex('credit_movements_booking_type_uidx')
      .on(table.bookingId, table.type)
      .where(sql`${table.bookingId} is not null and ${table.type} in ('booking', 'refund')`),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    event: text('event').notNull(),
    recipientStudentId: uuid('recipient_student_id').references(() => students.id, {
      onDelete: 'restrict',
    }),
    recipientPhone: text('recipient_phone').notNull(),
    template: text('template').notNull(),
    payload: jsonb('payload').notNull(),
    status: notificationStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    check('notifications_attempts_check', sql`${table.attempts} >= 0`),
    index('notifications_outbox_idx').on(table.status, table.nextAttemptAt, table.createdAt),
  ],
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    emailNormalized: text('email_normalized').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    requestIp: text('request_ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('auth_tokens_attempts_check', sql`${table.attempts} >= 0`),
    index('auth_tokens_email_created_idx').on(table.emailNormalized, table.createdAt.desc()),
  ],
);

export const studentSessions = pgTable(
  'student_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('student_sessions_token_hash_uidx').on(table.tokenHash),
    index('student_sessions_student_idx').on(table.studentId, table.expiresAt.desc()),
  ],
);

export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('staff_sessions_token_hash_uidx').on(table.tokenHash),
    index('staff_sessions_staff_idx').on(table.staffUserId, table.expiresAt.desc()),
  ],
);

export type Student = typeof students.$inferSelect;
export type StaffUser = typeof staffUsers.$inferSelect;
export type PackagePlan = typeof packagePlans.$inferSelect;
export type StudentPackage = typeof studentPackages.$inferSelect;
export type CreditMovement = typeof creditMovements.$inferSelect;
export type ClassSession = typeof classSessions.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
