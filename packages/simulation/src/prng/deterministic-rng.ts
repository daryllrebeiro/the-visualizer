/**
 * Deterministic SplitMix32 PRNG
 *
 * Given the same seed, produces the exact same sequence every time.
 * This is the ONLY source of randomness allowed in the simulation engine.
 *
 * References:
 * - SplitMix32: https://prng.di.unimi.it/splitmix32.c
 * - Used by: network jitter, partition assignment tie-breakers,
 *            chaos victim selection, consumer group leader election
 */
export class DeterministicRNG {
  private state: number;

  constructor(seed: number) {
    // Ensure seed is a 32-bit integer
    this.state = seed | 0;
  }

  /**
   * Returns the next float in [0, 1)
   * Identical output for identical state — no side effects.
   */
  public nextFloat(): number {
    this.state = (this.state + 0x9e3779b9) | 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return ((z ^ (z >>> 16)) >>> 0) / 4294967296;
  }

  /**
   * Returns the next integer in [min, max] (inclusive)
   */
  public nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }

  /**
   * Returns the next boolean with given probability (default 0.5)
   */
  public nextBool(probability = 0.5): boolean {
    return this.nextFloat() < probability;
  }

  /**
   * Selects a random element from an array (must be non-empty)
   */
  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('DeterministicRNG.pick: cannot pick from empty array');
    }
    const index = this.nextInt(0, items.length - 1);
    // Safe due to the bounds check above
    return items[index] as T;
  }

  /**
   * Shuffles array in-place using Fisher-Yates. Deterministic.
   */
  public shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const temp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = temp;
    }
    return items;
  }

  /**
   * Returns current state for serialization / snapshotting
   */
  public getState(): number {
    return this.state;
  }

  /**
   * Restores PRNG to a previously saved state
   */
  public restoreState(state: number): void {
    this.state = state | 0;
  }

  /**
   * Creates a new child RNG seeded from this one (for branching)
   */
  public fork(): DeterministicRNG {
    return new DeterministicRNG(this.nextInt(0, 2147483647));
  }
}
