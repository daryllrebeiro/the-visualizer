import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from './deterministic-rng.js';

describe('DeterministicRNG', () => {
  it('should produce identical sequences given identical seeds', () => {
    const rng1 = new DeterministicRNG(42);
    const rng2 = new DeterministicRNG(42);

    const seq1 = Array.from({ length: 10 }, () => rng1.nextFloat());
    const seq2 = Array.from({ length: 10 }, () => rng2.nextFloat());

    expect(seq1).toEqual(seq2);
  });

  it('should produce different sequences given different seeds', () => {
    const rng1 = new DeterministicRNG(42);
    const rng2 = new DeterministicRNG(1337);

    const seq1 = Array.from({ length: 10 }, () => rng1.nextFloat());
    const seq2 = Array.from({ length: 10 }, () => rng2.nextFloat());

    expect(seq1).not.toEqual(seq2);
  });

  it('should produce integers within specified range', () => {
    const rng = new DeterministicRNG(42);
    const min = 5;
    const max = 15;

    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(min, max);
      expect(val).toBeGreaterThanOrEqual(min);
      expect(val).toBeLessThanOrEqual(max);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('should allow serializing and restoring state', () => {
    const rng = new DeterministicRNG(42);

    // Advance state
    rng.nextFloat();
    rng.nextInt(1, 10);
    const stateBefore = rng.getState();

    const val1 = rng.nextFloat();

    // Restore state
    rng.restoreState(stateBefore);
    const val2 = rng.nextFloat();

    expect(val1).toBe(val2);
  });
});
