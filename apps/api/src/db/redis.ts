import { Redis } from 'ioredis';
import { parseEnv, ApiEnvSchema, type ApiEnv } from '@the-visualizer/config';
import { logger } from '@the-visualizer/logging';

const env = parseEnv(ApiEnvSchema) as ApiEnv;

// Initialize ioredis instance
export const redis = new Redis(env.REDIS_URL, {
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true, // Do not block application startup on Redis connection
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info('Connected to Redis server');
});

/**
 * Connects to Redis explicitly (to warm connection before servicing requests).
 */
export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (err) {
    logger.warn({ err }, 'Failed to establish connection to Redis server on startup');
  }
}

/**
 * Caches a serialized topology definition by ID (Time-To-Live = 1 hour).
 */
export async function cacheTopology(id: string, definitionJsonStr: string): Promise<void> {
  try {
    await redis.setex(`topology:${id}`, 3600, definitionJsonStr);
  } catch (err) {
    logger.warn({ err, id }, 'Failed to cache topology in Redis');
  }
}

/**
 * Fetches cached topology definition. Returns null if not cached or Redis fails.
 */
export async function getCachedTopology(id: string): Promise<string | null> {
  try {
    return await redis.get(`topology:${id}`);
  } catch (err) {
    logger.warn({ err, id }, 'Failed to read cached topology from Redis');
    return null;
  }
}

/**
 * Invalidates a topology cache entry on update/deletion.
 */
export async function invalidateTopologyCache(id: string): Promise<void> {
  try {
    await redis.del(`topology:${id}`);
  } catch (err) {
    logger.warn({ err, id }, 'Failed to invalidate topology cache entry');
  }
}
