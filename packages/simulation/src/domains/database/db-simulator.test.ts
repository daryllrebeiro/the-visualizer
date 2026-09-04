import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { DBInvariantChecker } from './db-invariants.js';
import { createDefaultDBCluster, pureDBTransition } from './db-state-transitions.js';
import type { DBNode, DBSimEvent } from './db-types.js';
import { ConsistentHashRing } from './hash-ring.js';

describe('Distributed Database (Consistent Hash Ring & Quorum)', () => {
  it('should initialize 4-node cluster with 12 vnodes distributed monotonically across ring', () => {
    const cluster = createDefaultDBCluster('db-test', 4, 3);
    const checker = new DBInvariantChecker();

    expect(Object.keys(cluster.nodes).length).toBe(4);
    expect(cluster.ringTokens.length).toBe(12); // 4 nodes * 3 vnodes
    expect(cluster.replicationFactor).toBe(3);
    expect(checker.check(cluster)).toBeUndefined();
  });

  it('should route writes to N replicas with QUORUM consistency', () => {
    const rng = new DeterministicRNG(42);
    const cluster = createDefaultDBCluster('db-test', 4, 3);
    const checker = new DBInvariantChecker();

    const writeEv: DBSimEvent = {
      id: 'w-1',
      tick: 1,
      type: 'DB_WRITE_REQUEST',
      payload: { key: 'account:101', value: 'bal_1000', consistencyLevel: 'QUORUM' },
    };

    const res = pureDBTransition(cluster, writeEv, rng);
    expect(res.emittedEvents.length).toBe(1);
    expect(res.emittedEvents[0]?.type).toBe('DB_WRITE_ACK');
    expect(res.nextState.totalOperations).toBe(1);

    // Verify key replicated on exactly 3 nodes
    let storedNodes = 0;
    const nodes = Object.values(res.nextState.nodes) as DBNode[];
    for (const node of nodes) {
      if (node.storage['account:101']) storedNodes++;
    }
    expect(storedNodes).toBe(3);
    expect(checker.check(res.nextState)).toBeUndefined();
  });

  it('should detect stale reads and trigger read repair under weak consistency', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultDBCluster('db-test', 4, 3);

    // Set ONE consistency
    state.writeConsistency = 'ONE';
    state.readConsistency = 'ONE';

    // Manually create stale state on replica 2 while replica 1 has version 2
    const ring = new ConsistentHashRing(3);
    ring.setRingTokens(state.ringTokens);
    const { replicaNodeIds } = ring.findReplicas('item:xyz', 3);

    const node1 = state.nodes[replicaNodeIds[0]!]!;
    const node2 = state.nodes[replicaNodeIds[1]!]!;

    node1.storage['item:xyz'] = {
      key: 'item:xyz',
      value: 'latest_val',
      version: 2,
      timestamp: 10,
      vectorClock: { '1': 2 },
      deleted: false,
    };
    node2.storage['item:xyz'] = {
      key: 'item:xyz',
      value: 'stale_val',
      version: 1,
      timestamp: 5,
      vectorClock: { '1': 1 },
      deleted: false,
    };

    // Read request with ALL consistency to sample all replicas and repair
    const readEv: DBSimEvent = {
      id: 'r-1',
      tick: 15,
      type: 'DB_READ_REQUEST',
      payload: { key: 'item:xyz', consistencyLevel: 'ALL' },
    };

    const res = pureDBTransition(state, readEv, rng);
    // Read repair should be emitted for stale node
    const repairEvent = res.emittedEvents.find((e) => e.type === 'DB_READ_REPAIR');
    expect(repairEvent).toBeDefined();

    // Process read repair
    const repaired = pureDBTransition(res.nextState, repairEvent!, rng);
    expect(repaired.nextState.nodes[node2.id]?.storage['item:xyz']?.version).toBe(2);
    expect(repaired.nextState.readRepairsCompleted).toBe(2);
  });

  it('should store hinted handoffs when replica is DOWN and deliver upon recovery', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultDBCluster('db-test', 4, 3);

    // Crash node 3
    state.nodes['3']!.status = 'DOWN';

    // Write key
    const writeEv: DBSimEvent = {
      id: 'w-hint',
      tick: 20,
      type: 'DB_WRITE_REQUEST',
      payload: { key: 'order:555', value: 'confirmed', consistencyLevel: 'QUORUM' },
    };

    const writeRes = pureDBTransition(state, writeEv, rng);
    // Find coordinator with stored hint
    let hintStored = false;
    const writeNodes = Object.values(writeRes.nextState.nodes) as DBNode[];
    for (const node of writeNodes) {
      if (node.hints.some((h) => h.key === 'order:555' && h.targetNodeId === '3')) {
        hintStored = true;
      }
    }
    expect(hintStored).toBe(true);

    // Recover node 3
    const recoverEv: DBSimEvent = {
      id: 'rec-3',
      tick: 25,
      type: 'DB_NODE_RECOVER',
      payload: { nodeId: '3' },
    };
    const recRes = pureDBTransition(writeRes.nextState, recoverEv, rng);
    const deliverEv = recRes.emittedEvents.find((e) => e.type === 'DB_HINT_DELIVER');
    expect(deliverEv).toBeDefined();

    // Deliver hints
    const delivered = pureDBTransition(recRes.nextState, deliverEv!, rng);
    expect(delivered.nextState.nodes['3']?.storage['order:555']?.value).toBe('confirmed');
  });
});
