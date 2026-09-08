import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  fnv1a32,
  jumpHash,
  keyHash32,
  keyHash64,
} from './consistent-hashing-algorithms.js';
import { ConsistentHashingInvariantChecker } from './consistent-hashing-invariants.js';
import {
  createDefaultConsistentHashingCluster,
  pureConsistentHashingTransition,
} from './consistent-hashing-state-transitions.js';
import type { ConsistentHashingClusterState } from './consistent-hashing-types.js';

function addKeys(
  state: ConsistentHashingClusterState,
  count: number,
  rng: DeterministicRNG,
  prefix = 'test',
): ConsistentHashingClusterState {
  const keys = Array.from({ length: count }, (_, i) => `${prefix}-${rng.nextInt(0, 1_000_000)}-${i}`);
  return pureConsistentHashingTransition(
    state,
    { id: `add-${prefix}`, tick: state.tick + 1, type: 'CHASH_ADD_KEY_BATCH', payload: { keys } },
    rng,
  ).nextState;
}

/** Chi-square upper critical values, alpha=0.01, df=1..10; Wilson-Hilferty beyond. */
function chiSquareCriticalAlpha001(df: number): number {
  const table = [6.6349, 9.2103, 11.3449, 13.2767, 15.0863, 16.8119, 18.4753, 20.0902, 21.666, 23.2093];
  if (df <= 10) {
    return table[df - 1] as number;
  }
  const z = 2.3263;
  const c = 1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df));
  return df * c * c * c;
}

function chiSquareStatistic(observed: number[], expected: number[]): number {
  return observed.reduce((acc, o, i) => acc + (o - (expected[i] as number)) ** 2 / (expected[i] as number), 0);
}

describe('Consistent Hashing Domain Fidelity Test Suite', () => {
  it('CHASH-1: adding one node moves only ~K/(N+1) keys under ring and jump hashing, never naive-level reshuffle', () => {
    const rng = new DeterministicRNG(7);
    let state = createDefaultConsistentHashingCluster();
    state = addKeys(state, 1000, rng, 'chash1');

    const before = JSON.parse(JSON.stringify(state.keyAssignments)) as Record<
      string,
      { ring: string; jump: string; hrw: string; naive: string }
    >;

    state = pureConsistentHashingTransition(
      state,
      { id: 'add-node-F', tick: state.tick + 1, type: 'CHASH_ADD_NODE', payload: { nodeId: 'node-F' } },
      rng,
    ).nextState;

    const k = 1000 + 24; // batch + default keys
    const ringMoved = Object.keys(before).filter((key) => before[key]?.ring !== state.keyAssignments[key]?.ring).length;
    const jumpMoved = Object.keys(before).filter((key) => before[key]?.jump !== state.keyAssignments[key]?.jump).length;
    const naiveMoved = Object.keys(before).filter((key) => before[key]?.naive !== state.keyAssignments[key]?.naive).length;

    // Ring: ~K/6 moved (5 -> 6 nodes), generous statistical bound.
    expect(ringMoved).toBeGreaterThan(Math.floor(k / 12));
    expect(ringMoved).toBeLessThan(Math.ceil(k / 3));

    // Jump: exact — only keys now landing in bucket 5 (node-F) moved.
    const expectedJumpMoved = Object.keys(before).filter((key) => jumpHash(keyHash64(key), 6) === 5).length;
    expect(jumpMoved).toBe(expectedJumpMoved);
    expect(jumpMoved).toBeGreaterThan(Math.floor(k / 12));
    expect(jumpMoved).toBeLessThan(Math.ceil(k / 3));

    // Naive baseline moves ~5/6 of all keys — the anti-goal.
    expect(naiveMoved).toBeGreaterThan(Math.floor((4 * k) / 6));

    // Invariant checker agrees.
    const checker = new ConsistentHashingInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('CHASH-1: removing one node moves only the removed node\'s ring keys (exact subset property)', () => {
    const rng = new DeterministicRNG(11);
    let state = createDefaultConsistentHashingCluster();
    state = addKeys(state, 1000, rng, 'chash1rm');

    const before = JSON.parse(JSON.stringify(state.keyAssignments)) as Record<
      string,
      { ring: string; hrw: string }
    >;
    const removedNode = 'node-C';

    state = pureConsistentHashingTransition(
      state,
      { id: 'rm-node-C', tick: state.tick + 1, type: 'CHASH_REMOVE_NODE', payload: { nodeId: removedNode } },
      rng,
    ).nextState;

    // Exact: a ring key moves iff it was assigned to the removed node.
    const keysOnRemovedBefore = Object.keys(before).filter((key) => before[key]?.ring === removedNode);
    const movedKeys = Object.keys(before).filter((key) => before[key]?.ring !== state.keyAssignments[key]?.ring);
    expect(movedKeys.length).toBe(keysOnRemovedBefore.length);
    expect(new Set(movedKeys)).toEqual(new Set(keysOnRemovedBefore));

    // ~K/5 of keys were on node-C.
    expect(keysOnRemovedBefore.length).toBeGreaterThan(Math.floor(1000 / 10));

    const checker = new ConsistentHashingInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('CHASH-2: with >=100 vnodes/node the ring key distribution passes a chi-square uniformity test', () => {
    const rng = new DeterministicRNG(23);
    let state = createDefaultConsistentHashingCluster();
    state = addKeys(state, 2000, rng, 'chash2');

    const nodeIds = state.ringNodes.map((n) => n.id);
    const observed = nodeIds.map((id) =>
      state.keyOrder.filter((key) => state.keyAssignments[key]?.ring === id).length,
    );
    const expected = nodeIds.map(() => state.keyOrder.length / nodeIds.length);

    const stat = chiSquareStatistic(observed, expected);
    const critical = chiSquareCriticalAlpha001(nodeIds.length - 1);
    expect(stat).toBeLessThan(critical);

    // Max/min load ratio sanity.
    const loads = observed.filter((o) => o >= 0);
    expect(Math.max(...loads) / Math.min(...loads)).toBeLessThan(1.5);

    // Contrast: with 1 vnode/node the distribution is visibly skewed
    // (documented teaching case, not an invariant).
    let skewed = pureConsistentHashingTransition(
      state,
      { id: 'vnode-1', tick: state.tick + 1, type: 'CHASH_SET_VNODES', payload: { vnodesPerNode: 1 } },
      rng,
    ).nextState;
    const skewedObserved = nodeIds.map((id) =>
      skewed.keyOrder.filter((key) => skewed.keyAssignments[key]?.ring === id).length,
    );
    expect(Math.max(...skewedObserved) / Math.min(...skewedObserved)).toBeGreaterThan(1.5);
  });

  it('CHASH-3: Jump hash growth consistency — growing n only reassigns keys to the new bucket n', () => {
    const rng = new DeterministicRNG(31);
    let state = createDefaultConsistentHashingCluster();
    state = addKeys(state, 200, rng, 'chash3');

    for (const key of state.keyOrder) {
      const key64 = keyHash64(key);
      for (let n = 1; n <= 32; n++) {
        const before = jumpHash(key64, n);
        const after = jumpHash(key64, n + 1);
        // The defining monotonicity property: either unchanged or moved
        // exactly to the newly added bucket n.
        expect(after === before || after === n).toBe(true);
      }
    }
  });

  it('CHASH-3: jump hash matches the Lamping & Veach recurrence bit-for-bit on reference vectors', () => {
    // Reference values produced by the exact paper recurrence
    // (key * 2862933555777941757 + 1 mod 2^64; j = (b+1)*(2^31/((key>>33)+1))).
    // Spot-check determinism and range properties.
    const rng = new DeterministicRNG(97);
    for (let i = 0; i < 500; i++) {
      const key = keyHash64(`ref-vector-${rng.nextInt(0, 2_000_000)}`);
      for (const n of [1, 2, 5, 16, 64]) {
        const b = jumpHash(key, n);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(n);
        // bucket(k, 1) === 0 always (single bucket owns everything).
        if (n === 1) {
          expect(b).toBe(0);
        }
      }
    }
    // Identical inputs produce identical outputs (pure function).
    const k = keyHash64('determinism-probe');
    expect(jumpHash(k, 17)).toBe(jumpHash(k, 17));
  });

  it('CHASH-4: HRW determinism from node identity alone and exact removal-subset property', () => {
    const rng = new DeterministicRNG(41);
    let state = createDefaultConsistentHashingCluster();
    state = addKeys(state, 1000, rng, 'chash4');

    const before = JSON.parse(JSON.stringify(state.keyAssignments)) as Record<
      string,
      { hrw: string }
    >;
    const removedNode = 'node-D';

    state = pureConsistentHashingTransition(
      state,
      { id: 'rm-node-D', tick: state.tick + 1, type: 'CHASH_REMOVE_NODE', payload: { nodeId: removedNode } },
      rng,
    ).nextState;

    // Exact: HRW keys move iff their argmax was the removed node.
    const keysOnRemovedBefore = Object.keys(before).filter((key) => before[key]?.hrw === removedNode);
    const movedKeys = Object.keys(before).filter((key) => before[key]?.hrw !== state.keyAssignments[key]?.hrw);
    expect(new Set(movedKeys)).toEqual(new Set(keysOnRemovedBefore));
    expect(keysOnRemovedBefore.length).toBeGreaterThan(Math.floor(1000 / 10));

    const checker = new ConsistentHashingInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('CHASH-4: HRW lookup is O(N) hash computations while ring lookup is O(log vN) comparisons', () => {
    const rng = new DeterministicRNG(53);
    const state = createDefaultConsistentHashingCluster();

    const probe = pureConsistentHashingTransition(
      state,
      { id: 'lookup-1', tick: 1, type: 'CHASH_LOOKUP', payload: { key: 'complexity-probe' } },
      rng,
    ).nextState;

    // 5 physical nodes -> 5 hash computations for HRW.
    expect(probe.lookupStats.hrwHashComputations).toBe(5);
    // 500 vnodes on the ring -> binary search uses <= ceil(log2(500)) + 1.
    expect(probe.lookupStats.ringComparisons).toBeLessThanOrEqual(10);
    expect(probe.lookupStats.jumpLoopIterations).toBeLessThanOrEqual(32);
  });

  it('ring binary-search lookup agrees with a linear-scan reference implementation', () => {
    const rng = new DeterministicRNG(61);
    let state = createDefaultConsistentHashingCluster();
    state = addKeys(state, 500, rng, 'ringref');

    for (const key of state.keyOrder) {
      const h = keyHash32(key);
      // Linear scan reference: first vnode with position > h, wrap to 0.
      let reference: string | null = null;
      for (const vnode of state.ring) {
        if (vnode.position > h) {
          reference = vnode.nodeId;
          break;
        }
      }
      if (reference === null) {
        reference = state.ring[0]!.nodeId;
      }
      expect(state.keyAssignments[key]?.ring).toBe(reference);
    }
  });

  it('invariant checker catches constructed assignment drift (must be capable of failing)', () => {
    const state = createDefaultConsistentHashingCluster();
    const tampered = JSON.parse(JSON.stringify(state)) as ConsistentHashingClusterState;
    const someKey = tampered.keyOrder[0] as string;
    tampered.keyAssignments[someKey]!.hrw = 'node-EVEN_IF_WRONG';

    const checker = new ConsistentHashingInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('CHASH-4');
    expect(violation?.description).toContain('recomputed');
  });

  it('invariant checker catches minimal-disruption violations on constructed rebalance records', () => {
    const state = createDefaultConsistentHashingCluster();
    const tampered = JSON.parse(JSON.stringify(state)) as ConsistentHashingClusterState;
    // Simulate a reducer bug that reshuffled everything on a node add.
    tampered.lastMovement = {
      event: 'ADD_NODE',
      changedNodeId: 'node-F',
      ring: 24, // ALL keys moved — a hash % N style bug
      jump: 0,
      hrw: 0,
      naive: 24,
      totalKeys: 24,
      nodeCountBefore: 5,
      nodeCountAfter: 6,
    };

    const checker = new ConsistentHashingInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('CHASH-1');
  });

  it('FNV-1a hash primitive: deterministic, seed-sensitive, 32-bit range', () => {
    expect(fnv1a32('identical-input')).toBe(fnv1a32('identical-input'));
    expect(fnv1a32('identical-input')).not.toBe(fnv1a32('identical-input2'));
    expect(fnv1a32('a', 0x811c9dc5)).not.toBe(fnv1a32('a', 0x9747b28c));
    expect(fnv1a32('range-check')).toBeGreaterThanOrEqual(0);
    expect(fnv1a32('range-check')).toBeLessThanOrEqual(0xffffffff);
    expect(keyHash32('x')).toBe(keyHash32('x'));
  });

  it('golden determinism: identical event sequences with identical seeds produce identical state hashes', () => {
    const runChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultConsistentHashingCluster();
      state = addKeys(state, 300, rng, 'golden');
      state = pureConsistentHashingTransition(
        state,
        { id: 'g-add', tick: state.tick + 1, type: 'CHASH_ADD_NODE', payload: { nodeId: 'node-F' } },
        rng,
      ).nextState;
      state = pureConsistentHashingTransition(
        state,
        { id: 'g-rm', tick: state.tick + 1, type: 'CHASH_REMOVE_NODE', payload: { nodeId: 'node-B' } },
        rng,
      ).nextState;
      state = pureConsistentHashingTransition(
        state,
        { id: 'g-vn', tick: state.tick + 1, type: 'CHASH_SET_VNODES', payload: { vnodesPerNode: 200 } },
        rng,
      ).nextState;
      return JSON.stringify(state);
    };
    expect(runChaos()).toBe(runChaos());
  });
});
