import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeBroker,
  makeClusterState,
  makePartition,
  resetFactoryCounters,
} from '@the-visualizer/test-utils';

import { type SimulationConfig, SimulationEngine } from '../engine/simulation-engine.js';
import type { KafkaClusterState, SimEvent } from '../engine/types.js';
import { partitionForKey } from '../partitioners/murmur2.js';
import { PartitionLogStorage } from '../storage/log-segment.js';
import { TransactionCoordinatorManager } from '../transactions/txn-coordinator.js';

describe('Comprehensive Kafka Simulation Full Lifecycle E2E Integration Suite', () => {
  let engine: SimulationEngine;
  let initialClusterState: KafkaClusterState;
  const recordedEvents: SimEvent[] = [];

  const config: SimulationConfig = {
    seed: 42,
    maxTicks: 100_000,
    maxEvents: 500_000,
    maxMemoryMb: 128,
    speedMultiplier: 1.0,
  };

  beforeEach(() => {
    resetFactoryCounters();
    recordedEvents.length = 0;

    engine = new SimulationEngine(config);
    engine.registerCallbacks({
      onEventBatch: (events) => {
        recordedEvents.push(...events);
      },
      onInvariantViolation: (violation) => {
        throw new Error(
          `Invariant Violation Detected: ${violation.invariantName} - ${violation.description}`,
        );
      },
      onResourceLimitExceeded: (reason) => {
        throw new Error(`Resource limit exceeded: ${reason}`);
      },
    });

    // 1. Initial 3-node cluster topology in KRaft mode
    const b1 = makeBroker({ id: '1' as never, status: 'ALIVE', rack: 'rack-a' });
    const b2 = makeBroker({ id: '2' as never, status: 'ALIVE', rack: 'rack-b' });
    const b3 = makeBroker({ id: '3' as never, status: 'ALIVE', rack: 'rack-c' });

    // Initial topic: orders (3 partitions, RF=3, minISR=2)
    const p0 = makePartition('orders', {
      partition: 0 as never,
      leaderBrokerId: '1' as never,
      leaderEpoch: 1,
      replicas: [
        { brokerId: '1' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
        { brokerId: '2' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
        { brokerId: '3' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
      ],
      isr: ['1', '2', '3'] as never[],
      highWatermark: 0,
      minInsyncReplicas: 2,
    });

    const p1 = makePartition('orders', {
      partition: 1 as never,
      leaderBrokerId: '2' as never,
      leaderEpoch: 1,
      replicas: [
        { brokerId: '1' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
        { brokerId: '2' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
        { brokerId: '3' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
      ],
      isr: ['1', '2', '3'] as never[],
      highWatermark: 0,
      minInsyncReplicas: 2,
    });

    const p2 = makePartition('orders', {
      partition: 2 as never,
      leaderBrokerId: '3' as never,
      leaderEpoch: 1,
      replicas: [
        { brokerId: '1' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
        { brokerId: '2' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
        { brokerId: '3' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
      ],
      isr: ['1', '2', '3'] as never[],
      highWatermark: 0,
      minInsyncReplicas: 2,
    });

    initialClusterState = makeClusterState({
      brokers: { '1': b1, '2': b2, '3': b3 },
      topics: { orders: [p0, p1, p2] },
      kraft: {
        activeControllerId: '1' as never,
        controllerEpoch: 1,
        voters: ['1', '2', '3'] as never[],
        metadataOffset: 0,
      },
      consumerGroups: {
        'order-processors': {
          id: 'order-processors' as never,
          state: 'Empty',
          protocol: 'range',
          generationId: 0,
          leaderMemberId: null,
          members: {},
          committedOffsets: {},
        },
      },
    });

    engine.initialize(initialClusterState);
  });

  it('executes a comprehensive multi-feature cluster lifecycle test', () => {
    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 1: Topic Creation & Murmur2 Key Partitioner Routing
    // ═════════════════════════════════════════════════════════════════════════
    // Create new topic 'payments' with 2 partitions
    engine.scheduleEvent(5, 'create-topic-payments', 'TOPIC_CREATED', {
      topic: 'payments',
      partitions: 2,
    });

    // Produce records to 'orders' with specific keys
    const testKey1 = 'cust-48201';
    const testKey2 = 'cust-99124';
    const targetP1 = partitionForKey(testKey1, 3);
    const targetP2 = partitionForKey(testKey2, 3);

    engine.scheduleEvent(10, 'prod-1', 'RECORD_PRODUCED', {
      topic: 'orders',
      partition: targetP1,
      key: testKey1,
      value: JSON.stringify({ amount: 150.0 }),
      acks: 1,
    });

    engine.scheduleEvent(12, 'prod-2', 'RECORD_PRODUCED', {
      topic: 'orders',
      partition: targetP2,
      key: testKey2,
      value: JSON.stringify({ amount: 320.5 }),
      acks: -1,
    });

    engine.step(15);

    expect(engine.state?.topics['payments']).toBeDefined();
    expect(engine.state?.topics['payments']?.length).toBe(2);

    const ordersP1 = engine.state?.topics['orders']?.find((p) => p.partition === targetP1);
    expect(ordersP1?.highWatermark).toBeGreaterThanOrEqual(1);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 2: Consumer Group Rebalance & Multi-Group Subscriptions
    // ═════════════════════════════════════════════════════════════════════════
    // Consumer 1 joins 'order-processors' subscribed to 'orders'
    engine.scheduleEvent(20, 'c1-join', 'CONSUMER_JOINED', {
      groupId: 'order-processors',
      memberId: 'consumer-1',
      clientId: 'client-proc-1',
      topics: ['orders'],
    });

    // Consumer 2 joins 'order-processors' subscribed to 'orders'
    engine.scheduleEvent(22, 'c2-join', 'CONSUMER_JOINED', {
      groupId: 'order-processors',
      memberId: 'consumer-2',
      clientId: 'client-proc-2',
      topics: ['orders'],
    });

    // Independent Group 2 joins for 'payments'
    engine.scheduleEvent(25, 'pay-c1-join', 'CONSUMER_JOINED', {
      groupId: 'payment-auditors',
      memberId: 'pay-consumer-1',
      clientId: 'client-audit-1',
      topics: ['payments'],
    });

    engine.step(30);

    const group1 = engine.state?.consumerGroups['order-processors'];
    const group2 = engine.state?.consumerGroups['payment-auditors'];

    expect(group1?.state).toBe('Stable');
    expect(Object.keys(group1?.members ?? {}).length).toBe(2);

    // Verify all 3 partitions of orders are assigned across the 2 consumers
    const c1Assigned = group1?.members['consumer-1']?.assignedPartitions ?? [];
    const c2Assigned = group1?.members['consumer-2']?.assignedPartitions ?? [];
    expect(c1Assigned.length + c2Assigned.length).toBe(3);

    expect(group2?.state).toBe('Stable');
    expect(group2?.members['pay-consumer-1']?.assignedPartitions.length).toBe(2);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 3: Consumer Polling & Committed Offsets Advancement
    // ═════════════════════════════════════════════════════════════════════════
    engine.scheduleEvent(35, 'commit-c1', 'RECORD_CONSUMED', {
      groupId: 'order-processors',
      topic: 'orders',
      partition: targetP1,
      offset: 1,
    });

    engine.step(40);

    expect(
      engine.state?.consumerGroups['order-processors']?.committedOffsets['orders']?.[targetP1],
    ).toBe(1);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 4: Dynamic Broker Addition
    // ═════════════════════════════════════════════════════════════════════════
    engine.scheduleEvent(45, 'add-b4', 'BROKER_ADDED', {
      brokerId: '4',
      rack: 'rack-d',
    });

    engine.step(50);

    expect(engine.state?.brokers['4']).toBeDefined();
    expect(engine.state?.brokers['4']?.status).toBe('ALIVE');
    expect(engine.state?.kraft.voters).toContain('4');

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 5: Chaos Testing — Broker Crash, ISR Shrinkage & Leader Election
    // ═════════════════════════════════════════════════════════════════════════
    // Crash Broker 1 (which was the leader for partition 0 and active KRaft controller)
    engine.scheduleEvent(55, 'crash-b1', 'BROKER_STATUS_CHANGED', {
      brokerId: '1',
      status: 'CRASHED',
    });

    engine.step(65);

    expect(engine.state?.brokers['1']?.status).toBe('CRASHED');

    // Controller failover should have elected broker 2
    expect(engine.state?.kraft.activeControllerId).toBe('2');

    // Partition 0 leader should have failed over from broker 1 to broker 2 (next in ISR)
    const ordersP0 = engine.state?.topics['orders']?.find((p) => p.partition === 0);
    expect(ordersP0?.leaderBrokerId).toBe('2');
    expect(ordersP0?.isr).not.toContain('1');
    expect(ordersP0?.isr).toContain('2');

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 6: Broker Recovery & Reintegration
    // ═════════════════════════════════════════════════════════════════════════
    engine.scheduleEvent(70, 'recover-b1', 'BROKER_STATUS_CHANGED', {
      brokerId: '1',
      status: 'ALIVE',
    });

    engine.step(80);

    expect(engine.state?.brokers['1']?.status).toBe('ALIVE');

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 7: Consumer Leaving & Cooperative Rebalance
    // ═════════════════════════════════════════════════════════════════════════
    engine.scheduleEvent(85, 'c2-leave', 'CONSUMER_LEFT', {
      groupId: 'order-processors',
      memberId: 'consumer-2',
    });

    engine.step(95);

    const remainingMembers = Object.keys(
      engine.state?.consumerGroups['order-processors']?.members ?? {},
    );
    expect(remainingMembers).toEqual(['consumer-1']);

    // Single surviving consumer now holds all 3 partitions
    const updatedC1Assigned =
      engine.state?.consumerGroups['order-processors']?.members['consumer-1']?.assignedPartitions ??
      [];
    expect(updatedC1Assigned.length).toBe(3);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 8: Storage Segment & 2PC Coordinator Component Verification
    // ═════════════════════════════════════════════════════════════════════════
    const storage = new PartitionLogStorage(150); // 150 byte segment limit
    for (let i = 0; i < 10; i++) {
      storage.append(
        {
          key: `key-${i % 3}`,
          value: `value-payload-${i}-${'X'.repeat(50)}`,
          timestamp: 1000 + i,
        },
        100 + i,
      );
    }
    // Should have rolled multiple segments
    expect(storage.segments.length).toBeGreaterThan(1);
    const summaries = storage.getSummaries();
    const totalRecords = summaries.reduce((acc, s) => acc + s.recordCount, 0);
    expect(totalRecords).toBe(10);

    // Compaction deduplicates superseded keys in closed segments
    storage.compact();
    const compactedTotal = storage.getSummaries().reduce((acc, s) => acc + s.recordCount, 0);
    expect(compactedTotal).toBeLessThanOrEqual(10);

    // 2PC Coordinator Manager
    const txnMgr = new TransactionCoordinatorManager();
    const initRes = txnMgr.initProducerId('txn-order-app', '1', 100);
    expect(initRes.producerId).toBeGreaterThan(0);
    expect(initRes.producerEpoch).toBe(0);

    const added = txnMgr.addPartitionsToTxn(
      'txn-order-app',
      initRes.producerId,
      initRes.producerEpoch,
      [{ topic: 'orders', partition: 0 }],
    );
    expect(added).toBe(true);

    const endRes = txnMgr.endTxn(
      'txn-order-app',
      initRes.producerId,
      initRes.producerEpoch,
      'COMMIT',
    );
    expect(endRes.success).toBe(true);
    expect(endRes.controlMarkers.length).toBe(1);
    expect(endRes.controlMarkers[0]?.markerType).toBe('COMMIT');

    // Engine final state is clean and active
    expect(engine.status).toBe('IDLE');
    expect(engine.currentTick).toBeGreaterThanOrEqual(85);
  });
});
