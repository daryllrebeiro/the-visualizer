import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { redis } from '../db/redis.js';
import { rateLimiter } from './rate-limiter.js';

describe('Redis Rate Limiting Middleware', () => {
  beforeAll(async () => {
    if (redis.status === 'wait') {
      await redis.connect();
    }
  });

  beforeEach(async () => {
    const keys = await redis.keys('rate:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });
  it('should allow requests below limit and return X-RateLimit headers', async () => {
    const testApp = new Hono();
    testApp.use('*', rateLimiter({ limit: 5, refillRate: 1 }));
    testApp.get('/test', (c) => c.text('OK'));

    const res = await testApp.request('/test');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
    expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
  });

  it('should block requests and return 429 when limit is exceeded', async () => {
    const testApp = new Hono();
    // Set limit = 1 to trigger block on second request
    testApp.use('*', rateLimiter({ limit: 1, refillRate: 1 }));
    testApp.get('/test', (c) => c.text('OK'));

    // Request 1: Allowed
    const res1 = await testApp.request('/test');
    expect(res1.status).toBe(200);

    // Request 2: Blocked
    const res2 = await testApp.request('/test');
    expect(res2.status).toBe(429);
    const body = (await res2.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
