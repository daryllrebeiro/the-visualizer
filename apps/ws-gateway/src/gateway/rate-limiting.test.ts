import { describe, expect, it } from 'vitest';

import { checkConnectionRateLimit } from './ws-server.js';

describe('Gateway Rate Limiting & Bucket Flood Throttling', () => {
  it('permits burst up to 20 messages for free tier and throttles subsequent messages', () => {
    const mockWs: any = {
      userId: 'test-user',
      isAlive: true,
    };

    // First 20 messages should all be allowed
    for (let i = 1; i <= 20; i++) {
      const res = checkConnectionRateLimit(mockWs);
      expect(res.allowed).toBe(true);
      expect(res.terminate).toBe(false);
    }

    // 21st message exceeds 20 token free bucket and must be throttled (allowed: false, terminate: false)
    const throttleRes = checkConnectionRateLimit(mockWs);
    expect(throttleRes.allowed).toBe(false);
    expect(throttleRes.terminate).toBe(false);
  });

  it('triggers forceful socket termination upon exceeding 250 msg/s hard system flood cap', () => {
    const mockWs: any = {
      userId: 'flood-attacker',
      isAlive: true,
    };

    // Consume all 250 hard limit tokens
    for (let i = 1; i <= 250; i++) {
      checkConnectionRateLimit(mockWs);
    }

    // 251st message exceeds hard capacity -> must terminate socket immediately
    const hardLimitRes = checkConnectionRateLimit(mockWs);
    expect(hardLimitRes.allowed).toBe(false);
    expect(hardLimitRes.terminate).toBe(true);
  });
});
