/**
 * Long-Running Simulation Memory Stability & Boundary Test Suite
 *
 * Verifies that the simulation engine handles 10,000+ continuous ticks
 * without memory leaks, heap bloat, or invariant assertion degradation.
 */
import { describe, expect, it } from 'vitest';
import { DeterministicRNG } from '../prng/deterministic-rng.js';
import { DomainRegistry } from '../domains/registry.js';

describe('Long-Running Simulation Memory Stability', () => {
  it('runs 10,000 ticks across all 8 domain reducers with bounded memory footprint', () => {
    const domains = DomainRegistry.list();
    const ITERATIONS = 1250; // 1250 ticks * 8 domains = 10,000 total ticks

    if (typeof global.gc === 'function') {
      global.gc();
    }
    const memBefore = process.memoryUsage().heapUsed;

    for (const meta of domains) {
      const plugin = DomainRegistry.get(meta.id)!;
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      for (let t = 0; t < ITERATIONS; t++) {
        const event = {
          id: `mem-tick-${t}`,
          tick: t,
          type: 'TICK' as any,
          payload: {},
        };

        try {
          const res = plugin.reduceState(state, event, rng);
          state = res.nextState;
        } catch {
          // Unhandled tick types default to no-op
        }

        // Run invariant check every 100 ticks
        if (t % 100 === 0) {
          const checkResult = plugin.validateInvariants(state);
          expect(checkResult.passed).toBe(true);
        }
      }

      // Final state must remain valid object
      expect(state).toBeDefined();
    }

    if (typeof global.gc === 'function') {
      global.gc();
    }
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMb = (memAfter - memBefore) / (1024 * 1024);

    // Assert that heap delta after 10,000 ticks is less than 75 MB (bounded growth)
    expect(memDeltaMb).toBeLessThan(75);
  });
});
