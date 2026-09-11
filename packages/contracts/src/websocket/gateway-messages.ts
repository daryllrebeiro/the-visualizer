import { z } from 'zod';

/**
 * Canonical gateway egress contract.
 *
 * The gateway wraps every server → client message as `{ type, payload }` and
 * emits a fixed set of message types. Historically this list lived only in the
 * gateway source (the older `ServerMessageSchema` described a flat shape the
 * gateway never actually sent), which let wire drift go unnoticed. This module
 * is the single source of truth: the gateway validates against it in dev/test
 * and integration tests assert captured egress conforms.
 */

export const GatewayMessageTypeSchema = z.enum([
  'EVENT_BATCH',
  'INTENT_ACK',
  'MSG_INTENT_ACK',
  'INIT_SNAPSHOT',
  'MSG_INIT_SNAPSHOT',
  'INIT_SNAPSHOT_REQUIRED',
  'ROOM_JOINED',
  'SESSION_ERROR',
  'MSG_SESSION_ERROR',
  'INVARIANT_VIOLATION',
  'PRESENCE_UPDATE',
]);

export type GatewayMessageType = z.infer<typeof GatewayMessageTypeSchema>;

const JsonPatchOpSchema = z
  .object({ op: z.string(), path: z.string(), value: z.unknown().optional(), from: z.string().optional() })
  .passthrough();

const AckPayload = z.object({
  intentId: z.string().max(128),
  status: z.enum(['ACCEPTED', 'REJECTED']),
  reason: z.string().max(500).optional(),
});

const ErrorPayload = z.object({
  code: z.string().min(1).max(64),
  message: z.string().max(500),
  fatal: z.boolean(),
});

/**
 * Discriminated union over `{ type, payload }`. Payloads with historically
 * variable shapes (snapshots) use `.passthrough()` rather than dropping fields.
 */
export const GatewayServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('EVENT_BATCH'),
    payload: z.object({
      tick: z.number().int().nonnegative(),
      patch: z.array(JsonPatchOpSchema),
    }),
  }),
  z.object({ type: z.literal('INTENT_ACK'), payload: AckPayload }),
  z.object({ type: z.literal('MSG_INTENT_ACK'), payload: AckPayload }),
  z.object({
    type: z.literal('INIT_SNAPSHOT'),
    payload: z.object({
      roomId: z.string().min(1).max(255),
      state: z.record(z.string(), z.unknown()).nullable(),
      tick: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal('MSG_INIT_SNAPSHOT'),
    payload: z
      .object({
        sessionId: z.string().min(1).max(255),
        serverTick: z.number().int().nonnegative(),
        topology: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough(),
  }),
  z.object({
    type: z.literal('INIT_SNAPSHOT_REQUIRED'),
    payload: z.object({ roomId: z.string().min(1).max(255) }),
  }),
  z.object({
    type: z.literal('ROOM_JOINED'),
    payload: z.object({ roomId: z.string().min(1).max(255) }),
  }),
  z.object({ type: z.literal('SESSION_ERROR'), payload: ErrorPayload }),
  z.object({ type: z.literal('MSG_SESSION_ERROR'), payload: ErrorPayload }),
  z.object({
    type: z.literal('INVARIANT_VIOLATION'),
    payload: z.object({
      error: z.string().max(2000),
      tick: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal('PRESENCE_UPDATE'),
    payload: z.object({
      activeUsers: z
        .array(
          z.object({
            userId: z.string().max(128),
            name: z.string().max(255),
            role: z.enum(['PRESENTER', 'STUDENT']).optional(),
          }),
        )
        .max(500),
    }),
  }),
]);

export type GatewayServerMessage = z.infer<typeof GatewayServerMessageSchema>;

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** Validates a candidate egress message; used by the gateway and tests. */
export function validateGatewayMessage(message: unknown): ValidationResult {
  const result = GatewayServerMessageSchema.safeParse(message);
  if (result.success) return { ok: true };
  const first = result.error.errors[0];
  return {
    ok: false,
    error: `${first?.path.join('.') ?? 'message'}: ${first?.message ?? 'invalid'}`,
  };
}

// ─── Per-domain action schemas ───────────────────────────────────────────────

/**
 * Domain-scoped `INTENT_DOMAIN_ACTION` payload schemas.
 *
 * Generic domains accept an opaque payload, but where a domain exposes a known
 * action surface we constrain it so malformed intents are rejected at the edge
 * instead of reaching a reducer. Keys are `domainId`; the `actions` map is
 * `actionName -> payload schema`.
 */
export const DomainActionSchemas: Record<string, z.ZodType<Record<string, unknown>>> = {
  'rate-limiter': z
    .object({
      clientId: z.string().min(1).max(128),
      capacity: z.number().int().min(0).max(1_000_000).optional(),
      count: z.number().int().min(0).max(10_000).optional(),
    })
    .passthrough(),
  'distributed-lock': z
    .object({
      clientId: z.string().min(1).max(128),
      resourceId: z.string().min(1).max(128).optional(),
      ttlMs: z.number().int().min(0).max(600_000).optional(),
    })
    .passthrough(),
  'consistent-hashing': z
    .object({
      key: z.string().min(1).max(512).optional(),
      nodeId: z.string().min(1).max(128).optional(),
    })
    .passthrough(),
};

const DEFAULT_DOMAIN_ACTION = z.record(z.string(), z.unknown());

/** Resolves the payload schema for a domain (falls back to a bounded record). */
export function domainActionPayloadSchema(domainId: string): z.ZodType<Record<string, unknown>> {
  return DomainActionSchemas[domainId] ?? DEFAULT_DOMAIN_ACTION;
}
