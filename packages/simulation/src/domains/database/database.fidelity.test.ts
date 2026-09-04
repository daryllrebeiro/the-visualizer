import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { createDefaultDBCluster, pureDBTransition } from './db-state-transitions.js';
import type { DBSimEvent } from './db-types.js';
import { ConsistentHashRing } from './hash-ring.js';

describe('Distributed Database Domain Fidelity Test Suite (Cassandra 5.0 / Dynamo Model)', () => {
  describe('Tunable Quorum Consistency & Required Replica Calculations', () => {
    it('enforces required ack thresholds across ONE, TWO, QUORUM, and ALL', () => {
      const rng = new DeterministicRNG(42);
      let cluster = createDefaultDBCluster('test-db', 4, 3); // RF = 3

      // 1. ConsistencyLevel = ALL (requires all 3 replicas)
      // Crash 1 node
      cluster.nodes['2']!.status = 'DOWN';

      const writeAll: DBSimEvent = {
        id: 'w-all',
        tick: 1,
        type: 'DB_WRITE_REQUEST',
        payload: { key: 'user:1', value: 'alice', consistencyLevel: 'ALL' },
      };

      const resAll = pureDBTransition(cluster, writeAll, rng);
      // Fails to acknowledge because requiredAcks = 3, but only 2 alive
      expect(resAll.emittedEvents.some((e) => e.type === 'DB_WRITE_ACK')).toBe(false);

      // 2. ConsistencyLevel = QUORUM (requires floor(3/2) + 1 = 2 replicas)
      const writeQuorum: DBSimEvent = {
        id: 'w-quorum',
        tick: 2,
        type: 'DB_WRITE_REQUEST',
        payload: { key: 'user:1', value: 'alice_v2', consistencyLevel: 'QUORUM' },
      };

      const resQuorum = pureDBTransition(cluster, writeQuorum, rng);
      expect(resQuorum.emittedEvents.some((e) => e.type === 'DB_WRITE_ACK')).toBe(true);
      const ack = resQuorum.emittedEvents.find((e) => e.type === 'DB_WRITE_ACK')!;
      expect(ack.payload['requiredAcks']).toBe(2);
      expect(ack.payload['acks']).toBe(2);

      // 3. ConsistencyLevel = ONE (requires 1 replica)
      const writeOne: DBSimEvent = {
        id: 'w-one',
        tick: 3,
        type: 'DB_WRITE_REQUEST',
        payload: { key: 'user:1', value: 'alice_v3', consistencyLevel: 'ONE' },
      };
      const resOne = pureDBTransition(cluster, writeOne, rng);
      expect(resOne.emittedEvents.some((e) => e.type === 'DB_WRITE_ACK')).toBe(true);
    });
  });

  describe('Hinted Handoff Execution & Replay', () => {
    it('buffers mutation hints on coordinator when replica is down and delivers on recovery', () => {
      const rng = new DeterministicRNG(42);
      let cluster = createDefaultDBCluster('test-db', 4, 3);

      const ring = new ConsistentHashRing(3);
      ring.setRingTokens(cluster.ringTokens);
      const { replicaNodeIds } = ring.findReplicas('user:99', 3);
      const targetDownNodeId = replicaNodeIds[replicaNodeIds.length - 1]!;

      // Down one of the replicas responsible for 'user:99'
      cluster.nodes[targetDownNodeId]!.status = 'DOWN';

      const writeEv: DBSimEvent = {
        id: 'w-hint',
        tick: 1,
        type: 'DB_WRITE_REQUEST',
        payload: { key: 'user:99', value: 'charlie', consistencyLevel: 'ONE' },
      };

      const resWrite = pureDBTransition(cluster, writeEv, rng);
      const coordinator = Object.values(resWrite.nextState.nodes).find((n) => n.hints.length > 0);

      expect(coordinator).toBeDefined();
      expect(coordinator?.hints[0]?.targetNodeId).toBe(targetDownNodeId);
      expect(coordinator?.hints[0]?.record.value).toBe('charlie');

      // Recover target node
      const recoverEv: DBSimEvent = {
        id: `rec-${targetDownNodeId}`,
        tick: 2,
        type: 'DB_NODE_RECOVER',
        payload: { nodeId: targetDownNodeId },
      };

      const resRecover = pureDBTransition(resWrite.nextState, recoverEv, rng);
      // Should emit hint delivery
      const hintDeliverEvent = resRecover.emittedEvents.find((e) => e.type === 'DB_HINT_DELIVER');
      expect(hintDeliverEvent).toBeDefined();

      // Process hint delivery
      const resDelivered = pureDBTransition(resRecover.nextState, hintDeliverEvent!, rng);
      expect(resDelivered.nextState.nodes[targetDownNodeId]!.storage['user:99']?.value).toBe(
        'charlie',
      );
      // Hints should be drained from coordinator
      const coordAfter = resDelivered.nextState.nodes[coordinator!.id]!;
      expect(coordAfter.hints.length).toBe(0);
    });
  });

  describe('Read Repair on Replica Divergence', () => {
    it('triggers read repair when divergent replica versions are encountered during read', () => {
      const rng = new DeterministicRNG(42);
      let cluster = createDefaultDBCluster('test-db', 4, 3);

      const ring = new ConsistentHashRing(3);
      ring.setRingTokens(cluster.ringTokens);
      const { replicaNodeIds } = ring.findReplicas('data:100', 3);
      const nodeLatest = replicaNodeIds[0]!;
      const nodeStale = replicaNodeIds[1]!;

      // Populate latest on nodeLatest, stale on nodeStale
      cluster.nodes[nodeLatest]!.storage['data:100'] = {
        key: 'data:100',
        value: 'latest_val',
        version: 10,
        timestamp: 100,
        vectorClock: { [nodeLatest]: 10 },
      };

      cluster.nodes[nodeStale]!.storage['data:100'] = {
        key: 'data:100',
        value: 'stale_val',
        version: 5,
        timestamp: 50,
        vectorClock: { [nodeLatest]: 5 },
      };

      const readEv: DBSimEvent = {
        id: 'r-repair',
        tick: 1,
        type: 'DB_READ_REQUEST',
        payload: { key: 'data:100', consistencyLevel: 'ALL' },
      };

      const resRead = pureDBTransition(cluster, readEv, rng);
      const repairEvent = resRead.emittedEvents.find((e) => e.type === 'DB_READ_REPAIR');
      expect(repairEvent).toBeDefined();
      expect(repairEvent?.payload['key']).toBe('data:100');

      // Execute repair
      const resRepaired = pureDBTransition(resRead.nextState, repairEvent!, rng);
      expect(resRepaired.nextState.nodes[nodeStale]!.storage['data:100']?.version).toBe(10);
      expect(resRepaired.nextState.readRepairsCompleted).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Cassandra num_tokens (VNodes) Ring Scaling', () => {
    it('supports 256 virtual nodes per physical machine', () => {
      const ring = new ConsistentHashRing(256);
      ring.addNode('node-1');
      ring.addNode('node-2');
      ring.addNode('node-3');

      // 3 nodes * 256 vnodes = 768 ring tokens
      expect(ring.getRingTokens().length).toBe(768);

      const replicas = ring.findReplicas('partition:key:123', 3);
      expect(replicas.replicaNodeIds.length).toBe(3);
    });
  });
});
