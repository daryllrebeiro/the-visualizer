/**
 * Typed application errors.
 *
 * Repository and service layers throw these instead of plain `Error` with
 * message-string conventions. Routes map them to status codes via
 * `toErrorResponse`, which never leaks internal messages for 5xx.
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions for this organization') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super('CONFLICT', message, 409);
  }
}

/**
 * Detects a PostgreSQL unique-violation by driver error code (`23505`).
 * Never match on `err.message` — messages are localized and unstable.
 */
export function isPostgresConflict(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

export interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

/**
 * Maps any thrown value to a safe `{ status, body }` pair. AppErrors carry
 * their own code/status; everything else becomes a generic 500 with NO
 * internal message leakage.
 */
export function toErrorResponse(err: unknown, fallbackMessage: string): {
  status: number;
  body: ErrorBody;
} {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: { success: false, error: { code: err.code, message: err.message } },
    };
  }
  return {
    status: 500,
    body: { success: false, error: { code: 'INTERNAL_ERROR', message: fallbackMessage } },
  };
}
