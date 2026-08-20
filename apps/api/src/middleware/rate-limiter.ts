import type { MiddlewareHandler } from 'hono';

import { redis } from '../db/redis.js';

interface RateLimitConfig {
  limit: number; // Maximum bucket capacity
  refillRate: number; // Tokens added per second
}

/**
 * Atomic Token Bucket Rate Limiter using Redis.
 * Returns true if the request is allowed (has tokens), false otherwise.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const key = `rate:${identifier}`;
  const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

  // Lua script for atomic Token Bucket check
  const luaScript = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local refill_rate = tonumber(ARGV[3])
    
    local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
    local tokens = tonumber(data[1])
    local last_refill = tonumber(data[2])
    
    if not tokens then
      tokens = limit
      last_refill = now
    else
      local elapsed = now - last_refill
      if elapsed > 0 then
        tokens = math.min(limit, tokens + elapsed * refill_rate)
        last_refill = now
      end
    end
    
    local allowed = 0
    if tokens >= 1 then
      tokens = tokens - 1
      allowed = 1
    end
    
    redis.call('HSET', key, 'tokens', tokens, 'lastRefill', last_refill)
    redis.call('EXPIRE', key, 86400) -- TTL 1 day
    
    return {allowed, tokens, now}
  `;

  try {
    const res = (await redis.eval(luaScript, 1, key, now, config.limit, config.refillRate)) as [
      number,
      number,
      number,
    ];
    const allowed = res[0] === 1;
    const remaining = res[1];
    return {
      allowed,
      remaining,
      reset: now + Math.ceil((config.limit - remaining) / config.refillRate),
    };
  } catch {
    // If Redis fails, fail open to prevent breaking service under outage
    return { allowed: true, remaining: 1, reset: now };
  }
}

/**
 * Hono Middleware enforcing Token Bucket rate limiting.
 */
export function rateLimiter(
  config: RateLimitConfig = { limit: 60, refillRate: 1 },
): MiddlewareHandler {
  return async (c, next) => {
    // Identify client by IP (x-forwarded-for or remote address)
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'ip-unknown';
    const user = c.get('user') as { id: string } | undefined;
    const identifier = user ? `user:${user.id}` : `ip:${ip}`;

    const { allowed, remaining, reset } = await checkRateLimit(identifier, config);

    c.header('X-RateLimit-Limit', String(config.limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(reset));

    if (!allowed) {
      return c.json(
        {
          success: false,
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many requests. Please try again later.',
          },
        },
        429,
      );
    }

    return next();
  };
}
