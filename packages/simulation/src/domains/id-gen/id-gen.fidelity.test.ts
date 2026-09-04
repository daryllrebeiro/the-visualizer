import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { IdGenInvariantChecker } from './id-gen-invariants.js';
import { createDefaultIdGenCluster, pureIdGenTransition } from './id-gen-state-transitions.js';
import type { IdGenSimEvent } from './id-gen-types.js';
import { decomposeSnowflake, generateSnowflakeBigInt } from './snowflake-generator.js';

describe('Distributed ID Generation Domain Fidelity Suite', () => {
  const rng = new DeterministicRNG(42);
  const checker = new IdGenInvariantChecker();

  it('Snowflake Bit-Field Decomposition matches 64-bit Twitter specification', () => {
    const timestampDelta = 12345678; // 41-bit range
    const workerId = 42; // 10-bit range (0..1023)
    const sequence = 314; // 12-bit range (0..4095)

    const rawId = generateSnowflakeBigInt(timestampDelta, workerId, sequence);
    const decomposed = decomposeSnowflake(rawId);

    expect(decomposed.signBit).toBe(0);
    expect(decomposed.timestampDeltaMs).toBe(timestampDelta);
    expect(decomposed.workerId).toBe(workerId);
    expect(decomposed.sequence).toBe(sequence);
  });

  it('ID-1 & ID-2: Guarantees global uniqueness and per-worker monotonicity', () => {
    let state = createDefaultIdGenCluster();

    // Generate IDs across all 4 workers
    for (let w = 1; w <= 4; w++) {
      for (let i = 0; i < 20; i++) {
        const event: IdGenSimEvent = {
          id: `gen-${w}-${i}`,
          tick: i,
          type: 'ID_GEN_GENERATE',
          payload: { workerId: w },
        };
        state = pureIdGenTransition(state, event, rng).nextState;
      }
    }

    expect(state.generatedIds.length).toBe(80);
    const uniqueIds = new Set(state.generatedIds.map((r) => r.id));
    expect(uniqueIds.size).toBe(80); // No collisions

    const v = checker.check(state);
    expect(v).toBeUndefined();
  });

  it('ID-3: Enforces clock-regression refusal when NTP backward skew occurs', () => {
    let state = createDefaultIdGenCluster();
    const workerId = 1;

    // Advance clock and generate at tick 1000
    state.workers[workerId]!.currentTickMs = 1000;
    state.workers[workerId]!.lastSeenTickMs = 1000;
    state = pureIdGenTransition(
      state,
      { id: 'gen-1', tick: 1, type: 'ID_GEN_GENERATE', payload: { workerId } },
      rng,
    ).nextState;

    // Inject backward clock skew of 50ms (clock retreats to 950ms)
    state = pureIdGenTransition(
      state,
      {
        id: 'skew-1',
        tick: 2,
        type: 'ID_GEN_INJECT_CLOCK_SKEW',
        payload: { workerId, backwardSkewMs: 50 },
      },
      rng,
    ).nextState;

    // Worker refuses to generate!
    expect(state.workers[workerId]?.status).toBe('REFUSING_CLOCK_REGRESSION');

    state = pureIdGenTransition(
      state,
      { id: 'gen-refused', tick: 3, type: 'ID_GEN_GENERATE', payload: { workerId } },
      rng,
    ).nextState;

    // Still refused, no new ID emitted
    expect(state.flawsDemonstrated.clockRegressionRefusalTriggered).toBe(true);

    const v = checker.check(state);
    expect(v?.ruleId).toBe('ID-3');
    expect(v?.isPedagogicalFlaw).toBe(true);
  });

  it('ID-4: Correctly rolls over millisecond on 12-bit sequence overflow (>4096 IDs)', () => {
    let state = createDefaultIdGenCluster();
    const workerId = 2;
    const initialTick = state.workers[workerId]!.currentTickMs;

    // Flood worker with 5000 IDs in a single burst
    state = pureIdGenTransition(
      state,
      {
        id: 'flood-1',
        tick: 1,
        type: 'ID_GEN_FLOOD_OVERFLOW',
        payload: { workerId, burstCount: 4100 },
      },
      rng,
    ).nextState;

    expect(state.flawsDemonstrated.sequenceOverflowRolloverTriggered).toBe(true);
    // Worker clock advanced to handle overflow safely
    expect(state.workers[workerId]!.currentTickMs).toBeGreaterThan(initialTick);
  });

  it('Compares UUIDv4 (non-sortable) vs UUIDv7 (k-sortable)', () => {
    let stateV4 = createDefaultIdGenCluster();
    stateV4.generatorType = 'UUID_V4';

    stateV4 = pureIdGenTransition(
      stateV4,
      { id: 'gen-v4', tick: 1, type: 'ID_GEN_GENERATE', payload: { workerId: 1, count: 5 } },
      rng,
    ).nextState;

    expect(stateV4.generatedIds.every((r) => !r.isSortable)).toBe(true);

    let stateV7 = createDefaultIdGenCluster();
    stateV7.generatorType = 'UUID_V7';

    stateV7 = pureIdGenTransition(
      stateV7,
      { id: 'gen-v7', tick: 1, type: 'ID_GEN_GENERATE', payload: { workerId: 1, count: 5 } },
      rng,
    ).nextState;

    expect(stateV7.generatedIds.every((r) => r.isSortable)).toBe(true);
  });
});
