export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STUDENT_NOT_FOUND'
  | 'DUPLICATE_STUDENT'
  | 'PLAN_NOT_FOUND'
  | 'PACKAGE_NOT_FOUND'
  | 'BOOKING_NOT_FOUND'
  | 'MOVEMENT_NOT_FOUND'
  | 'INSUFFICIENT_CREDITS'
  | 'DUPLICATE_BOOKING'
  | 'DUPLICATE_STAFF_EMAIL'
  | 'INVALID_STATE'
  | 'APPEND_ONLY'
  | 'CONFLICT'
  | 'OFFER_EXPIRED'
  | 'SESSION_NOT_BOOKABLE'
  | 'SESSION_STARTED'
  | 'CAPACITY_TOO_LOW';

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STUDENT_NOT_FOUND: 404,
  DUPLICATE_STUDENT: 409,
  PLAN_NOT_FOUND: 404,
  PACKAGE_NOT_FOUND: 404,
  BOOKING_NOT_FOUND: 404,
  MOVEMENT_NOT_FOUND: 404,
  INSUFFICIENT_CREDITS: 409,
  DUPLICATE_BOOKING: 409,
  DUPLICATE_STAFF_EMAIL: 409,
  INVALID_STATE: 409,
  APPEND_ONLY: 409,
  CONFLICT: 409,
  OFFER_EXPIRED: 410,
  SESSION_NOT_BOOKABLE: 409,
  SESSION_STARTED: 409,
  CAPACITY_TOO_LOW: 409,
};

export class DomainError extends Error {
  readonly status: number;

  constructor(
    readonly code: DomainErrorCode,
    message: string,
    status = STATUS_BY_CODE[code],
  ) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export function mapPostgresError(error: unknown): DomainError | null {
  const pgError = error as { code?: string; message?: string };
  if (!pgError || typeof pgError.code !== 'string') {
    return null;
  }

  if (pgError.code === 'P0001') {
    if (pgError.message?.includes('insufficient_credits')) {
      return new DomainError('INSUFFICIENT_CREDITS', 'No hay créditos suficientes');
    }
    if (pgError.message?.includes('credit_movements_append_only')) {
      return new DomainError('APPEND_ONLY', 'El historial de créditos es append-only');
    }
  }

  if (pgError.code === '23505') {
    return new DomainError('CONFLICT', 'La operación entra en conflicto con un registro existente');
  }

  return null;
}
