import { z } from 'zod';

// ─── Resource Limits ─────────────────────────────────────────────────────────
// These mirror §14 of the implementation plan.
// Values are enforced at: Edge, Gateway, Service, and Engine layers.

export const ResourceTierSchema = z.enum(['FREE', 'PRO', 'SYSTEM']);
export type ResourceTier = z.infer<typeof ResourceTierSchema>;

export interface TierLimits {
  maxBrokersPerCluster: number;
  maxPartitionsPerTopic: number;
  maxConcurrentProducers: number;
  maxConcurrentConsumers: number;
  maxVirtualSimTicks: number;
  maxWsMessagesPerSec: number;
  maxWorkerMemoryMb: number;
  maxTopologyUploadBytes: number;
}

export const RESOURCE_LIMITS: Record<ResourceTier, TierLimits> = {
  FREE: {
    maxBrokersPerCluster: 6,
    maxPartitionsPerTopic: 12,
    maxConcurrentProducers: 20,
    maxConcurrentConsumers: 20,
    maxVirtualSimTicks: 5_000,
    maxWsMessagesPerSec: 20,
    maxWorkerMemoryMb: 64,
    maxTopologyUploadBytes: 512 * 1024, // 512 KB
  },
  PRO: {
    maxBrokersPerCluster: 30,
    maxPartitionsPerTopic: 50,
    maxConcurrentProducers: 100,
    maxConcurrentConsumers: 100,
    maxVirtualSimTicks: 100_000,
    maxWsMessagesPerSec: 100,
    maxWorkerMemoryMb: 256,
    maxTopologyUploadBytes: 5 * 1024 * 1024, // 5 MB
  },
  SYSTEM: {
    maxBrokersPerCluster: 100,
    maxPartitionsPerTopic: 250,
    maxConcurrentProducers: 500,
    maxConcurrentConsumers: 500,
    maxVirtualSimTicks: 500_000,
    maxWsMessagesPerSec: 250,
    maxWorkerMemoryMb: 512,
    maxTopologyUploadBytes: 10 * 1024 * 1024, // 10 MB
  },
};

// ─── Environment Config ───────────────────────────────────────────────────────

const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
});

const DatabaseEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

const RedisEnvSchema = z.object({
  REDIS_URL: z.string(),
  REDIS_PASSWORD: z.string().optional(),
});

const AuthEnvSchema = z.object({
  SESSION_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32).optional(),
  OAUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
  OAUTH_GITHUB_CLIENT_ID: z.string().optional(),
  OAUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
});

const ApiEnvSchema = BaseEnvSchema.merge(DatabaseEnvSchema)
  .merge(RedisEnvSchema)
  .merge(AuthEnvSchema);

/**
 * Parse and validate environment variables.
 * Throws immediately on startup if required env vars are missing or invalid.
 * This prevents silent misconfiguration from causing runtime failures.
 */
export function parseEnv(schema: z.ZodType, env: NodeJS.ProcessEnv = process.env): unknown {
  const result = schema.safeParse(env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    throw new Error(`❌ Invalid environment configuration:\n${JSON.stringify(errors, null, 2)}`);
  }
  return result.data;
}

export { ApiEnvSchema, BaseEnvSchema, DatabaseEnvSchema, RedisEnvSchema };
export type ApiEnv = z.infer<typeof ApiEnvSchema>;
