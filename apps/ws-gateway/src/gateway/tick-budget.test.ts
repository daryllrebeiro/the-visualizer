import { existsSync } from 'node:fs';

import { afterAll, describe, expect, it } from 'vitest';

import { DomainRegistry, DeterministicRNG } from '@the-visualizer/simulation';

import { TickBudget, type ShedDecision } from './tick-budget.js';
import { reduceTick } from '../workers/tick-worker.js';
import { TickWorkerPool } from '../workers/tick-pool.js';

describe('TickBudget slow-tick shedding', () => {
  it('stays ok under the shed threshold', () => {
    const budget = new TickBudget({ shedThresholdMs: 40, haltThresholdMs: 250 });
    budget.record(5);
    budget.record(10);
    expect(budget.decide()).toBe<ShedDecision>('ok');
  });

  it('sheds when the rolling average crosses the threshold', () => {
    const budget = new TickBudget({ window: 5, shedThresholdMs: 40, haltThresholdMs: 250 });
    for (let i = 0; i < 5; i++) budget.record(60);
    expect(budget.decide()).toBe<ShedDecision>('shed');
  });

  it('escalates to halt on extreme averages or a sustained shed streak', () => {
    const extreme = new TickBudget({ shedThresholdMs: 40, haltThresholdMs: 250 });
    extreme.record(400);
    expect(extreme.decide()).toBe<ShedDecision>('halt');

    const sustained = new TickBudget({ window: 5, shedThresholdMs: 40, haltThresholdMs: 250, shedStreakForHalt: 3 });
    for (let i = 0; i < 5; i++) sustained.record(60);
    expect(sustained.decide()).toBe<ShedDecision>('shed');
    expect(sustained.decide()).toBe<ShedDecision>('shed');
    expect(sustained.decide()).toBe<ShedDecision>('halt');
  });

  it('recovers to ok once duration drops and computes a shed factor', () => {
    const budget = new TickBudget({ window: 3, shedThresholdMs: 40 });
    budget.record(60);
    budget.record(60);
    budget.record(60);
    expect(budget.decide()).not.toBe<ShedDecision>('ok');
    budget.record(1);
    budget.record(1);
    budget.record(1);
    expect(budget.decide()).toBe<ShedDecision>('ok');

    expect(TickBudget.shedEveryNthTick(10, 40)).toBe(1);
    expect(TickBudget.shedEveryNthTick(80, 40)).toBe(2);
    expect(TickBudget.shedEveryNthTick(100000, 40)).toBe(10);
  });
});

describe('reduceTick (worker logic) determinism', () => {
  it('matches the inline reducer and round-trips RNG state', () => {
    const plugin = DomainRegistry.get('rate-limiter')!;
    const state = plugin.createDefaultState();
    const event = { id: 'w1', tick: 1, type: 'RATE_LIMITER_TICK', payload: {} };

    const inlineRng = new DeterministicRNG(4242);
    const inline = plugin.reduceState(state, event, inlineRng);

    const result = reduceTick({ jobId: 1, domainId: 'rate-limiter', state, event, rngState: new DeterministicRNG(4242).getState() });

    expect(result.error).toBeUndefined();
    expect(JSON.stringify(result.nextState)).toBe(JSON.stringify(inline.nextState));
    expect(result.rngState).toBe(inlineRng.getState());
  });

  it('returns a structured error for an unknown domain instead of throwing', () => {
    const result = reduceTick({
      jobId: 2,
      domainId: 'not-a-domain',
      state: {},
      event: { id: 'x', tick: 1, type: 'T', payload: {} },
      rngState: 1,
    });
    expect(result.error).toMatch(/Unknown domain/);
    expect(result.nextState).toEqual({});
  });
});

// Real worker-thread test; runs against the compiled entrypoint when present.
const COMPILED_WORKER = new URL('../../dist/workers/tick-worker.js', import.meta.url);
const hasCompiledWorker = existsSync(COMPILED_WORKER);

describe.skipIf(!hasCompiledWorker)('TickWorkerPool (compiled worker)', () => {
  const pools: TickWorkerPool[] = [];
  afterAll(async () => {
    for (const pool of pools) await pool.close();
  });

  it('runs a tick through a real worker thread', async () => {
    const pool = new TickWorkerPool(1, COMPILED_WORKER);
    pools.push(pool);
    const plugin = DomainRegistry.get('rate-limiter')!;
    const result = await pool.run({
      domainId: 'rate-limiter',
      state: plugin.createDefaultState(),
      event: { id: 'w1', tick: 1, type: 'RATE_LIMITER_TICK', payload: {} },
      rngState: new DeterministicRNG(7).getState(),
    });
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
