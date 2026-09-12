import { z } from 'zod';

import { ComponentIdSchema } from './definition.js';

export const SystemEventTypeSchema = z.enum([
  'USER_ACTION',
  'HTTP_REQUEST',
  'HTTP_RESPONSE',
  'SERVICE_REQUEST',
  'SERVICE_RESPONSE',
  'CACHE_GET',
  'CACHE_HIT',
  'CACHE_MISS',
  'CACHE_SET',
  'DATABASE_QUERY',
  'DATABASE_RESULT',
  'MESSAGE_PUBLISHED',
  'MESSAGE_CONSUMED',
  'LOCK_ACQUIRED',
  'LOCK_REJECTED',
  'PAYMENT_AUTHORIZED',
  'PAYMENT_FAILED',
  'INVENTORY_RESERVED',
  'INVENTORY_REJECTED',
  'TIMEOUT',
  'RETRY',
  'CIRCUIT_OPENED',
  'COMPONENT_FAILURE',
  'COMPONENT_RECOVERY',
  'RESPONSE_SENT',
]);

export const SystemEventSchema = z.object({
  id: z.string().min(1).max(128),
  tick: z.number().int().nonnegative(),
  simTimeMs: z.number().nonnegative(),
  type: SystemEventTypeSchema,
  source: ComponentIdSchema,
  target: ComponentIdSchema.optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  latencyMs: z.number().min(0).max(600000).optional(),
  result: z.enum(['SUCCESS', 'FAILURE', 'PENDING']).optional(),
  causationId: z.string().max(128).optional(),
  explain: z.string().max(500).optional(),
});

export const FailureInjectionSchema = z.object({
  id: z.string().min(1).max(64),
  target: ComponentIdSchema,
  type: z.enum(['crash', 'latency', 'error', 'partition', 'capacity']),
  startTick: z.number().int().nonnegative(),
  durationTicks: z.number().int().positive().max(100000).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const SystemIntentSchema = z.object({
  type: z.enum(['SYSTEM_START', 'SYSTEM_STEP', 'SYSTEM_ACTION', 'SYSTEM_FAILURE', 'SYSTEM_RESET']),
  systemId: z.string().regex(/^[a-z0-9-]+$/),
  scenarioId: z.string().min(1).max(64).optional(),
  action: z.object({ type: z.string().min(1).max(64), payload: z.record(z.string(), z.unknown()).default({}) }).optional(),
  failure: FailureInjectionSchema.optional(),
  ticks: z.number().int().min(1).max(1000).default(1),
});

export type SystemEvent = z.infer<typeof SystemEventSchema>;
export type SystemEventType = z.infer<typeof SystemEventTypeSchema>;
export type FailureInjection = z.infer<typeof FailureInjectionSchema>;
export type SystemIntent = z.infer<typeof SystemIntentSchema>;
