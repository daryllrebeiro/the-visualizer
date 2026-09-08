import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  bloomLookup,
  bloomPositions,
  bloomTheoreticalFpRate,
  countingBloomDelete,
  countingBloomLookup,
  cmsColumns,
  cmsEstimate,
  cuckooAlternateBucket,
  cuckooBuckets,
  cuckooFingerprint,
  cuckooLookup,
  hllEstimate,
  hllStandardError,
} from './probabilistic-structures-algorithms.js';
import { ProbabilisticStructuresInvariantChecker } from './probabilistic-structures-invariants.js';
import {
  createDefaultProbabilisticStructuresCluster,
  pureProbabilisticStructuresTransition,
} from './probabilistic-structures-state-transitions.js';
import type { ProbabilisticStructuresClusterState } from './probabilistic-structures-types.js';

/** Inserts in chunks respecting the reducer's 1000-element batch cap. */
function insertStream(
  state: ProbabilisticStructuresClusterState,
  elements: string[],
  rng: DeterministicRNG,
): ProbabilisticStructuresClusterState {
  const CHUNK = 1000;
  let tick = state.tick;
  for (let i = 0; i < elements.length; i += CHUNK) {
    tick += 1;
    state = pureProbabilisticStructuresTransition(
      state,
      {
        id: `ins-${i}`,
        tick,
        type: 'PROB_INSERT_BATCH',
        payload: { elements: elements.slice(i, i + CHUNK) },
      },
      rng,
    ).nextState;
  }
  return state;
}

function lookup(
  state: ProbabilisticStructuresClusterState,
  element: string,
  rng: DeterministicRNG,
  tick: number,
): ProbabilisticStructuresClusterState {
  return pureProbabilisticStructuresTransition(
    state,
    { id: `lk-${tick}`, tick, type: 'PROB_LOOKUP', payload: { element } },
    rng,
  ).nextState;
}

function genElements(count: number, prefix: string, rng: DeterministicRNG): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${rng.nextInt(0, 1_000_000)}-${i}`);
}

describe('Probabilistic Structures Domain Fidelity Test Suite', () => {
  it('PROB-1: no false negatives across Bloom, Counting Bloom, and Cuckoo after a 2000-element stream', () => {
    const rng = new DeterministicRNG(7);
    let state = createDefaultProbabilisticStructuresCluster();
    const elements = genElements(2000, 'p1', rng);
    state = insertStream(state, elements, rng);

    for (const e of elements) {
      expect(bloomLookup(state.bloom, e)).toBe(true);
      expect(countingBloomLookup(state.countingBloom, e)).toBe(true);
      // Cuckoo capacity: at 97.7% load some inserts are rejected
      // (surfaced via cuckooRejected, never silent). Membership is only
      // claimed for accepted inserts — those must never be false negatives.
      const accepted = (state.streamCounts[e] ?? 0) - (state.cuckooRejected[e] ?? 0) > 0;
      if (accepted) {
        expect(cuckooLookup(state.cuckoo, e)).toBe(true);
      }
    }
    // At this load factor the cuckoo filter is expected to surface some
    // rejections — capacity exhaustion is visible, not hidden.
    expect(state.cuckoo.rejectedInserts).toBeGreaterThan(0);

    const checker = new ProbabilisticStructuresInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('PROB-2: counting Bloom deletion never breaks a colliding still-present neighbor and never underflows', () => {
    const rng = new DeterministicRNG(13);
    let state = createDefaultProbabilisticStructuresCluster();

    // Construct a colliding pair: X and Y share >= 1 bit position.
    const X = 'collide-X';
    let Y: string | null = null;
    const xPositions = new Set(bloomPositions(X, state.countingBloom.m, state.countingBloom.k));
    for (let i = 0; i < 200_000; i++) {
      const candidate = `collide-Y-${i}`;
      const candidatePositions = bloomPositions(candidate, state.countingBloom.m, state.countingBloom.k);
      if (candidatePositions.some((p) => xPositions.has(p))) {
        Y = candidate;
        break;
      }
    }
    expect(Y).not.toBeNull();
    const y = Y as string;

    state = insertStream(state, [X, y], rng);

    // Delete X; Y must still test positive (PROB-2).
    state = pureProbabilisticStructuresTransition(
      state,
      { id: 'del-X', tick: 2, type: 'PROB_DELETE', payload: { element: X } },
      rng,
    ).nextState;

    expect(countingBloomLookup(state.countingBloom, y)).toBe(true);
    for (const c of state.countingBloom.counters) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(15);
    }

    // Deleting X again (absent) is rejected — underflow guard.
    const before = [...state.countingBloom.counters];
    const ok = countingBloomDelete(state.countingBloom, X);
    expect(ok).toBe(false);
    expect(state.countingBloom.counters).toEqual(before);

    const checker = new ProbabilisticStructuresInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('PROB-3: HLL single estimate within z=4 of the documented 1.04/sqrt(m) standard error, and multi-seed empirical SE converges', () => {
    // Part A: single estimate bound with fixed seed (deterministic).
    const rng = new DeterministicRNG(17);
    let state = createDefaultProbabilisticStructuresCluster();
    const elements = genElements(10_000, 'hll', rng);
    state = insertStream(state, elements, rng);

    const trueCount = 10_000;
    const m = state.hll.m;
    const estimate = hllEstimate(state.hll);
    const fourSigma = 4 * hllStandardError(m) * trueCount;
    expect(Math.abs(estimate - trueCount)).toBeLessThanOrEqual(fourSigma);

    const checker = new ProbabilisticStructuresInvariantChecker();
    expect(checker.check(state)).toBeUndefined();

    // Part B: empirical relative-error SE across 8 independent seeds
    // falls in a band around the formula (sample-SE noise with 7 dof).
    const relErrors: number[] = [];
    for (let seed = 100; seed < 108; seed++) {
      const r = new DeterministicRNG(seed);
      const els = genElements(10_000, `hlls${seed}`, r);
      let s = createDefaultProbabilisticStructuresCluster();
      // Feed only HLL-relevant inserts (all structures fed; identical).
      s = insertStream(s, els, r);
      relErrors.push((hllEstimate(s.hll) - trueCount) / trueCount);
    }
    const mean = relErrors.reduce((a, b) => a + b, 0) / relErrors.length;
    const empiricalSe = Math.sqrt(
      relErrors.reduce((acc, e) => acc + (e - mean) ** 2, 0) / (relErrors.length - 1),
    );
    const formulaSe = hllStandardError(m);
    expect(empiricalSe).toBeGreaterThan(0.4 * formulaSe);
    expect(empiricalSe).toBeLessThan(2.5 * formulaSe);
  });

  it('PROB-4: Count-Min Sketch only ever overestimates, including on constructed adversarial collisions', () => {
    const rng = new DeterministicRNG(19);
    let state = createDefaultProbabilisticStructuresCluster();

    const A = 'cms-A';
    // Adversarial construction: find B colliding with A in row 0 so the
    // row-0 counter inflates A's estimate. The min-over-rows must still
    // never drop below A's true frequency.
    const aCols = cmsColumns(A, state.cms.rows, state.cms.width);
    let collisionB: string | null = null;
    for (let i = 0; i < 500_000; i++) {
      const candidate = `cms-B-${i}`;
      if (cmsColumns(candidate, state.cms.rows, state.cms.width)[0] === aCols[0]) {
        collisionB = candidate;
        break;
      }
    }
    expect(collisionB).not.toBeNull();

    // Insert A 5 times, B 200 times (heavy collision pressure).
    const stream: string[] = [];
    for (let i = 0; i < 5; i++) stream.push(A);
    for (let i = 0; i < 200; i++) stream.push(collisionB as string);
    state = insertStream(state, stream, rng);

    expect(cmsEstimate(state.cms, A)).toBeGreaterThanOrEqual(5);
    // Every stream element obeys the one-sided bound.
    for (const e of stream) {
      expect(cmsEstimate(state.cms, e)).toBeGreaterThanOrEqual(1);
    }

    const checker = new ProbabilisticStructuresInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('PROB-4: invariant checker catches a constructed underestimate (a decremented CMS counter)', () => {
    const rng = new DeterministicRNG(23);
    let state = createDefaultProbabilisticStructuresCluster();
    state = insertStream(state, ['undercut-1', 'undercut-2', 'undercut-3'], rng);

    const tampered = JSON.parse(JSON.stringify(state)) as ProbabilisticStructuresClusterState;
    // Simulate a buggy decrement: drop the counter for undercut-1 in row 0.
    const cols = cmsColumns('undercut-1', tampered.cms.rows, tampered.cms.width);
    tampered.cms.counters[0]![cols[0] as number] = 0;

    const checker = new ProbabilisticStructuresInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('PROB-4');
  });

  it('PROB-1: invariant checker catches a flipped Bloom bit for a present element', () => {
    const rng = new DeterministicRNG(29);
    let state = createDefaultProbabilisticStructuresCluster();
    state = insertStream(state, ['flipbit-1', 'flipbit-2'], rng);

    const tampered = JSON.parse(JSON.stringify(state)) as ProbabilisticStructuresClusterState;
    const positions = bloomPositions('flipbit-1', tampered.bloom.m, tampered.bloom.k);
    tampered.bloom.bits[positions[0] as number] = 0;

    const checker = new ProbabilisticStructuresInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('PROB-1');
    expect(violation?.description).toContain('flipbit-1');
  });

  it('measured Bloom false-positive rate tracks the (1 - e^(-kn/m))^k formula', () => {
    const rng = new DeterministicRNG(31);
    let state = createDefaultProbabilisticStructuresCluster();
    const inserted = genElements(2000, 'fp', rng);
    state = insertStream(state, inserted, rng);

    // Probe 5000 absent elements; measure empirical FP rate.
    const probes = genElements(5000, 'absent', rng);
    let fp = 0;
    for (const p of probes) {
      if (bloomLookup(state.bloom, p)) fp++;
    }
    const measured = fp / probes.length;
    const expected = bloomTheoreticalFpRate(state.bloom.m, state.bloom.k, inserted.length);
    // Binomial 4-sigma tolerance around the theoretical rate.
    const tolerance = 4 * Math.sqrt(expected * (1 - expected) / probes.length) + 0.002;
    expect(Math.abs(measured - expected)).toBeLessThanOrEqual(tolerance);
  });

  it('cuckoo kicks preserve the two-bucket lookup invariant (no false negatives after displacement)', () => {
    const rng = new DeterministicRNG(37);
    let state = createDefaultProbabilisticStructuresCluster();

    // 512 buckets x 4 slots = 2048 slots; 1750 elements (~85% load)
    // forces displacement kicks well before capacity rejection.
    const elements = genElements(1750, 'kick', rng);
    state = insertStream(state, elements, rng);

    expect(state.stats.cuckooKicks).toBeGreaterThan(0);
    for (const e of elements) {
      const accepted = (state.streamCounts[e] ?? 0) - (state.cuckooRejected[e] ?? 0) > 0;
      if (accepted) {
        expect(cuckooLookup(state.cuckoo, e)).toBe(true);
      }
    }
  });

  it('cuckoo alternate-bucket relation: i2 = i1 XOR hash(fingerprint) round-trips', () => {
    for (let i = 0; i < 500; i++) {
      const element = `alt-probe-${i}`;
      const fp = cuckooFingerprint(element);
      const [i1, i2] = cuckooBuckets(element, fp, 256);
      // Alternating twice returns to the original bucket.
      expect(cuckooAlternateBucket(i2, fp, 256)).toBe(i1);
      // i1 and i2 are valid bucket indices.
      expect(i1).toBeGreaterThanOrEqual(0);
      expect(i1).toBeLessThan(256);
      expect(i2).toBeGreaterThanOrEqual(0);
      expect(i2).toBeLessThan(256);
    }
  });

  it('standard Bloom deletion is surfaced as unsupported (the naive bit-clear hazard)', () => {
    const rng = new DeterministicRNG(41);
    let state = createDefaultProbabilisticStructuresCluster();
    state = insertStream(state, ['no-delete-1'], rng);

    state = pureProbabilisticStructuresTransition(
      state,
      { id: 'del-attempt', tick: 2, type: 'PROB_DELETE', payload: { element: 'no-delete-1' } },
      rng,
    ).nextState;

    expect(state.stats.bloomDeletesAttempted).toBe(1);
    // The Bloom bits are untouched — no naive bit-clearing happened.
    expect(bloomLookup(state.bloom, 'no-delete-1')).toBe(true);
  });

  it('golden determinism: identical streams with identical seeds produce identical state', () => {
    const runChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultProbabilisticStructuresCluster();
      state = insertStream(state, genElements(500, 'golden', rng), rng);
      state = pureProbabilisticStructuresTransition(
        state,
        { id: 'g-del', tick: 2, type: 'PROB_DELETE', payload: { element: 'golden-0' } },
        rng,
      ).nextState;
      state = lookup(state, 'golden-1', rng, 3);
      state = lookup(state, 'never-inserted', rng, 4);
      return JSON.stringify(state);
    };
    expect(runChaos()).toBe(runChaos());
  });
});
