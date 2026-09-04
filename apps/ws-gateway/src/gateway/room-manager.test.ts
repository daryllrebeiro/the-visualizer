import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { config } from '../config.js';
import { roomManager } from './room-manager.js';

describe('RoomManager Lifecycle & Idle TTL Reaper Tests', () => {
  let redis: Redis;
  const testRoomId = 'test-room-reaper';

  beforeAll(async () => {
    redis = new Redis(config.REDIS_URL, { password: config.REDIS_PASSWORD });
    redis.on('error', () => {});
    await redis.del(`room:${testRoomId}:intents`);
    await redis.del(`topology:${testRoomId}`);
  });

  afterAll(async () => {
    await roomManager.close();
    await redis.del(`room:${testRoomId}:intents`);
    await redis.del(`topology:${testRoomId}`);
    await redis.quit();
  });

  it('should track room activity, transition states, and reap idle rooms after TTL expiry', async () => {
    // 1. Record activity on a new room
    roomManager.recordActivity(testRoomId);
    expect(roomManager.getRoomState(testRoomId)).toBe('ACTIVE');

    // 2. Publish an intent (creates Redis list entry)
    await roomManager.publishIntent(testRoomId, { type: 'TEST_INTENT', id: '123' });
    const queueLen = await redis.llen(`room:${testRoomId}:intents`);
    expect(queueLen).toBe(1);

    // 3. Attempt reaping with a large TTL (30 min) -> Room should NOT be reaped because activity was recent
    const earlyEvictions = await roomManager.reapIdleRooms(30 * 60 * 1000);
    expect(earlyEvictions).not.toContain(testRoomId);
    expect(roomManager.getRoomState(testRoomId)).toBe('ACTIVE');

    // 4. Force reaper with ttlMs = 0 (simulating TTL expiration past inactivity threshold)
    await new Promise((resolve) => setTimeout(resolve, 10));
    const expiredEvictions = await roomManager.reapIdleRooms(0);
    expect(expiredEvictions).toContain(testRoomId);
    expect(roomManager.getRoomState(testRoomId)).toBe('RECLAIMED');

    // 5. Verify Redis keys were purged on eviction
    const remainingQueueLen = await redis.llen(`room:${testRoomId}:intents`);
    expect(remainingQueueLen).toBe(0);
  });
});
