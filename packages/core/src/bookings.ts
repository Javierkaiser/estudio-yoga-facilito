import type { PoolClient } from 'pg';
import { queryOne, queryRows } from '../../db/src/client';
import { DomainError } from './errors';
import { hasVigentCredit } from './ledger';
import { enqueueSpotOffered } from './notifications';
import type { BookingRow, ClassSessionRow, StudentRow } from './types';

interface WaitlistCandidate extends BookingRow {
  student_name: string;
  phone_e164: string;
  whatsapp_consent_at: Date | null;
}

export async function countOccupied(client: PoolClient, sessionId: string): Promise<number> {
  const row = await queryOne<{ count: number }>(
    client,
    `SELECT count(*)::int AS count
       FROM bookings
      WHERE session_id = $1
        AND status IN ('confirmed', 'offered')`,
    [sessionId],
  );
  return row?.count ?? 0;
}

/**
 * Assumes the class_sessions row is already locked by the caller.
 * Offers the first FIFO waitlisted student with an active package.
 */
export async function promoteWaitlist(
  client: PoolClient,
  input: { sessionId: string; now?: Date; offerWindowMinutes?: number },
): Promise<BookingRow | null> {
  const now = input.now ?? new Date();
  const offerWindowMinutes = input.offerWindowMinutes ?? 120;

  const session = await queryOne<ClassSessionRow>(
    client,
    'SELECT * FROM class_sessions WHERE id = $1',
    [input.sessionId],
  );
  if (!session) {
    throw new DomainError('SESSION_NOT_BOOKABLE', 'La sesión no existe');
  }

  const occupied = await countOccupied(client, input.sessionId);
  if (occupied >= session.capacity) {
    return null;
  }

  const candidates = await queryRows<WaitlistCandidate>(
    client,
    `SELECT b.*, s.name AS student_name, s.phone_e164, s.whatsapp_consent_at
       FROM bookings b
       JOIN students s ON s.id = b.student_id
      WHERE b.session_id = $1
        AND b.status = 'waitlisted'
      ORDER BY b.created_at ASC, b.id ASC
      FOR UPDATE OF b`,
    [input.sessionId],
  );

  for (const candidate of candidates) {
    const hasCredit = await hasVigentCredit(client, candidate.student_id, now);
    if (!hasCredit) {
      continue;
    }

    const startsAt = new Date(session.starts_at);
    const offerExpiresAt = new Date(
      Math.min(now.getTime() + offerWindowMinutes * 60_000, startsAt.getTime()),
    );

    const booking = await queryOne<BookingRow>(
      client,
      `UPDATE bookings
          SET status = 'offered', offer_expires_at = $2
        WHERE id = $1
        RETURNING *`,
      [candidate.id, offerExpiresAt],
    );
    if (!booking) {
      continue;
    }

    const student = await queryOne<StudentRow>(client, 'SELECT * FROM students WHERE id = $1', [
      candidate.student_id,
    ]);
    if (student) {
      await enqueueSpotOffered(client, {
        bookingId: booking.id,
        session,
        student,
        deadline: offerExpiresAt,
      });
    }

    return booking;
  }

  return null;
}
