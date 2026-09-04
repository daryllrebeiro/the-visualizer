import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeBroker,
  makeClusterState,
  makePartition,
  resetFactoryCounters,
} from '@the-visualizer/test-utils';

import { type SimulationConfig, SimulationEngine } from './simulation-engine.js';
import type { KafkaClusterState, SimEvent } from './types.js';

describe('SimulationEngine state transitions & snapshots', () => {
  let engine: SimulationEngine;
  let initialClusterState: KafkaClusterState;

  const config: SimulationConfig = {
    seed: 12345,
    maxTicks: 10_000,
    maxEvents: 50_000,
    maxMemoryMb: 64,
    speedMultiplier: 1.0,
  };

  beforeEach(() => {
    resetFactoryCounters();
    engine = new SimulationEngine(config);

    // Create 3 brokers
    const b1 = makeBroker({ id: 'broker-1' as never, status: 'ALIVE' });
    const b2 = makeBroker({ id: 'broker-2' as never, status: 'ALIVE' });
    const b3 = makeBroker({ id: 'broker-3' as never, status: 'ALIVE' });

    // Create partition order-part-0 led by broker-1, ISR=[1,2,3]
    const partition = makePartition('orders', {
      leaderBrokerId: 'broker-1' as never,
      leaderEpoch: 1,
      replicas: [
        { brokerId: 'broker-1' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
        { brokerId: 'broker-2' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
        { brokerId: 'broker-3' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
      ],
      isr: ['broker-1', 'broker-2', 'broker-3'] as never[],
      highWatermark: 0,
      minInsyncReplicas: 2,
    });

    initialClusterState = makeClusterState({
      brokers: {
        'broker-1': b1,
        'broker-2': b2,
        'broker-3': b3,
      },
      topics: {
        orders: [partition],
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

  it('should handle broker crash and trigger partition leadership election', () => {
    let receivedEvents: SimEvent[] = [];
    engine.registerCallbacks({
      onEventBatch: (events) => {
        receivedEvents = events;
      },
      onInvariantViolation: () => {
        return;
      },
      onResourceLimitExceeded: () => {
        return;
      },
    });

    // Schedule broker-1 crash event at tick 10
    engine.scheduleEvent(10, 'crash-evt', 'BROKER_STATUS_CHANGED', {
      brokerId: 'broker-1',
      status: 'CRASHED',
    });

    engine.step(15); // Execute past tick 10

    // Verify broker status
    const debugData = JSON.parse(engine.debugDump()) as { currentTick: number };
    expect(debugData.currentTick).toBe(10);

    // Verify partition leader changed to next in ISR (broker-2)
    expect(receivedEvents.some((e) => e.type === 'PARTITION_LEADER_ELECTED')).toBe(true);
    expect(receivedEvents.some((e) => e.type === 'ISR_CHANGED')).toBe(true);
  });

  it('should handle record production, replication, and high-watermark progression', () => {
    let receivedEvents: SimEvent[] = [];
    engine.registerCallbacks({
      onEventBatch: (events) => {
        receivedEvents = events;
      },
      onInvariantViolation: () => {
        return;
      },
      onResourceLimitExceeded: () => {
        return;
      },
    });

    // Schedule produce event at tick 20
    engine.scheduleEvent(20, 'prod-evt', 'RECORD_PRODUCED', {
      topic: 'orders',
      partition: 0,
      acks: -1,
    });

    engine.step(25);

    // Verify append event emitted
    expect(receivedEvents.some((e) => e.type === 'RECORD_PRODUCED')).toBe(true);
    // Since replicas fetched, HW should advance
    expect(receivedEvents.some((e) => e.type === 'HIGH_WATERMARK_ADVANCED')).toBe(true);
  });

  it('should support consumer joining and range cooperative partition rebalance', () => {
    let receivedEvents: SimEvent[] = [];
    engine.registerCallbacks({
      onEventBatch: (events) => {
        receivedEvents = events;
      },
      onInvariantViolation: () => {
        return;
      },
      onResourceLimitExceeded: () => {
        return;
      },
    });

    // Schedule consumer join event at tick 30
    engine.scheduleEvent(30, 'join-evt', 'CONSUMER_JOINED', {
      groupId: 'order-processors',
      memberId: 'member-1',
      clientId: 'client-1',
    });

    engine.step(35);

    expect(receivedEvents.some((e) => e.type === 'CONSUMER_JOINED')).toBe(true);
    expect(receivedEvents.some((e) => e.type === 'REBALANCE_COMPLETED')).toBe(true);
  });

  it('should support stepBack reverse delta patching', () => {
    // 1. Schedule a sequence of events
    engine.scheduleEvent(10, 'crash-evt', 'BROKER_STATUS_CHANGED', {
      brokerId: 'broker-1',
      status: 'CRASHED',
    });

    // 2. Step forward
    engine.step(15);
    const stateAtTick10 = engine.debugDump();

    // 3. Step back
    engine.stepBack();
    const stateAtTick0 = engine.debugDump();

    expect(stateAtTick0).not.toEqual(stateAtTick10);
    const tick0Data = JSON.parse(stateAtTick0) as { currentTick: number };
    expect(tick0Data.currentTick).toBe(0);
  });

  it('should halt execution and trigger callbacks on invariant violation', () => {
    let violationDetected = false;
    engine.registerCallbacks({
      onEventBatch: () => {
        return;
      },
      onInvariantViolation: (violation) => {
        violationDetected = true;
        expect(violation.invariantName).toBe('COMMITTED_OFFSET_BOUND');
      },
      onResourceLimitExceeded: () => {
        return;
      },
    });

    // Setup active consumer group in the engine state
    const parsedState = engine.state;
    if (parsedState) {
      parsedState.consumerGroups['group-1'] = {
        id: 'group-1',
        state: 'Stable',
        protocol: 'range',
        generationId: 1,
        leaderMemberId: 'member-1',
        members: {
          'member-1': {
            memberId: 'member-1',
            clientId: 'client-1',
            clientHost: '127.0.0.1',
            assignedPartitions: [],
            lastHeartbeatTick: 0,
          },
        },
        committedOffsets: {},
      };
    }

    // Schedule RECORD_CONSUMED event at tick 10 with offset 999 (HW is 0)
    engine.scheduleEvent(10, 'consume-evt', 'RECORD_CONSUMED', {
      groupId: 'group-1',
      topic: 'orders',
      partition: 0,
      offset: 999,
    });

    engine.step(15);

    expect(violationDetected).toBe(true);
    expect(engine.status).toBe('HALTED');
  });

  it('should filter partition assignments strictly by member topic subscriptions', () => {
    let rebalanceEvent: SimEvent | undefined;
    engine.registerCallbacks({
      onEventBatch: (events) => {
        const found = events.find((e) => e.type === 'REBALANCE_COMPLETED');
        if (found) rebalanceEvent = found;
      },
      onInvariantViolation: () => {},
      onResourceLimitExceeded: () => {},
    });

    // Create a second topic "payments"
    engine.scheduleEvent(5, 'topic-evt', 'TOPIC_CREATED', {
      topic: 'payments',
      partitions: 1,
    });

    // Consumer-1 joins subscribed only to 'orders'
    engine.scheduleEvent(10, 'c1-join', 'CONSUMER_JOINED', {
      groupId: 'order-processors',
      memberId: 'c1',
      clientId: 'client-c1',
      topics: ['orders'],
    });

    // Consumer-2 joins subscribed only to 'payments'
    engine.scheduleEvent(15, 'c2-join', 'CONSUMER_JOINED', {
      groupId: 'order-processors',
      memberId: 'c2',
      clientId: 'client-c2',
      topics: ['payments'],
    });

    engine.step(20);

    const state = engine.state;
    expect(state).toBeDefined();
    if (state) {
      const group = state.consumerGroups['order-processors'];
      expect(group?.state).toBe('Stable');
      const c1 = group?.members['c1'];
      const c2 = group?.members['c2'];

      // C1 should only have orders partitions
      expect(c1?.assignedPartitions.every((p) => p.topic === 'orders')).toBe(true);
      expect(c1?.assignedPartitions.length).toBeGreaterThan(0);

      // C2 should only have payments partitions
      expect(c2?.assignedPartitions.every((p) => p.topic === 'payments')).toBe(true);
      expect(c2?.assignedPartitions.length).toBeGreaterThan(0);
      expect(rebalanceEvent).toBeDefined();
    }
  });

  it('should mark partition offline (leader=null) when all ISR replicas crash', () => {
    let leaderEvents: SimEvent[] = [];
    engine.registerCallbacks({
      onEventBatch: (events) => {
        leaderEvents.push(...events.filter((e) => e.type === 'PARTITION_LEADER_ELECTED'));
      },
      onInvariantViolation: () => {},
      onResourceLimitExceeded: () => {},
    });

    // Crash all 3 brokers in the cluster
    engine.scheduleEvent(10, 'crash-1', 'BROKER_STATUS_CHANGED', {
      brokerId: 'broker-1',
      status: 'CRASHED',
    });
    engine.scheduleEvent(11, 'crash-2', 'BROKER_STATUS_CHANGED', {
      brokerId: 'broker-2',
      status: 'CRASHED',
    });
    engine.scheduleEvent(12, 'crash-3', 'BROKER_STATUS_CHANGED', {
      brokerId: 'broker-3',
      status: 'CRASHED',
    });

    engine.step(20);

    const state = engine.state;
    expect(state).toBeDefined();
    if (state) {
      const partition = state.topics['orders']?.[0];
      expect(partition?.leaderBrokerId).toBeNull();
      expect(leaderEvents.length).toBeGreaterThan(0);
    }
  });

  it('should support dynamic broker addition', () => {
    engine.scheduleEvent(10, 'add-b4', 'BROKER_ADDED', {
      brokerId: 'broker-4',
      rack: 'rack-a',
    });

    engine.step(15);

    const state = engine.state;
    expect(state).toBeDefined();
    if (state) {
      expect(state.brokers['broker-4']).toBeDefined();
      expect(state.brokers['broker-4']?.status).toBe('ALIVE');
      expect(state.kraft.voters).toContain('broker-4');
    }
  });

  it('should elect new KRaft controller and append metadata log entries when active controller crashes', () => {
    // Initial active controller is broker-1
    const initialState = engine.state;
    if (initialState) {
      initialState.kraft.activeControllerId = 'broker-1';
      initialState.kraft.voters = ['broker-1', 'broker-2', 'broker-3'];
    }

    let kraftEvents: SimEvent[] = [];
    engine.registerCallbacks({
      onEventBatch: (events) => {
        kraftEvents.push(...events.filter((e) => e.type === 'KRAFT_LEADER_ELECTED'));
      },
      onInvariantViolation: () => {},
      onResourceLimitExceeded: () => {},
    });

    // Crash the active controller broker-1 at tick 10
    engine.scheduleEvent(10, 'crash-ctrl', 'BROKER_STATUS_CHANGED', {
      brokerId: 'broker-1',
      status: 'CRASHED',
    });

    engine.step(15);

    const state = engine.state;
    expect(state).toBeDefined();
    if (state) {
      // New controller should be broker-2 (first surviving voter in quorum)
      expect(state.kraft.activeControllerId).toBe('broker-2');
      expect(state.kraft.controllerEpoch).toBeGreaterThan(0);
      expect(state.kraft.metadataLog).toBeDefined();
      expect(state.kraft.metadataLog?.length).toBeGreaterThan(0);

      // Should have emitted a KRAFT_LEADER_ELECTED event
      expect(kraftEvents.length).toBeGreaterThan(0);
      expect(kraftEvents[0]?.payload['activeControllerId']).toBe('broker-2');
    }
  });
});
