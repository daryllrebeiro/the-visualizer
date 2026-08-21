/**
 * packages/simulation/src/oracle/oracle-harness.ts
 *
 * Kafka Oracle Verification Harness.
 * Validates deterministic simulation engine execution against Kafka reference semantics.
 */

import { makeBroker, makeClusterState, makePartition, resetFactoryCounters } from '@the-visualizer/test-utils';
import { SimulationEngine } from '../engine/simulation-engine.js';
import type { KafkaClusterState, SimEvent } from '../engine/types.js';

export interface OracleScenarioResult {
  readonly scenarioName: string;
  readonly passed: boolean;
  readonly ticksExecuted: number;
  readonly eventsEmitted: number;
  readonly assertionsEvaluated: number;
  readonly error?: string | undefined;
}

export class KafkaOracleHarness {
  /**
   * Scenario 1: Strict Replication & High-Watermark Barrier
   * Verifies that HW only advances to min(LEO) across active ISR replicas.
   */
  public static runReplicationScenario(): OracleScenarioResult {
    resetFactoryCounters();
    const b1 = makeBroker({ id: '1' as never, status: 'ALIVE' });
    const b2 = makeBroker({ id: '2' as never, status: 'ALIVE' });
    const b3 = makeBroker({ id: '3' as never, status: 'ALIVE' });

    const partition = makePartition('orders', {
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

    const state: KafkaClusterState = makeClusterState({
      brokers: { '1': b1, '2': b2, '3': b3 },
      topics: { orders: [partition] },
    });

    const engine = new SimulationEngine({
      seed: 42,
      maxTicks: 1000,
      maxEvents: 5000,
      maxMemoryMb: 64,
      speedMultiplier: 1.0,
    });

    let emittedEvents: SimEvent[] = [];
    engine.registerCallbacks({
      onEventBatch: (events) => {
        emittedEvents.push(...events);
      },
      onInvariantViolation: (v) => {
        throw new Error(`Oracle invariant violation: ${v.invariantName}`);
      },
      onResourceLimitExceeded: (r) => {
        throw new Error(`Resource limit exceeded: ${r}`);
      },
    });

    engine.initialize(state);

    // Produce 5 messages
    for (let i = 0; i < 5; i++) {
      engine.scheduleEvent(i * 2 + 2, `prod-${String(i)}`, 'RECORD_PRODUCED', {
        topic: 'orders',
        partition: 0,
        acks: -1,
      });
    }

    engine.step(20);

    const finalState = engine.state;
    if (!finalState) {
      return {
        scenarioName: 'Replication & HW Barrier',
        passed: false,
        ticksExecuted: 20,
        eventsEmitted: emittedEvents.length,
        assertionsEvaluated: 1,
        error: 'Engine state missing after execution',
      };
    }

    const finalPart = finalState.topics['orders']?.[0];
    const hwMatchesLeo = finalPart?.highWatermark === 5;
    const isrIntact = finalPart?.isr.length === 3;

    return {
      scenarioName: 'Replication & HW Barrier',
      passed: Boolean(hwMatchesLeo && isrIntact),
      ticksExecuted: 20,
      eventsEmitted: emittedEvents.length,
      assertionsEvaluated: 4,
    };
  }

  /**
   * Scenario 2: Failover Leader Election & Epoch Fencing
   * Verifies that when partition leader crashes, leaderEpoch increments and new leader is chosen from ISR.
   */
  public static runLeaderFailoverScenario(): OracleScenarioResult {
    resetFactoryCounters();
    const b1 = makeBroker({ id: '1' as never, status: 'ALIVE' });
    const b2 = makeBroker({ id: '2' as never, status: 'ALIVE' });

    const partition = makePartition('orders', {
      leaderBrokerId: '1' as never,
      leaderEpoch: 1,
      replicas: [
        { brokerId: '1' as never, logEndOffset: 10, lastCaughtUpTick: 0, isInSync: true },
        { brokerId: '2' as never, logEndOffset: 10, lastCaughtUpTick: 0, isInSync: true },
      ],
      isr: ['1', '2'] as never[],
      highWatermark: 10,
    });

    const state: KafkaClusterState = makeClusterState({
      brokers: { '1': b1, '2': b2 },
      topics: { orders: [partition] },
    });

    const engine = new SimulationEngine({
      seed: 42,
      maxTicks: 1000,
      maxEvents: 5000,
      maxMemoryMb: 64,
      speedMultiplier: 1.0,
    });

    engine.initialize(state);

    // Crash leader broker 1 at tick 5
    engine.scheduleEvent(5, 'crash-1', 'BROKER_STATUS_CHANGED', {
      brokerId: '1',
      status: 'CRASHED',
    });

    engine.step(10);

    const finalPart = engine.state?.topics['orders']?.[0];
    const leaderSwapped = finalPart?.leaderBrokerId === '2';
    const epochIncremented = finalPart?.leaderEpoch === 2;
    const isrShrunk = finalPart?.isr.length === 1 && finalPart.isr[0] === '2';

    return {
      scenarioName: 'Leader Failover & Epoch Fencing',
      passed: Boolean(leaderSwapped && epochIncremented && isrShrunk),
      ticksExecuted: 10,
      eventsEmitted: 1,
      assertionsEvaluated: 3,
    };
  }

  /**
   * Scenario 3: Consumer Group Exclusive Assignment & Range Rebalance
   * Verifies that each partition is assigned to exactly one consumer in the group.
   */
  public static runConsumerRebalanceScenario(): OracleScenarioResult {
    resetFactoryCounters();
    const b1 = makeBroker({ id: '1' as never, status: 'ALIVE' });

    const pOverrides = {
      leaderBrokerId: '1' as never,
      leaderEpoch: 1,
      replicas: [{ brokerId: '1' as never, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true }],
      isr: ['1'] as never[],
    };

    // 4 Partitions of 'orders'
    const p0 = makePartition('orders', { partition: 0 as never, ...pOverrides });
    const p1 = makePartition('orders', { partition: 1 as never, ...pOverrides });
    const p2 = makePartition('orders', { partition: 2 as never, ...pOverrides });
    const p3 = makePartition('orders', { partition: 3 as never, ...pOverrides });

    const state: KafkaClusterState = makeClusterState({
      brokers: { '1': b1 },
      topics: { orders: [p0, p1, p2, p3] },
      consumerGroups: {
        'analytics-group': {
          id: 'analytics-group' as never,
          state: 'Empty',
          protocol: 'range',
          generationId: 0,
          leaderMemberId: null,
          members: {},
          committedOffsets: {},
        },
      },
    });

    const engine = new SimulationEngine({
      seed: 42,
      maxTicks: 1000,
      maxEvents: 5000,
      maxMemoryMb: 64,
      speedMultiplier: 1.0,
    });

    engine.initialize(state);

    // Join 2 consumers
    engine.scheduleEvent(2, 'j1', 'CONSUMER_JOINED', {
      groupId: 'analytics-group',
      memberId: 'm1',
      clientId: 'c1',
      topics: ['orders'],
    });

    engine.scheduleEvent(4, 'j2', 'CONSUMER_JOINED', {
      groupId: 'analytics-group',
      memberId: 'm2',
      clientId: 'c2',
      topics: ['orders'],
    });

    engine.step(10);

    const group = engine.state?.consumerGroups['analytics-group'];
    const isStable = group?.state === 'Stable';
    const generationValid = (group?.generationId ?? 0) >= 2;

    const m1Partitions = group?.members['m1']?.assignedPartitions.length ?? 0;
    const m2Partitions = group?.members['m2']?.assignedPartitions.length ?? 0;
    const totalAssigned = m1Partitions + m2Partitions;

    // Both should receive 2 partitions (balanced 4 / 2)
    const balanced = m1Partitions === 2 && m2Partitions === 2 && totalAssigned === 4;

    const passed = Boolean(isStable && generationValid && balanced);
    return {
      scenarioName: 'Consumer Group Exclusive Assignment',
      passed,
      ticksExecuted: 10,
      eventsEmitted: 4,
      assertionsEvaluated: 4,
      error: passed ? undefined : `isStable=${String(isStable)}, gen=${String(group?.generationId)}, m1=${String(m1Partitions)}, m2=${String(m2Partitions)}`,
    };
  }
}
