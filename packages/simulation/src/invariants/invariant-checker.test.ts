import {
  makeBroker,
  makePartition,
  makeClusterState,
  resetFactoryCounters,
} from '@the-visualizer/test-utils';
import { describe, it, expect, beforeEach } from 'vitest';

import type { KafkaClusterState } from '../engine/types.js';

import { InvariantChecker } from './invariant-checker.js';

describe('InvariantChecker safety policies', () => {
  let checker: InvariantChecker;
  let validState: KafkaClusterState;

  beforeEach(() => {
    resetFactoryCounters();
    checker = new InvariantChecker();

    // Create 3 valid brokers
    const b1 = makeBroker({ id: 'broker-1' as never, status: 'ALIVE' });
    const b2 = makeBroker({ id: 'broker-2' as never, status: 'ALIVE' });
    const b3 = makeBroker({ id: 'broker-3' as never, status: 'ALIVE' });

    // Create a partition with leader = broker-1, ISR = [1, 2]
    const partition = makePartition('orders', {
      leaderBrokerId: 'broker-1' as never,
      leaderEpoch: 1,
      replicas: [
        { brokerId: 'broker-1' as never, logEndOffset: 10, lastCaughtUpTick: 0, isInSync: true },
        { brokerId: 'broker-2' as never, logEndOffset: 10, lastCaughtUpTick: 0, isInSync: true },
        { brokerId: 'broker-3' as never, logEndOffset: 8, lastCaughtUpTick: 0, isInSync: false },
      ],
      isr: ['broker-1', 'broker-2'] as never[],
      highWatermark: 10,
      minInsyncReplicas: 2,
    });

    validState = makeClusterState({
      brokers: {
        'broker-1': b1,
        'broker-2': b2,
        'broker-3': b3,
      },
      topics: {
        orders: [partition],
      },
      kraft: {
        activeControllerId: 'broker-1' as never,
        voters: ['broker-1', 'broker-2'] as never[],
        controllerEpoch: 1,
        metadataOffset: 0,
      },
    });
  });

  it('should pass cleanly for a valid cluster state', () => {
    const result = checker.check(validState);
    expect(result).toBeUndefined();
  });

  it('should detect when leader is crashed', () => {
    const invalidState = JSON.parse(JSON.stringify(validState)) as KafkaClusterState;
    const b1 = invalidState.brokers['broker-1'];
    if (b1) {
      b1.status = 'CRASHED';
    }

    const violation = checker.check(invalidState);
    expect(violation).toBeDefined();
    expect(violation?.invariantName).toBe('LEADER_ALIVE');
  });

  it('should detect when leader is not in ISR', () => {
    const invalidState = JSON.parse(JSON.stringify(validState)) as KafkaClusterState;
    const orders = invalidState.topics.orders;
    if (orders?.[0]) {
      orders[0].isr = ['broker-2'] as never[];
    }

    const violation = checker.check(invalidState);
    expect(violation).toBeDefined();
    expect(violation?.invariantName).toBe('LEADER_IN_ISR');
  });

  it('should detect when high-watermark exceeds leader LEO', () => {
    const invalidState = JSON.parse(JSON.stringify(validState)) as KafkaClusterState;
    const orders = invalidState.topics.orders;
    if (orders?.[0]) {
      orders[0].highWatermark = 15; // exceeds LEO of 10
    }

    const violation = checker.check(invalidState);
    expect(violation).toBeDefined();
    expect(violation?.invariantName).toBe('HIGH_WATERMARK_BOUND');
  });

  it('should detect when consumer committed offset exceeds high-watermark', () => {
    const invalidState = JSON.parse(JSON.stringify(validState)) as KafkaClusterState;
    invalidState.consumerGroups['group-1'] = {
      id: 'group-1',
      state: 'Stable',
      protocol: 'range',
      generationId: 1,
      leaderMemberId: 'member-1',
      members: {
        'member-1': {
          memberId: 'member-1',
          clientId: 'client-1',
          assignedPartitions: [],
          lastHeartbeatTick: 0,
        },
      },
      committedOffsets: {
        orders: {
          0: 15, // exceeds HW of 10
        },
      },
    };

    const violation = checker.check(invalidState);
    expect(violation).toBeDefined();
    expect(violation?.invariantName).toBe('COMMITTED_OFFSET_BOUND');
  });

  it('should detect when KRaft active controller is not a voter', () => {
    const invalidState = JSON.parse(JSON.stringify(validState)) as KafkaClusterState;
    invalidState.kraft.activeControllerId = 'broker-3'; // broker-3 is not in voters quorum

    const violation = checker.check(invalidState);
    expect(violation).toBeDefined();
    expect(violation?.invariantName).toBe('KRAFT_CONTROLLER_IS_VOTER');
  });

  it('should detect when ISR is less than minInsyncReplicas and log has progress', () => {
    const invalidState = JSON.parse(JSON.stringify(validState)) as KafkaClusterState;
    const orders = invalidState.topics.orders;
    if (orders?.[0]) {
      orders[0].isr = ['broker-1'] as never[]; // ISR size is 1, minInsyncReplicas is 2
    }

    const violation = checker.check(invalidState);
    expect(violation).toBeDefined();
    expect(violation?.invariantName).toBe('MIN_ISR_ACK_VIOLATED');
  });
});
