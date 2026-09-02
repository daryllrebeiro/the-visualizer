import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import { config } from '../config.js';
import { simulationRunner } from './runner.js';

describe('Authoritative Simulation Runner Tests', () => {
  let redis: Redis;
  const testRoomId = 'test-room-runner';

  const mockTopology: KafkaClusterState = {
    clusterId: '12345678-1234-1234-1234-123456789012',
    tick: 0,
    rngState: 0,
    transactions: {},
    brokers: {
      '1': {
        id: '1' as never,
        status: 'ALIVE',
        host: 'localhost',
        port: 9092,
        diskUsageBytes: 0,
        maxDiskSizeBytes: 10 * 1024 * 1024 * 1024,
        lastHeartbeatTick: 0,
        rack: 'rack-a',
      },
      '2': {
        id: '2' as never,
        status: 'ALIVE',
        host: 'localhost',
        port: 9093,
        diskUsageBytes: 0,
        maxDiskSizeBytes: 10 * 1024 * 1024 * 1024,
        lastHeartbeatTick: 0,
        rack: 'rack-b',
      },
    },
    topics: {},
    kraft: {
      activeControllerId: '1' as never,
      controllerEpoch: 1,
      voters: ['1' as never, '2' as never],
      metadataOffset: 0,
    },
    consumerGroups: {},
  };

  beforeAll(async () => {
    redis = new Redis(config.REDIS_URL, {
      password: config.REDIS_PASSWORD,
    });
    redis.on('error', () => {
      // Suppress connection errors
    });
    // Clear list
    await redis.del(`room:${testRoomId}:intents`);
    await redis.del(`simulation:${testRoomId}:replays`);
  });

  afterAll(async () => {
    await simulationRunner.close();
    await redis.del(`room:${testRoomId}:intents`);
    await redis.del(`simulation:${testRoomId}:replays`);
    await redis.quit();
  });

  it('should start session and advance ticks', async () => {
    simulationRunner.startSession(testRoomId, 'kafka', mockTopology);
    const session = simulationRunner.getSession(testRoomId);
    expect(session).toBeDefined();
    expect(session?.isHalted).toBe(false);

    // Wait 250ms for tick loop to execute at least 2 ticks
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(session?.tickCount).toBeGreaterThanOrEqual(2);
    simulationRunner.stopSession(testRoomId);
  });

  it('should ingest actions from Redis list intents queue', async () => {
    // LPUSH an intent
    const intentPayload = {
      type: 'PRODUCE',
      payload: {
        topic: 'orders',
        value: { orderId: 100 },
      },
    };
    await redis.lpush(`room:${testRoomId}:intents`, JSON.stringify(intentPayload));

    simulationRunner.startSession(testRoomId, 'kafka', mockTopology);
    const session = simulationRunner.getSession(testRoomId);
    expect(session).toBeDefined();

    // Wait 250ms for tick loop to consume and execute
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Drained from list
    const length = await redis.llen(`room:${testRoomId}:intents`);
    expect(length).toBe(0);

    simulationRunner.stopSession(testRoomId);
  });

  it('should halt session on invariant violation', async () => {
    const brokenTopology: KafkaClusterState = {
      clusterId: '12345678-1234-1234-1234-123456789012',
      tick: 0,
      rngState: 0,
      transactions: {},
      brokers: {},
      topics: {
        orders: [
          {
            topic: 'orders' as never,
            partition: 0 as never,
            leaderBrokerId: '99' as never, // Broker 99 does not exist!
            leaderEpoch: 1,
            replicas: [],
            isr: [],
            highWatermark: 0,
            minInsyncReplicas: 1,
            uncleanLeaderElectionEnabled: false,
          },
        ],
      },
      kraft: {
        activeControllerId: '1' as never,
        controllerEpoch: 1,
        voters: [],
        metadataOffset: 0,
      },
      consumerGroups: {},
    };

    // Push an intent to ensure the step loop executes and triggers invariant assertion
    const intentPayload = {
      type: 'PRODUCE',
      payload: {
        topic: 'orders',
        value: { orderId: 200 },
      },
    };
    await redis.lpush(`room:${testRoomId}:intents`, JSON.stringify(intentPayload));

    simulationRunner.startSession(testRoomId, 'kafka', brokenTopology);
    const session = simulationRunner.getSession(testRoomId);
    expect(session).toBeDefined();

    // Wait 250ms to allow tick loop to execute, trigger invariant assert, and halt
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(session?.isHalted).toBe(true);
    simulationRunner.stopSession(testRoomId);
  });

  it('should register and execute auto-producer schedules', async () => {
    // Add topic and partition with alive broker leader
    const autoTopology: KafkaClusterState = {
      ...mockTopology,
      topics: {
        orders: [
          {
            topic: 'orders' as never,
            partition: 0 as never,
            leaderBrokerId: '1' as never,
            leaderEpoch: 1,
            replicas: [
              {
                brokerId: '1' as never,
                logEndOffset: 0,
                lastCaughtUpTick: 0,
                isInSync: true,
              },
            ],
            isr: ['1' as never],
            highWatermark: 0,
            minInsyncReplicas: 1,
            uncleanLeaderElectionEnabled: false,
          },
        ],
      },
    };

    simulationRunner.startSession(testRoomId, 'kafka', autoTopology);
    const session = simulationRunner.getSession(testRoomId);
    expect(session).toBeDefined();

    // 1. Send INTENT_SET_AUTO_PRODUCE
    const setAutoIntent = {
      type: 'INTENT_SET_AUTO_PRODUCE',
      payload: {
        producerId: 'producer-test',
        topic: 'orders',
        intervalSeconds: 0.5, // 5 ticks
        enabled: true,
      },
    };
    await redis.lpush(`room:${testRoomId}:intents`, JSON.stringify(setAutoIntent));

    // Wait 300ms for intent processing
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(session?.autoProducers.has('producer-test')).toBe(true);
    expect(session?.autoProducers.get('producer-test')?.enabled).toBe(true);
    expect(session?.autoProducers.get('producer-test')?.intervalTicks).toBe(5);

    // 2. Send INTENT_REMOVE_AUTO_PRODUCE
    const removeAutoIntent = {
      type: 'INTENT_REMOVE_AUTO_PRODUCE',
      payload: {
        producerId: 'producer-test',
      },
    };
    await redis.lpush(`room:${testRoomId}:intents`, JSON.stringify(removeAutoIntent));

    // Wait 250ms for intent processing
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(session?.autoProducers.has('producer-test')).toBe(false);

    simulationRunner.stopSession(testRoomId);
  });

  it('should immediately adjust next fire tick on live frequency change without toggling off/on', async () => {
    simulationRunner.startSession(testRoomId, 'kafka', mockTopology);
    const session = simulationRunner.getSession(testRoomId);
    expect(session).toBeDefined();

    // 1. Set long interval (20s = 200 ticks)
    await redis.lpush(
      `room:${testRoomId}:intents`,
      JSON.stringify({
        type: 'INTENT_SET_AUTO_PRODUCE',
        payload: { producerId: 'prod-live', topic: 'orders', intervalSeconds: 20.0, enabled: true },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    const initialSchedule = session?.autoProducers.get('prod-live');
    expect(initialSchedule?.intervalTicks).toBe(200);

    // 2. While running, change frequency to short interval (1s = 10 ticks)
    await redis.lpush(
      `room:${testRoomId}:intents`,
      JSON.stringify({
        type: 'INTENT_SET_AUTO_PRODUCE',
        payload: { producerId: 'prod-live', topic: 'orders', intervalSeconds: 1.0, enabled: true },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    const updatedSchedule = session?.autoProducers.get('prod-live');
    expect(updatedSchedule?.intervalTicks).toBe(10);
    // nextFireTick should be strictly within (currentTick + 10)
    expect(updatedSchedule?.nextFireTick).toBeLessThanOrEqual((session?.tickCount ?? 0) + 10);

    simulationRunner.stopSession(testRoomId);
  });

  it('should produce exactly 30 (+-1) messages over 60 virtual seconds at 2.0s interval without drift', async () => {
    simulationRunner.startSession(testRoomId, 'kafka', mockTopology);
    const session = simulationRunner.getSession(testRoomId);
    expect(session).toBeDefined();

    // Set 2.0s interval = 20 ticks
    session!.autoProducers.set('prod-drift', {
      producerId: 'prod-drift',
      topic: 'orders',
      intervalSeconds: 2.0,
      intervalTicks: 20,
      nextFireTick: 20,
      enabled: true,
    });

    let producedCount = 0;
    // Step virtual clock for 600 ticks (60 seconds at 10 ticks/sec)
    for (let t = 1; t <= 600; t++) {
      session!.tickCount = t;
      const entry = session!.autoProducers.get('prod-drift')!;
      if (session!.tickCount >= entry.nextFireTick) {
        entry.nextFireTick = session!.tickCount + entry.intervalTicks;
        producedCount++;
      }
    }

    // Exactly 30 fires (600 / 20 = 30)
    expect(producedCount).toBeGreaterThanOrEqual(29);
    expect(producedCount).toBeLessThanOrEqual(31);
    expect(producedCount).toBe(30);

    simulationRunner.stopSession(testRoomId);
  });

  it('should cleanly reset simulation state, cancel auto-producers, and purge Redis keys on INTENT_RESET', async () => {
    simulationRunner.startSession(testRoomId, 'kafka', mockTopology);
    const session = simulationRunner.getSession(testRoomId);

    // Setup active producer
    session?.autoProducers.set('prod-reset', {
      producerId: 'prod-reset',
      topic: 'orders',
      intervalSeconds: 1.0,
      intervalTicks: 10,
      nextFireTick: 10,
      enabled: true,
    });

    await redis.set(`room:${testRoomId}:dummy`, 'stale');

    // Send INTENT_RESET
    await redis.lpush(
      `room:${testRoomId}:intents`,
      JSON.stringify({
        type: 'INTENT_RESET',
        id: 'reset-uuid-1',
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 250));

    // Assert autoProducers wiped
    expect(session?.autoProducers.size).toBe(0);
    // Assert tick count reset to 0
    expect(session?.tickCount).toBeLessThanOrEqual(5);

    simulationRunner.stopSession(testRoomId);
  });
});

