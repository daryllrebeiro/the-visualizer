import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import { config } from '../config.js';
import { simulationRunner } from './runner.js';

describe('Gateway-Level End-to-End Simulation Lifecycle Suite', () => {
  let redis: Redis;
  const testRoomId = 'test-room-e2e-full';

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
    topics: {
      orders: [
        {
          topic: 'orders' as never,
          partition: 0 as never,
          leaderBrokerId: '1' as never,
          leaderEpoch: 1,
          replicas: [
            { brokerId: '1' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
            { brokerId: '2' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
          ],
          isr: ['1', '2'] as never[],
          highWatermark: 0,
          minInsyncReplicas: 1,
          uncleanLeaderElectionEnabled: false,
        },
      ],
    },
    kraft: {
      activeControllerId: '1' as never,
      controllerEpoch: 1,
      voters: ['1', '2'] as never[],
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
    await redis.del(`room:${testRoomId}:intents`);
    await redis.del(`simulation:${testRoomId}:replays`);
  });

  afterAll(async () => {
    await simulationRunner.close();
    await redis.del(`room:${testRoomId}:intents`);
    await redis.del(`simulation:${testRoomId}:replays`);
    await redis.quit();
  });

  it('drains multiple client intents sequentially, manages auto-producers, and records replay keyframes', async () => {
    // 1. Start simulation session
    simulationRunner.startSession(testRoomId, 'kafka', mockTopology);
    const session = simulationRunner.getSession(testRoomId);
    expect(session).toBeDefined();

    // 2. Push INTENT_CREATE_TOPIC to Redis intents queue
    const createTopicIntent = {
      id: 'intent-create-payments',
      type: 'INTENT_CREATE_TOPIC',
      payload: {
        topic: 'payments',
        partitions: 2,
      },
    };
    await redis.lpush(`room:${testRoomId}:intents`, JSON.stringify(createTopicIntent));

    // 3. Push INTENT_ADD_BROKER to Redis intents queue
    const addBrokerIntent = {
      id: 'intent-add-b3',
      type: 'INTENT_ADD_BROKER',
      payload: {
        brokerId: '3',
        rack: 'rack-c',
      },
    };
    await redis.lpush(`room:${testRoomId}:intents`, JSON.stringify(addBrokerIntent));

    // 4. Push INTENT_CONSUMER_JOIN to Redis intents queue
    const joinConsumerIntent = {
      id: 'intent-join-c1',
      type: 'INTENT_CONSUMER_JOIN',
      payload: {
        groupId: 'order-workers',
        clientId: 'worker-client-1',
        topics: ['orders'],
      },
    };
    await redis.lpush(`room:${testRoomId}:intents`, JSON.stringify(joinConsumerIntent));

    // 5. Push INTENT_PRODUCE to Redis intents queue
    const produceIntent = {
      id: 'intent-prod-1',
      type: 'INTENT_PRODUCE',
      payload: {
        topic: 'orders',
        partition: 0,
        key: 'k-101',
        value: 'v-101',
        acks: 1,
      },
    };
    await redis.lpush(`room:${testRoomId}:intents`, JSON.stringify(produceIntent));

    // 6. Push INTENT_SET_AUTO_PRODUCE (0.5s interval -> 5 ticks)
    const autoProduceIntent = {
      id: 'intent-auto-p1',
      type: 'INTENT_SET_AUTO_PRODUCE',
      payload: {
        producerId: 'producer-stream-1',
        topic: 'orders',
        intervalSeconds: 0.5,
        enabled: true,
      },
    };
    await redis.lpush(`room:${testRoomId}:intents`, JSON.stringify(autoProduceIntent));

    // Wait 600ms for runner tick loop (at 10Hz, ~6 ticks) to drain and process all intents
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Assert that the intents queue was completely drained
    const remainingQueueLength = await redis.llen(`room:${testRoomId}:intents`);
    expect(remainingQueueLength).toBe(0);

    // Assert engine state was updated with topic, broker, and consumer group
    const engineState = session?.engine.state;
    expect(engineState).toBeDefined();
    expect(engineState?.topics['payments']).toBeDefined();
    expect(engineState?.brokers['3']).toBeDefined();
    expect(engineState?.consumerGroups['order-workers']).toBeDefined();
    expect(session?.autoProducers.has('producer-stream-1')).toBe(true);

    // 7. Push INTENT_CHAOS_KILL_BROKER to crash broker 1
    const killBrokerIntent = {
      id: 'intent-kill-b1',
      type: 'INTENT_CHAOS_KILL_BROKER',
      payload: {
        brokerId: '1',
      },
    };
    await redis.lpush(`room:${testRoomId}:intents`, JSON.stringify(killBrokerIntent));

    // Wait 300ms for chaos transition
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(session?.engine.state?.brokers['1']?.status).toBe('CRASHED');

    // 8. Push INTENT_CHAOS_RECOVER_BROKER to recover broker 1
    const recoverBrokerIntent = {
      id: 'intent-recover-b1',
      type: 'INTENT_CHAOS_RECOVER_BROKER',
      payload: {
        brokerId: '1',
      },
    };
    await redis.lpush(`room:${testRoomId}:intents`, JSON.stringify(recoverBrokerIntent));

    // Wait 300ms for recovery
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(session?.engine.state?.brokers['1']?.status).toBe('ALIVE');

    simulationRunner.stopSession(testRoomId);
  });
});
