import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { DistributedLockInvariantChecker } from './distributed-lock-invariants.js';
import {
  createDefaultDistributedLockCluster,
  pureDistributedLockTransition,
} from './distributed-lock-state-transitions.js';

describe('Distributed Lock Domain Fidelity Suite', () => {
  const rng = new DeterministicRNG(42);
  const checker = new DistributedLockInvariantChecker();

  it('LOCK-2: Enforces Redlock quorum threshold (majority of 5 = 3)', () => {
    let state = createDefaultDistributedLockCluster();

    // Partition 3 of the 5 nodes
    state = pureDistributedLockTransition(
      state,
      {
        id: 'down-1',
        tick: 1,
        type: 'LOCK_TOGGLE_NODE_STATUS',
        payload: { nodeId: 'node-1', status: 'DOWN' },
      },
      rng,
    ).nextState;
    state = pureDistributedLockTransition(
      state,
      {
        id: 'down-2',
        tick: 1,
        type: 'LOCK_TOGGLE_NODE_STATUS',
        payload: { nodeId: 'node-2', status: 'DOWN' },
      },
      rng,
    ).nextState;
    state = pureDistributedLockTransition(
      state,
      {
        id: 'down-3',
        tick: 1,
        type: 'LOCK_TOGGLE_NODE_STATUS',
        payload: { nodeId: 'node-3', status: 'DOWN' },
      },
      rng,
    ).nextState;

    // Client-A tries to acquire with only 2 online nodes
    state = pureDistributedLockTransition(
      state,
      { id: 'acq-fail', tick: 2, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-A' } },
      rng,
    ).nextState;

    // Quorum failed: client-A remains IDLE
    expect(state.clients['client-A']?.state).toBe('IDLE');
  });

  it('LOCK-3: Automatically expires node leases after TTL expiry', () => {
    let state = createDefaultDistributedLockCluster();

    // Client-A acquires lock at tick 1 (TTL = 10 ticks)
    state = pureDistributedLockTransition(
      state,
      { id: 'acq-1', tick: 1, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-A' } },
      rng,
    ).nextState;

    expect(state.clients['client-A']?.state).toBe('HOLDING');
    expect(state.nodes['node-1']?.heldByClient).toBe('client-A');

    // Advance past TTL (tick 15)
    state = pureDistributedLockTransition(
      state,
      { id: 'tick-exp', tick: 15, type: 'LOCK_TICK', payload: {} },
      rng,
    ).nextState;

    // Node leases cleared
    expect(state.nodes['node-1']?.heldByClient).toBeNull();
    const violation = checker.check(state);
    expect(violation).toBeUndefined();
  });

  it('LOCK-1 & LOCK-4: Demonstrates Kleppmann GC-pause hazard and fencing token safety', () => {
    let state = createDefaultDistributedLockCluster();

    // 1. Client-A acquires lock (token 1)
    state = pureDistributedLockTransition(
      state,
      { id: 'a1', tick: 1, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-A' } },
      rng,
    ).nextState;
    expect(state.clients['client-A']?.assignedFencingToken).toBe(1);

    // 2. Inject GC pause on Client-A for 10 ticks
    state = pureDistributedLockTransition(
      state,
      {
        id: 'gc-a',
        tick: 2,
        type: 'LOCK_INJECT_GC_PAUSE',
        payload: { clientId: 'client-A', durationTicks: 10 },
      },
      rng,
    ).nextState;

    // 3. Advance time to tick 12: Client-A is frozen, node leases expire
    for (let t = 3; t <= 12; t++) {
      state = pureDistributedLockTransition(
        state,
        { id: `t-${t}`, tick: t, type: 'LOCK_TICK', payload: {} },
        rng,
      ).nextState;
    }

    // 4. Client-B acquires lock at tick 12 (token 2)
    state = pureDistributedLockTransition(
      state,
      { id: 'b-acq', tick: 12, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-B' } },
      rng,
    ).nextState;
    expect(state.clients['client-B']?.state).toBe('HOLDING');
    expect(state.clients['client-B']?.assignedFencingToken).toBe(2);

    // 5. Client-B writes to protected resource (accepted with token 2)
    state = pureDistributedLockTransition(
      state,
      {
        id: 'b-write',
        tick: 13,
        type: 'LOCK_WRITE_PROTECTED_RESOURCE',
        payload: { clientId: 'client-B', data: 'WRITE_FROM_B' },
      },
      rng,
    ).nextState;
    expect(state.protectedResource.currentValue).toBe('WRITE_FROM_B');

    // 6. Client-A wakes up from GC pause at tick 14
    state = pureDistributedLockTransition(
      state,
      { id: 't-14', tick: 14, type: 'LOCK_TICK', payload: {} },
      rng,
    ).nextState;
    // Both believe they hold the lock!
    expect(state.clients['client-A']?.state).toBe('HOLDING');
    expect(state.clients['client-B']?.state).toBe('HOLDING');

    // 7. Client-A attempts to write stale data with token 1
    state = pureDistributedLockTransition(
      state,
      {
        id: 'a-write',
        tick: 15,
        type: 'LOCK_WRITE_PROTECTED_RESOURCE',
        payload: { clientId: 'client-A', data: 'STALE_WRITE_FROM_A' },
      },
      rng,
    ).nextState;

    // WITH FENCING: Stale write was safely rejected, data preserved!
    expect(state.protectedResource.currentValue).toBe('WRITE_FROM_B');
    expect(state.protectedResource.safelyRejectedCount).toBe(1);

    // Pedagogical flaw demonstrated for naive mutual exclusion
    const v = checker.check(state);
    expect(v?.ruleId).toBe('LOCK-4');
    expect(v?.isPedagogicalFlaw).toBe(true);
  });

  it('LOCK-1: Demonstrates silent data corruption when fencing tokens are disabled', () => {
    let state = createDefaultDistributedLockCluster();
    state.fencingEnabled = false; // Disable fencing!

    // Client-B writes with token 2
    state.protectedResource.highestFencingTokenSeen = 2;
    state.protectedResource.currentValue = 'GOOD_DATA_FROM_B';

    // Client-A attempts write with stale token 1 without fencing
    state.clients['client-A']!.assignedFencingToken = 1;
    state = pureDistributedLockTransition(
      state,
      {
        id: 'stale-corrupt',
        tick: 10,
        type: 'LOCK_WRITE_PROTECTED_RESOURCE',
        payload: { clientId: 'client-A', data: 'CORRUPTED_STALE_DATA' },
      },
      rng,
    ).nextState;

    // Resource was overwritten with stale data!
    expect(state.protectedResource.currentValue).toBe('CORRUPTED_STALE_DATA');
    expect(state.flawsDemonstrated.dataCorruptedWithoutFencing).toBe(true);

    // Triggers hard safety violation LOCK-1!
    const v = checker.check(state);
    expect(v?.ruleId).toBe('LOCK-1');
    expect(v?.isPedagogicalFlaw).toBeFalsy();
  });
});
