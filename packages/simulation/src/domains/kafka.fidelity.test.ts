import { describe, expect, it } from 'vitest';

import { pureStateTransition } from '../engine/state-transitions.js';
import type { SimEvent } from '../engine/types.js';
import { DeterministicRNG } from '../prng/deterministic-rng.js';
import { createDefaultBaselineState } from '../reconstitution/event-log-parser.js';

describe('Kafka Domain Fidelity Test Suite (Apache Kafka 4.0 KRaft)', () => {
  describe('min.insync.replicas + acks=all Blockade Semantics', () => {
    it('rejects produce requests with NOT_ENOUGH_REPLICAS when |ISR| < minInsyncReplicas', () => {
      const rng = new DeterministicRNG(42);
      const state = createDefaultBaselineState();
      const partition = state.topics['orders']![0]!;

      // Set minInsyncReplicas = 3, but shrink ISR to 2 brokers
      partition.minInsyncReplicas = 3;
      partition.isr = ['1', '2']; // Broker 3 not in sync

      const produceEvent: SimEvent = {
        id: 'p-1',
        tick: 1,
        type: 'RECORD_PRODUCED',
        payload: {
          topic: 'orders',
          partition: 0,
          acks: -1, // acks=all
          key: 'order-101',
          value: 'data',
        },
      };

      const result = pureStateTransition(state, produceEvent, rng);
      const failedEvent = result.emittedEvents.find(
        (e) => e.type === ('RECORD_PRODUCED_FAILED' as any),
      );

      expect(failedEvent).toBeDefined();
      expect(failedEvent?.payload['error']).toBe('NOT_ENOUGH_REPLICAS');
      // LEO should not have advanced
      const leaderReplica = result.nextState.topics['orders']![0]!.replicas.find(
        (r) => r.brokerId === '1',
      )!;
      expect(leaderReplica.logEndOffset).toBe(0);
    });

    it('succeeds produce requests when |ISR| >= minInsyncReplicas', () => {
      const rng = new DeterministicRNG(42);
      const state = createDefaultBaselineState();
      const partition = state.topics['orders']![0]!;

      partition.minInsyncReplicas = 2;
      partition.isr = ['1', '2'];

      const produceEvent: SimEvent = {
        id: 'p-2',
        tick: 1,
        type: 'RECORD_PRODUCED',
        payload: {
          topic: 'orders',
          partition: 0,
          acks: -1,
          key: 'order-102',
          value: 'data',
        },
      };

      const result = pureStateTransition(state, produceEvent, rng);
      const leaderReplica = result.nextState.topics['orders']![0]!.replicas.find(
        (r) => r.brokerId === '1',
      )!;
      expect(leaderReplica.logEndOffset).toBe(1);
    });
  });

  describe('KIP-98 Idempotent Producer Deduplication', () => {
    it('detects and rejects duplicate sequence numbers from the same producer', () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultBaselineState();

      // First produce with sequence 0
      const ev1: SimEvent = {
        id: 'p-seq-0',
        tick: 1,
        type: 'RECORD_PRODUCED',
        payload: {
          topic: 'orders',
          partition: 0,
          producerId: 'producer-A',
          sequenceNumber: 0,
          value: 'msg_0',
        },
      };

      state = pureStateTransition(state, ev1, rng).nextState;
      const leaderReplica = state.topics['orders']![0]!.replicas.find((r) => r.brokerId === '1')!;
      expect(leaderReplica.logEndOffset).toBe(1);

      // Duplicate produce with sequence 0 again
      const evDup: SimEvent = {
        id: 'p-seq-0-dup',
        tick: 2,
        type: 'RECORD_PRODUCED',
        payload: {
          topic: 'orders',
          partition: 0,
          producerId: 'producer-A',
          sequenceNumber: 0,
          value: 'msg_0_duplicate',
        },
      };

      const resultDup = pureStateTransition(state, evDup, rng);
      const dupEvent = resultDup.emittedEvents.find(
        (e) => e.type === ('RECORD_PRODUCED_DUPLICATE_IGNORED' as any),
      );
      expect(dupEvent).toBeDefined();

      // LEO should still be 1 (duplicate not appended)
      const leaderAfterDup = resultDup.nextState.topics['orders']![0]!.replicas.find(
        (r) => r.brokerId === '1',
      )!;
      expect(leaderAfterDup.logEndOffset).toBe(1);
    });
  });

  describe('replica.lag.time.max.ms ISR Eviction', () => {
    it('evicts out-of-sync followers whose lag exceeds replicaLagTimeMaxTicks', () => {
      const rng = new DeterministicRNG(42);
      const state = createDefaultBaselineState();
      const partition = state.topics['orders']![0]!;

      // Broker 2 last caught up at tick 0. Set threshold = 5
      (partition as any).replicaLagTimeMaxTicks = 5;
      const followerReplica = partition.replicas.find((r) => r.brokerId === '2')!;
      followerReplica.lastCaughtUpTick = 0;

      // At tick 10, run replica lag check
      const lagCheckEvent: SimEvent = {
        id: 'lag-check-1',
        tick: 10,
        type: 'REPLICA_LAG_CHECK' as any,
        payload: {},
      };

      const result = pureStateTransition(state, lagCheckEvent, rng);
      const updatedPartition = result.nextState.topics['orders']![0]!;

      // Broker 2 must have been evicted from ISR
      expect(updatedPartition.isr).not.toContain('2');
      const rep2 = updatedPartition.replicas.find((r) => r.brokerId === '2')!;
      expect(rep2.isInSync).toBe(false);

      const isrShrinkEvent = result.emittedEvents.find((e) => e.type === 'ISR_CHANGED');
      expect(isrShrinkEvent).toBeDefined();
    });
  });

  describe('unclean.leader.election.enable Behavior', () => {
    it('keeps partition OFFLINE when all ISR members crash and uncleanLeaderElectionEnabled is false', () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultBaselineState();
      const partition = state.topics['orders']![0]!;
      partition.uncleanLeaderElectionEnabled = false;

      // Broker 1 is leader. Let ISR be only ['1']
      partition.isr = ['1'];

      // Crash broker 1
      const crashEv: SimEvent = {
        id: 'crash-1',
        tick: 1,
        type: 'BROKER_STATUS_CHANGED',
        payload: { brokerId: '1', status: 'CRASHED' },
      };

      const result = pureStateTransition(state, crashEv, rng);
      const p = result.nextState.topics['orders']![0]!;

      // Partition has no leader (OFFLINE)
      expect(p.leaderBrokerId).toBeNull();
    });

    it('elects an out-of-sync alive replica when uncleanLeaderElectionEnabled is true', () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultBaselineState();
      const partition = state.topics['orders']![0]!;
      partition.uncleanLeaderElectionEnabled = true;

      // Broker 1 is leader in ISR; Broker 2 is alive but outside ISR
      partition.isr = ['1'];

      const crashEv: SimEvent = {
        id: 'crash-1',
        tick: 1,
        type: 'BROKER_STATUS_CHANGED',
        payload: { brokerId: '1', status: 'CRASHED' },
      };

      const result = pureStateTransition(state, crashEv, rng);
      const p = result.nextState.topics['orders']![0]!;

      // Partition elects alive non-ISR replica 2!
      expect(p.leaderBrokerId).toBe('2');
      expect(p.isr).toEqual(['2']);

      const uncleanEvent = result.emittedEvents.find(
        (e) => e.type === 'PARTITION_LEADER_ELECTED' && e.payload['unclean'] === true,
      );
      expect(uncleanEvent).toBeDefined();
    });
  });
});
