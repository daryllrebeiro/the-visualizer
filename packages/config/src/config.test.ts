import { describe, expect, it } from 'vitest';
import { RESOURCE_LIMITS, BaseEnvSchema, parseEnv } from './index.js';

describe('Configuration & Resource Limits', () => {
  it('defines tier limits for FREE, PRO, and SYSTEM tiers', () => {
    expect(RESOURCE_LIMITS.FREE.maxBrokersPerCluster).toBe(6);
    expect(RESOURCE_LIMITS.PRO.maxBrokersPerCluster).toBe(30);
    expect(RESOURCE_LIMITS.SYSTEM.maxBrokersPerCluster).toBe(100);

    expect(RESOURCE_LIMITS.FREE.maxWsMessagesPerSec).toBe(20);
    expect(RESOURCE_LIMITS.SYSTEM.maxWsMessagesPerSec).toBe(250);
  });

  it('parses base environment with defaults', () => {
    const parsed = parseEnv(BaseEnvSchema, {}) as { NODE_ENV: string; PORT: number };
    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.PORT).toBe(3000);
  });
});
