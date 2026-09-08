import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { ModelRolloutInvariantChecker } from './model-rollout-invariants.js';
import {
  createDefaultModelRolloutCluster,
  pureModelRolloutTransition,
} from './model-rollout-state-transitions.js';
import type { ModelRolloutClusterState, ModelRolloutSimEvent } from './model-rollout-types.js';

function ev(state: ModelRolloutClusterState, event: ModelRolloutSimEvent, rng: DeterministicRNG): ModelRolloutClusterState {
  return pureModelRolloutTransition(state, event, rng).nextState;
}

describe('Model Rollout Domain Fidelity Test Suite', () => {
  it('ROLL-1: a crashing shadow model has zero impact on live traffic and live metrics', () => {
    const rng = new DeterministicRNG(1);
    let state = createDefaultModelRolloutCluster();

    // model-v3: 100% error rate, terrible latency — as the shadow.
    state = ev(state, { id: 'reg', tick: 0, type: 'ROLL_REGISTER_MODEL', payload: { id: 'model-v3', errorRate: 1, conversionRate: 0.1 } }, rng);
    state = ev(state, { id: 'shadow', tick: 0, type: 'ROLL_SET_SHADOW', payload: { version: 'model-v3', enabled: true } }, rng);

    // Live traffic with the shadow crashing the whole time.
    state = ev(state, { id: 'traffic', tick: 1, type: 'ROLL_SEND_TRAFFIC', payload: { count: 500 } }, rng);

    // Every shadow request errored; live metrics are untouched.
    expect(state.shadowMetrics.requests).toBe(500);
    expect(state.shadowMetrics.errors).toBe(500);
    const live = state.metrics['model-v1']!;
    expect(live.requests).toBe(500);
    expect(live.errors).toBeLessThanOrEqual(500 * 0.02 + 30); // ~2% error rate
    expect(state.stats.totalRequests).toBe(500);
    expect(state.stats.shadowRequests).toBe(500);

    // The baseline's conversion behavior stayed intact (client impact zero).
    expect(live.conversions).toBeGreaterThan(500 * 0.5);

    const checker = new ModelRolloutInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('ROLL-2: 10,000-request canary split tracks the configured 10% within statistical bounds', () => {
    const rng = new DeterministicRNG(2);
    let state = createDefaultModelRolloutCluster();
    state = ev(state, { id: 'canary', tick: 0, type: 'ROLL_SET_CANARY', payload: { version: 'model-v2', percent: 10 } }, rng);
    state = ev(state, { id: 'traffic', tick: 1, type: 'ROLL_SEND_TRAFFIC', payload: { count: 10_000 } }, rng);

    const canaryRequests = state.metrics['model-v2']!.requests;
    const baselineRequests = state.metrics['model-v1']!.requests;
    expect(canaryRequests + baselineRequests).toBe(10_000);
    // 4-sigma binomial band around 10%.
    const sigma = 4 * Math.sqrt(0.1 * 0.9 / 10_000);
    expect(Math.abs(canaryRequests / 10_000 - 0.1)).toBeLessThanOrEqual(Math.max(sigma, 0.001));

    const checker = new ModelRolloutInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('ROLL-2: invariant checker catches a badly skewed traffic split', () => {
    const rng = new DeterministicRNG(3);
    let state = createDefaultModelRolloutCluster();
    state = ev(state, { id: 'canary', tick: 0, type: 'ROLL_SET_CANARY', payload: { version: 'model-v2', percent: 10 } }, rng);
    state = ev(state, { id: 'traffic', tick: 1, type: 'ROLL_SEND_TRAFFIC', payload: { count: 2_000 } }, rng);

    // Tamper: simulate a routing bug that starved the canary.
    const tampered = JSON.parse(JSON.stringify(state)) as ModelRolloutClusterState;
    const canary = tampered.metrics['model-v2']!;
    const baseline = tampered.metrics['model-v1']!;
    baseline.requests += canary.requests; // canary got nothing
    canary.requests = 0;
    canary.errors = 0;
    canary.conversions = 0;
    canary.latencyTickSum = 0;

    const checker = new ModelRolloutInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('ROLL-2');
    expect(violation?.description).toContain('configured split');
  });

  it('ROLL-3: elevated canary error rate triggers automatic rollback without manual intervention', () => {
    const rng = new DeterministicRNG(4);
    let state = createDefaultModelRolloutCluster();
    state = ev(state, { id: 'canary', tick: 0, type: 'ROLL_SET_CANARY', payload: { version: 'model-v2', percent: 50 } }, rng);

    // Inject a 15% error rate on the canary (threshold 5%).
    state = ev(state, { id: 'rates', tick: 0, type: 'ROLL_SET_RATES', payload: { version: 'model-v2', errorRate: 0.15 } }, rng);

    // Traffic each tick; the evaluation window is 3 ticks.
    for (let t = 1; t <= 3; t++) {
      state = ev(state, { id: `tr-${t}`, tick: t, type: 'ROLL_SEND_TRAFFIC', payload: { count: 500 } }, rng);
      state = ev(state, { id: `tk-${t}`, tick: t, type: 'ROLL_TICK', payload: {} }, rng);
    }
    // Window elapsed: consecutiveBadTicks reached 3 -> rollback fired.
    expect(state.rollback.fsm).toBe('ROLLED_BACK');
    expect(state.rollback.triggerMetric).toContain('error rate');
    expect(state.trafficSplit.canaryPercent).toBe(0);
    expect(state.registry['model-v2']?.stage).toBe('ARCHIVED');
    expect(state.lastRollbackEvent?.version).toBe('model-v2');
    expect(state.stats.rollbacks).toBe(1);
    // Rollback within window+1 tick, automatic (no manual dispatch event).
    expect(state.rollback.triggeredAtTick).toBeLessThanOrEqual(4);

    const checker = new ModelRolloutInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('ROLL-3: a healthy canary is never rolled back', () => {
    const rng = new DeterministicRNG(5);
    let state = createDefaultModelRolloutCluster();
    state = ev(state, { id: 'canary', tick: 0, type: 'ROLL_SET_CANARY', payload: { version: 'model-v2', percent: 50 } }, rng);
    for (let t = 1; t <= 10; t++) {
      state = ev(state, { id: `tr-${t}`, tick: t, type: 'ROLL_SEND_TRAFFIC', payload: { count: 200 } }, rng);
      state = ev(state, { id: `tk-${t}`, tick: t, type: 'ROLL_TICK', payload: {} }, rng);
    }
    expect(state.rollback.fsm).toBe('HEALTHY');
    expect(state.canaryVersion).toBe('model-v2');
    const checker = new ModelRolloutInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('ROLL-4: small-sample promotion is blocked pending statistical significance; large-sample passes', () => {
    const rng = new DeterministicRNG(6);

    // Small-sample case: canary converts 70% vs baseline 60% at n~50.
    let small = createDefaultModelRolloutCluster();
    small = ev(small, { id: 'rates-c', tick: 0, type: 'ROLL_SET_RATES', payload: { version: 'model-v2', conversionRate: 0.7 } }, rng);
    small = ev(small, { id: 'canary', tick: 0, type: 'ROLL_SET_CANARY', payload: { version: 'model-v2', percent: 50 } }, rng);
    small = ev(small, { id: 'tr', tick: 1, type: 'ROLL_SEND_TRAFFIC', payload: { count: 100 } }, rng);
    small = ev(small, { id: 'promote', tick: 2, type: 'ROLL_PROMOTE', payload: {} }, rng);

    expect(small.lastPromotionAttempt?.allowed).toBe(false);
    expect(small.lastPromotionAttempt?.reasons.join('; ')).toContain('insufficient sample');
    expect(small.canaryVersion).toBe('model-v2'); // still canary
    expect(small.stats.promotionsBlocked).toBe(1);

    const checkerSmall = new ModelRolloutInvariantChecker();
    expect(checkerSmall.check(small)).toBeUndefined();

    // Large-sample case: same uplift at n~2000/arm.
    let large = createDefaultModelRolloutCluster();
    large = ev(large, { id: 'rates-c', tick: 0, type: 'ROLL_SET_RATES', payload: { version: 'model-v2', conversionRate: 0.7 } }, rng);
    large = ev(large, { id: 'canary', tick: 0, type: 'ROLL_SET_CANARY', payload: { version: 'model-v2', percent: 50 } }, rng);
    large = ev(large, { id: 'tr', tick: 1, type: 'ROLL_SEND_TRAFFIC', payload: { count: 4_000 } }, rng);
    large = ev(large, { id: 'promote', tick: 2, type: 'ROLL_PROMOTE', payload: {} }, rng);

    expect(large.lastPromotionAttempt?.allowed).toBe(true);
    expect(large.lastPromotionAttempt?.zScore).not.toBeNull();
    expect(large.lastPromotionAttempt?.zScore as number).toBeGreaterThan(1.96);
    expect(large.canaryVersion).toBeNull(); // promoted to stable
    expect(large.baselineVersion).toBe('model-v2');
    expect(large.registry['model-v2']?.stage).toBe('STABLE');
    expect(large.registry['model-v1']?.stage).toBe('ARCHIVED');

    const checkerLarge = new ModelRolloutInvariantChecker();
    expect(checkerLarge.check(large)).toBeUndefined();
  });

  it('ROLL-4: a canary with WORSE conversions is never promoted regardless of sample size', () => {
    const rng = new DeterministicRNG(7);
    let state = createDefaultModelRolloutCluster();
    state = ev(state, { id: 'rates', tick: 0, type: 'ROLL_SET_RATES', payload: { version: 'model-v2', conversionRate: 0.3 } }, rng);
    state = ev(state, { id: 'canary', tick: 0, type: 'ROLL_SET_CANARY', payload: { version: 'model-v2', percent: 50 } }, rng);
    state = ev(state, { id: 'tr', tick: 1, type: 'ROLL_SEND_TRAFFIC', payload: { count: 4_000 } }, rng);
    state = ev(state, { id: 'promote', tick: 2, type: 'ROLL_PROMOTE', payload: {} }, rng);

    expect(state.lastPromotionAttempt?.allowed).toBe(false);
    expect(state.lastPromotionAttempt?.reasons.join('; ')).toContain('not statistically significant');
    expect(state.canaryVersion).toBe('model-v2');
  });

  it('ROLL-5: a blocked eval gate rejects promotion regardless of metrics (EVAL-4 standalone seam)', () => {
    const rng = new DeterministicRNG(8);
    let state = createDefaultModelRolloutCluster();
    state = ev(state, { id: 'rates', tick: 0, type: 'ROLL_SET_RATES', payload: { version: 'model-v2', conversionRate: 0.7 } }, rng);
    state = ev(state, { id: 'canary', tick: 0, type: 'ROLL_SET_CANARY', payload: { version: 'model-v2', percent: 50 } }, rng);
    state = ev(state, { id: 'tr', tick: 1, type: 'ROLL_SEND_TRAFFIC', payload: { count: 4_000 } }, rng);

    // Metrics alone would allow promotion — but the eval gate blocks.
    state = ev(
      state,
      {
        id: 'gate',
        tick: 2,
        type: 'ROLL_SET_EVAL_GATE',
        payload: {
          gate: {
            sourceRunId: 'run-model-v2-1',
            policyVersion: 1,
            criticalPassed: false,
            blocked: true,
          },
        },
      },
      rng,
    );
    state = ev(state, { id: 'promote', tick: 3, type: 'ROLL_PROMOTE', payload: {} }, rng);

    expect(state.lastPromotionAttempt?.allowed).toBe(false);
    expect(state.lastPromotionAttempt?.reasons.join('; ')).toContain('blocked by eval gate');
    expect(state.canaryVersion).toBe('model-v2'); // promotion rejected
    expect(state.stats.promotionsBlocked).toBe(1);

    const checker = new ModelRolloutInvariantChecker();
    expect(checker.check(state)).toBeUndefined();

    // Clearing the gate allows promotion (the metrics were always good).
    state = ev(state, { id: 'clear', tick: 4, type: 'ROLL_CLEAR_EVAL_GATE', payload: {} }, rng);
    state = ev(state, { id: 'promote2', tick: 5, type: 'ROLL_PROMOTE', payload: {} }, rng);
    expect(state.lastPromotionAttempt?.allowed).toBe(true);
    expect(state.baselineVersion).toBe('model-v2');
  });

  it('ROLL-5: checker catches a promotion allowed while the gate blocks', () => {
    const rng = new DeterministicRNG(9);
    let state = createDefaultModelRolloutCluster();
    state = ev(
      state,
      {
        id: 'gate',
        tick: 0,
        type: 'ROLL_SET_EVAL_GATE',
        payload: { gate: { sourceRunId: 'run-x', policyVersion: 1, criticalPassed: false, blocked: true } },
      },
      rng,
    );

    // Tamper: simulate a gate-bypass bug — a promotion allowed under block.
    const tampered = JSON.parse(JSON.stringify(state)) as ModelRolloutClusterState;
    tampered.lastPromotionAttempt = {
      tick: 1,
      allowed: true,
      reasons: [],
      sampleSizes: { baseline: 2000, canary: 2000 },
      zScore: 4.5,
    };

    const checker = new ModelRolloutInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('ROLL-5');
    expect(violation?.description).toContain('reached production');
  });

  it('ROLL-3: checker catches a canary that breached the threshold without rollback', () => {
    const rng = new DeterministicRNG(10);
    let state = createDefaultModelRolloutCluster();
    state = ev(state, { id: 'canary', tick: 0, type: 'ROLL_SET_CANARY', payload: { version: 'model-v2', percent: 50 } }, rng);
    state = ev(state, { id: 'rates', tick: 0, type: 'ROLL_SET_RATES', payload: { version: 'model-v2', errorRate: 0.5 } }, rng);
    state = ev(state, { id: 'tr', tick: 1, type: 'ROLL_SEND_TRAFFIC', payload: { count: 500 } }, rng);

    // Tamper: simulate a broken rollback loop — bad ticks exceed the
    // window but the canary is still live.
    const tampered = JSON.parse(JSON.stringify(state)) as ModelRolloutClusterState;
    tampered.consecutiveBadTicks = 99;
    tampered.rollback.fsm = 'HEALTHY';

    const checker = new ModelRolloutInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('ROLL-3');
    expect(violation?.description).toContain('automatic rollback did not fire');
  });

  it('golden determinism: identical event sequences with identical seeds produce identical state', () => {
    const runChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultModelRolloutCluster();
      state = ev(state, { id: 'canary', tick: 0, type: 'ROLL_SET_CANARY', payload: { version: 'model-v2', percent: 20 } }, rng);
      state = ev(state, { id: 'shadow', tick: 0, type: 'ROLL_SET_SHADOW', payload: { version: 'model-v2', enabled: true } }, rng);
      state = ev(state, { id: 'tr1', tick: 1, type: 'ROLL_SEND_TRAFFIC', payload: { count: 500 } }, rng);
      state = ev(state, { id: 'tk1', tick: 1, type: 'ROLL_TICK', payload: {} }, rng);
      state = ev(state, { id: 'rates', tick: 2, type: 'ROLL_SET_RATES', payload: { version: 'model-v2', errorRate: 0.2 } }, rng);
      state = ev(state, { id: 'tr2', tick: 2, type: 'ROLL_SEND_TRAFFIC', payload: { count: 500 } }, rng);
      state = ev(state, { id: 'tk2', tick: 2, type: 'ROLL_TICK', payload: {} }, rng);
      state = ev(state, { id: 'tk3', tick: 3, type: 'ROLL_TICK', payload: {} }, rng);
      state = ev(
        state,
        {
          id: 'gate',
          tick: 4,
          type: 'ROLL_SET_EVAL_GATE',
          payload: { gate: { sourceRunId: 'g', policyVersion: 2, criticalPassed: true, blocked: false } },
        },
        rng,
      );
      state = ev(state, { id: 'promote', tick: 5, type: 'ROLL_PROMOTE', payload: {} }, rng);
      return JSON.stringify(state);
    };
    expect(runChaos()).toBe(runChaos());
  });
});
