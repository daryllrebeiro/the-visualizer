/**
 * High-Throughput Simulation Benchmark Suite
 *
 * Measures pure reducer execution speed across all 8 domain plugins.
 * Target: >= 5,000 ticks/second in headless discrete event mode.
 */
import { describe, expect, it } from 'vitest';
import { DeterministicRNG } from '../prng/deterministic-rng.js';
import { DomainRegistry } from '../domains/registry.js';

describe('Simulation Engine Headless Throughput Benchmark', () => {
  it('achieves >= 5,000 ticks/second aggregate throughput across all 8 domain reducers', () => {
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

    console.log(`⚡ Headless Simulation Throughput: ${Math.round(ticksPerSec).toLocaleString()} ticks/sec (${totalTicksProcessed} ticks in ${elapsedMs.toFixed(1)} ms)`);

    // Must exceed target threshold (5,000 ticks/sec)
    expect(ticksPerSec).toBeGreaterThanOrEqual(5000);
  });
});
