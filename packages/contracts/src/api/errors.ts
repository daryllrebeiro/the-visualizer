import { z } from 'zod';

/**
 * Standard API error response envelope.
 * The server NEVER exposes internal details to the client.
 * Internal details go to structured logs only.
 */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(), // Machine-readable code (e.g. "TOPOLOGY_NOT_FOUND")
    message: z.string(), // Human-readable message (sanitized)
    requestId: z.string(), // Correlation ID for log lookup
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiErrorCode = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  RESOURCE_LIMIT_EXCEEDED: 'RESOURCE_LIMIT_EXCEEDED',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const satisfies Record<string, string>;

export type ApiErrorCodeType = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];
