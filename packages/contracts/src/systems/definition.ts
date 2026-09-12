import { z } from 'zod';

export const ComponentIdSchema = z.string().min(1).max(64);

export const ComponentTypeSchema = z.enum([
  'client',
  'gateway',
  'service',
  'worker',
  'postgres',
  'redis',
  'kafka',
  'rabbitmq',
  'object-store',
  'cdn',
  'vectordb',
  'llm',
  'embedding',
  'gpu-cluster',
  'websocket-server',
  'queue',
  'lock',
  'database-generic',
]);

export const ComponentCategorySchema = z.enum([
  'compute',
  'storage',
  'cache',
  'messaging',
  'network',
  'database',
  'ai',
  'observability',
]);

export const ProtocolSchema = z.enum([
  'http',
  'grpc',
  'websocket',
  'tcp',
  'kafka',
  'queue',
  'database',
  'event',
]);

export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).max(10).default(0),
  baseBackoffMs: z.number().min(0).max(60000).default(100),
  timeoutMs: z.number().min(0).max(600000).optional(),
});

export const SystemComponentSchema = z.object({
  id: ComponentIdSchema,
  type: ComponentTypeSchema,
  name: z.string().min(1).max(80),
  category: ComponentCategorySchema,
  domainId: z.string().min(1).max(64).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const SystemConnectionSchema = z.object({
  id: z.string().min(1).max(64),
  source: ComponentIdSchema,
  target: ComponentIdSchema,
  protocol: ProtocolSchema,
  direction: z.enum(['unidirectional', 'bidirectional']).default('unidirectional'),
  config: z
    .object({
      latencyMs: z.number().min(0).max(60000).default(0),
      timeoutMs: z.number().min(0).max(600000).optional(),
      retryPolicy: RetryPolicySchema.optional(),
      capacityPerSec: z.number().positive().max(1000000).optional(),
    })
    .default({}),
});

export const SystemScenarioSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  seed: z.number().int().min(0).max(4294967295).default(42),
  events: z
    .array(
      z.object({
        tick: z.number().int().min(1).max(100000),
        type: z.string().min(1).max(64),
        source: ComponentIdSchema.optional(),
        target: ComponentIdSchema.optional(),
        payload: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .max(5000)
    .default([]),
  failures: z
    .array(
      z.object({
        target: ComponentIdSchema,
        type: z.enum(['crash', 'latency', 'error', 'partition', 'capacity']),
        startTick: z.number().int().min(1).max(100000),
        durationTicks: z.number().int().min(1).max(100000).optional(),
        config: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .max(64)
    .default([]),
  explain: z.record(z.string(), z.string().max(500)).default({}),
});

export const SystemInvariantSchema = z.object({
  id: z.string().min(1).max(64),
  description: z.string().min(1).max(500),
});

export const SystemMetadataSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  author: z.string().max(120).optional(),
  tags: z.array(z.string().max(32)).max(16).default([]),
  learn: z
    .object({
      what: z.string().max(2000).optional(),
      why: z.string().max(2000).optional(),
      tradeoffs: z.string().max(2000).optional(),
    })
    .default({}),
});

export const SystemDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    name: z.string().min(1).max(120),
    description: z.string().max(4000).default(''),
    components: z.array(SystemComponentSchema).min(1).max(64),
    connections: z.array(SystemConnectionSchema).max(128).default([]),
    scenarios: z.array(SystemScenarioSchema).max(64).default([]),
    invariants: z.array(SystemInvariantSchema).max(32).default([]),
    metadata: SystemMetadataSchema,
  })
  .superRefine((def, ctx) => {
    const compIds = new Set(def.components.map((c) => c.id));
    const seenComp = new Set<string>();
    for (const c of def.components) {
      if (seenComp.has(c.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate component id: ${c.id}` });
      }
      seenComp.add(c.id);
    }
    const seenConn = new Set<string>();
    for (const conn of def.connections) {
      if (seenConn.has(conn.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate connection id: ${conn.id}` });
      }
      seenConn.add(conn.id);
      if (!compIds.has(conn.source)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `connection ${conn.id} references missing source ${conn.source}` });
      }
      if (!compIds.has(conn.target)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `connection ${conn.id} references missing target ${conn.target}` });
      }
      if (conn.source === conn.target && conn.direction !== 'bidirectional') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `connection ${conn.id} self-loop must be bidirectional` });
      }
    }
    // Prototype pollution guard on config keys
    const badKey = (o: Record<string, unknown>): string | null => {
      for (const k of Object.keys(o)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return k;
      }
      return null;
    };
    for (const c of def.components) {
      const bad = badKey(c.config as Record<string, unknown>);
      if (bad) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `component ${c.id} config has forbidden key ${bad}` });
    }
  });

export type SystemDefinition = z.infer<typeof SystemDefinitionSchema>;
export type SystemComponent = z.infer<typeof SystemComponentSchema>;
export type SystemConnection = z.infer<typeof SystemConnectionSchema>;
export type SystemScenario = z.infer<typeof SystemScenarioSchema>;
export type ComponentId = z.infer<typeof ComponentIdSchema>;
export type Protocol = z.infer<typeof ProtocolSchema>;
