import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { LlmEvalInvariantChecker } from './llm-eval-invariants.js';
import {
  createDefaultLlmEvalCluster,
  pureLlmEvalTransition,
} from './llm-eval-state-transitions.js';
import type { LlmEvalClusterState, LlmEvalSimEvent } from './llm-eval-types.js';

function ev(state: LlmEvalClusterState, event: LlmEvalSimEvent, rng: DeterministicRNG): LlmEvalClusterState {
  return pureLlmEvalTransition(state, event, rng).nextState;
}

describe('LLM Evaluation Domain Fidelity Test Suite', () => {
  it('EVAL-1: a complete run scores every suite case in every risk area', () => {
    const rng = new DeterministicRNG(1);
    let state = createDefaultLlmEvalCluster();
    state = ev(state, { id: 'run', tick: 1, type: 'EVAL_RUN', payload: { modelVersion: 'model-v1.0' } }, rng);

    const runId = state.evalRunOrder[0] as string;
    const run = state.evalRuns[runId]!;
    expect(run.completed).toBe(true);
    expect(Object.keys(run.caseResults).length).toBe(state.evalSuite.length);
    const riskAreas = new Set(state.evalSuite.map((c) => c.riskArea));
    for (const area of riskAreas) {
      const areaCases = state.evalSuite.filter((c) => c.riskArea === area);
      expect(areaCases.every((c) => run.caseResults[c.id] !== undefined)).toBe(true);
    }

    const checker = new LlmEvalInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('EVAL-1: a partial run is never reported as complete', () => {
    const rng = new DeterministicRNG(2);
    let state = createDefaultLlmEvalCluster();
    state = ev(state, { id: 'partial', tick: 1, type: 'EVAL_RUN', payload: { modelVersion: 'model-v1.0', partial: true } }, rng);

    const run = state.evalRuns[state.evalRunOrder[0] as string]!;
    expect(run.completed).toBe(false);
    expect(Object.keys(run.caseResults).length).toBeLessThan(state.evalSuite.length);

    const checker = new LlmEvalInvariantChecker();
    expect(checker.check(state)).toBeUndefined();

    // Checker catches a partial run falsely marked complete.
    const tampered = JSON.parse(JSON.stringify(state)) as LlmEvalClusterState;
    tampered.evalRuns[tampered.evalRunOrder[0] as string]!.completed = true;
    const violation = new LlmEvalInvariantChecker().check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('EVAL-1');
    expect(violation?.description).toContain('partial run reported as complete');
  });

  it('EVAL-2: a scripted red-team regression on a new model version is flagged, not absorbed', () => {
    const rng = new DeterministicRNG(3);
    let state = createDefaultLlmEvalCluster();

    // Baseline: v1.0 with all red-team attempts blocked.
    state = ev(state, { id: 'run-v1', tick: 1, type: 'EVAL_RUN', payload: { modelVersion: 'model-v1.0' } }, rng);
    const baselineRun = state.evalRuns[state.evalRunOrder[0] as string]!;
    expect(baselineRun.regressions).toHaveLength(0);

    // Declare v1.2 where the DAN-bypass attempt (rt-2) now succeeds.
    state = ev(
      state,
      {
        id: 'declare-v12',
        tick: 2,
        type: 'EVAL_DECLARE_MODEL',
        payload: {
          modelVersion: 'model-v1.2',
          violationRateByRisk: { SAFETY: 0.05, PRIVACY: 0.05 },
          redTeamOverrides: { 'rt-2': true },
        },
      },
      rng,
    );
    state = ev(state, { id: 'run-v12', tick: 3, type: 'EVAL_RUN', payload: { modelVersion: 'model-v1.2' } }, rng);

    const regressedRun = state.evalRuns[state.evalRunOrder[1] as string]!;
    expect(regressedRun.regressions.map((r) => r.attemptId)).toEqual(['rt-2']);
    expect(regressedRun.regressions[0]!.note).toContain('succeeds');

    // The regression is real: baseline false, current true.
    expect(baselineRun.redTeamResults['rt-2']?.elicited).toBe(false);
    expect(regressedRun.redTeamResults['rt-2']?.elicited).toBe(true);

    // The aggregate pass rate would have hidden it (regression impact
    // is 1/5 of red-team attempts).
    const passRateDelta =
      Object.values(regressedRun.redTeamResults).filter((r) => r.elicited).length -
      Object.values(baselineRun.redTeamResults).filter((r) => r.elicited).length;
    expect(passRateDelta).toBe(1); // small delta — precisely what EVAL-2 surfaces
    expect(state.stats.regressionsDetected).toBe(1);

    const checker = new LlmEvalInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('EVAL-2: checker catches a genuine flip that was silently absorbed', () => {
    const rng = new DeterministicRNG(4);
    let state = createDefaultLlmEvalCluster();
    state = ev(state, { id: 'run-v1', tick: 1, type: 'EVAL_RUN', payload: { modelVersion: 'model-v1.0' } }, rng);
    state = ev(
      state,
      {
        id: 'declare-v-bad',
        tick: 2,
        type: 'EVAL_DECLARE_MODEL',
        payload: { modelVersion: 'model-v1.3', redTeamOverrides: { 'rt-3': true } },
      },
      rng,
    );
    state = ev(state, { id: 'run-v13', tick: 3, type: 'EVAL_RUN', payload: { modelVersion: 'model-v1.3' } }, rng);

    // Tamper: strip the regression flag (the silent-absorption bug).
    const tampered = JSON.parse(JSON.stringify(state)) as LlmEvalClusterState;
    tampered.evalRuns[tampered.evalRunOrder[1] as string]!.regressions = [];

    const checker = new LlmEvalInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('EVAL-2');
    expect(violation?.description).toContain('silently absorbed');
  });

  it('EVAL-3: re-scoring a run under a stricter policy produces a distinct, version-pinned record', () => {
    const rng = new DeterministicRNG(5);
    let state = createDefaultLlmEvalCluster();
    state = ev(state, { id: 'run-v1', tick: 1, type: 'EVAL_RUN', payload: { modelVersion: 'model-v1.0' } }, rng);
    const runId = state.evalRunOrder[0] as string;
    const originalRun = JSON.parse(JSON.stringify(state.evalRuns[runId])) as LlmEvalClusterState['evalRuns'][string];

    // Declare a stricter policy (HIGH threshold) and re-score.
    state = ev(
      state,
      { id: 'policy-v2', tick: 2, type: 'EVAL_DECLARE_POLICY', payload: { severityThreshold: 'HIGH' } },
      rng,
    );
    state = ev(state, { id: 'rescore', tick: 3, type: 'EVAL_RESCORE', payload: { runId, policyVersion: 2 } }, rng);

    const rescore = state.rescoreRecords[`${runId}#2`]!;
    expect(rescore).toBeDefined();
    // Same violations, new verdicts: at least as strict.
    const failedBefore = Object.values(originalRun.caseResults).filter((r) => !r.passed).length;
    const failedAfter = Object.values(rescore.caseResults).filter((r) => !r.passed).length;
    expect(failedAfter).toBeGreaterThanOrEqual(failedBefore);

    // The original run's results are untouched (history immutable).
    expect(state.evalRuns[runId]!.caseResults).toEqual(originalRun.caseResults);
    expect(state.evalRuns[runId]!.policyVersion).toBe(1);
    expect(rescore.policyVersion).toBe(2);

    const checker = new LlmEvalInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('EVAL-3: checker catches a rescore record that rewrote the run history', () => {
    const rng = new DeterministicRNG(6);
    let state = createDefaultLlmEvalCluster();
    state = ev(state, { id: 'run-v1', tick: 1, type: 'EVAL_RUN', payload: { modelVersion: 'model-v1.0' } }, rng);
    const runId = state.evalRunOrder[0] as string;
    state = ev(
      state,
      { id: 'policy-v2', tick: 2, type: 'EVAL_DECLARE_POLICY', payload: { severityThreshold: 'HIGH' } },
      rng,
    );
    state = ev(state, { id: 'rescore', tick: 3, type: 'EVAL_RESCORE', payload: { runId, policyVersion: 2 } }, rng);

    // Tamper: the rescore flipped a recorded violation (rewriting history).
    const tampered = JSON.parse(JSON.stringify(state)) as LlmEvalClusterState;
    const record = tampered.rescoreRecords[`${runId}#2`]!;
    const someCase = Object.keys(record.caseResults)[0] as string;
    record.caseResults[someCase]!.violation = !record.caseResults[someCase]!.violation;

    const checker = new LlmEvalInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('EVAL-3');
    expect(violation?.description).toContain('never rewrite history');
  });

  it('EVAL-4: a critical-failing model version is blocked from promotion; a clean version is cleared', () => {
    const rng = new DeterministicRNG(7);
    let state = createDefaultLlmEvalCluster();

    // Declare a model with a CRITICAL safety violation on a suite case.
    state = ev(
      state,
      {
        id: 'declare-bad',
        tick: 1,
        type: 'EVAL_DECLARE_MODEL',
        payload: {
          modelVersion: 'model-v2.0-unsafe',
          caseOverrides: { 'case-safety-1': true }, // critical violation scripted
        },
      },
      rng,
    );
    state = ev(state, { id: 'run-bad', tick: 2, type: 'EVAL_RUN', payload: { modelVersion: 'model-v2.0-unsafe' } }, rng);
    state = ev(state, { id: 'gate-bad', tick: 3, type: 'EVAL_GATE', payload: { modelVersion: 'model-v2.0-unsafe' } }, rng);

    expect(state.gateOutputs['model-v2.0-unsafe']?.blocked).toBe(true);
    expect(state.gateOutputs['model-v2.0-unsafe']?.criticalPassed).toBe(false);

    // A clean version: v1.1 with all red-team blocked and no case
    // violations scripted.
    state = ev(
      state,
      {
        id: 'declare-clean',
        tick: 4,
        type: 'EVAL_DECLARE_MODEL',
        payload: {
          modelVersion: 'model-v2.0-clean',
          violationRateByRisk: {},
          caseOverrides: {},
          redTeamOverrides: {},
        },
      },
      rng,
    );
    state = ev(state, { id: 'run-clean', tick: 5, type: 'EVAL_RUN', payload: { modelVersion: 'model-v2.0-clean' } }, rng);
    state = ev(state, { id: 'gate-clean', tick: 6, type: 'EVAL_GATE', payload: { modelVersion: 'model-v2.0-clean' } }, rng);

    expect(state.gateOutputs['model-v2.0-clean']?.blocked).toBe(false);
    expect(state.gateOutputs['model-v2.0-clean']?.criticalPassed).toBe(true);

    const checker = new LlmEvalInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('EVAL-4: checker catches a gate that cleared a critical-failing version', () => {
    const rng = new DeterministicRNG(8);
    let state = createDefaultLlmEvalCluster();
    state = ev(
      state,
      {
        id: 'declare-bad',
        tick: 1,
        type: 'EVAL_DECLARE_MODEL',
        payload: { modelVersion: 'model-bad-gate', caseOverrides: { 'case-privacy-1': true } },
      },
      rng,
    );
    state = ev(state, { id: 'run-bad', tick: 2, type: 'EVAL_RUN', payload: { modelVersion: 'model-bad-gate' } }, rng);
    state = ev(state, { id: 'gate-bad', tick: 3, type: 'EVAL_GATE', payload: { modelVersion: 'model-bad-gate' } }, rng);
    expect(state.gateOutputs['model-bad-gate']?.blocked).toBe(true);

    // Tamper: a gate bug cleared the blocked flag.
    const tampered = JSON.parse(JSON.stringify(state)) as LlmEvalClusterState;
    tampered.gateOutputs['model-bad-gate']!.blocked = false;

    const checker = new LlmEvalInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('EVAL-4');
    expect(violation?.description).toContain('critical violations');
  });

  it('scripted responder is deterministic: identical (model, prompt) pairs decide identically', () => {
    const rng = new DeterministicRNG(9);
    let stateA = createDefaultLlmEvalCluster();
    let stateB = createDefaultLlmEvalCluster();
    stateA = ev(stateA, { id: 'r1', tick: 1, type: 'EVAL_RUN', payload: { modelVersion: 'model-v1.1' } }, rng);
    stateB = ev(stateB, { id: 'r1', tick: 1, type: 'EVAL_RUN', payload: { modelVersion: 'model-v1.1' } }, rng);
    expect(stateA.evalRuns['run-model-v1.1-1']!.caseResults).toEqual(
      stateB.evalRuns['run-model-v1.1-1']!.caseResults,
    );
  });

  it('golden determinism: identical event sequences with identical seeds produce identical state', () => {
    const runChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultLlmEvalCluster();
      state = ev(state, { id: 'r1', tick: 1, type: 'EVAL_RUN', payload: { modelVersion: 'model-v1.0' } }, rng);
      state = ev(
        state,
        { id: 'p2', tick: 2, type: 'EVAL_DECLARE_POLICY', payload: { severityThreshold: 'HIGH' } },
        rng,
      );
      state = ev(
        state,
        { id: 'rescore', tick: 3, type: 'EVAL_RESCORE', payload: { runId: 'run-model-v1.0-1', policyVersion: 2 } },
        rng,
      );
      state = ev(
        state,
        {
          id: 'v12',
          tick: 4,
          type: 'EVAL_DECLARE_MODEL',
          payload: { modelVersion: 'model-golden', redTeamOverrides: { 'rt-1': true } },
        },
        rng,
      );
      state = ev(state, { id: 'r2', tick: 5, type: 'EVAL_RUN', payload: { modelVersion: 'model-golden' } }, rng);
      state = ev(state, { id: 'gate', tick: 6, type: 'EVAL_GATE', payload: { modelVersion: 'model-golden' } }, rng);
      return JSON.stringify(state);
    };
    expect(runChaos()).toBe(runChaos());
  });
});
