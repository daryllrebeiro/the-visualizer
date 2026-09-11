/**
 * High-Throughput Simulation Benchmark Suite
 *
 * Measures pure reducer execution speed across all 28 domain plugins and
 * REPORTS ticks/second. This is intentionally not a hard wall-clock gate:
 * absolute throughput varies 3-4x across machines and thermal states (observed
 * 2.8k-10.7k ticks/sec on the same laptop), so asserting a fixed floor makes
 * the suite red for environmental reasons. The assertion below only locks in
 * completion (every scheduled tick reduces without throwing); track the
 * reported figure in CI trends instead of gating on it.
 */
import { describe, expect, it } from 'vitest';

import { DomainRegistry } from '../domains/registry.js';
import { DeterministicRNG } from '../prng/deterministic-rng.js';

describe('Simulation Engine Headless Throughput Benchmark', () => {
  it('reduces 5,000 bare ticks per domain without throwing (reports throughput)', () => {
    const domains = DomainRegistry.list();
    const TICKS_PER_DOMAIN = 5000;
    let totalTicksProcessed = 0;

    const startTime = performance.now();

    for (const meta of domains) {
      const plugin = DomainRegistry.get(meta.id)!;
      const rng = new DeterministicRNG(1337);
      let state = plugin.createDefaultState();

      for (let t = 0; t < TICKS_PER_DOMAIN; t++) {
        const event = {
          id: `bench-tick-${meta.id}-${t}`,
          tick: t,
          type: 'TICK' as any,
          payload: {},
        };

        const res = plugin.reduceState(state, event, rng);
        state = res.nextState;
        totalTicksProcessed++;
      }
    }

    const elapsedMs = performance.now() - startTime;
    const elapsedSec = elapsedMs / 1000;
    const ticksPerSec = totalTicksProcessed / elapsedSec;

    console.log(
      `⚡ Headless Simulation Throughput: ${Math.round(ticksPerSec).toLocaleString()} ticks/sec (${totalTicksProcessed} ticks in ${elapsedMs.toFixed(1)} ms)`,
    );

    // Completion gate only (see header): every scheduled tick reduced.
    expect(totalTicksProcessed).toBe(domains.length * TICKS_PER_DOMAIN);
  });
});
