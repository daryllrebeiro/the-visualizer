import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { LLMServingInvariantChecker } from './llm-serving-invariants.js';
import {
  createDefaultLLMServingCluster,
  pureLLMServingTransition,
} from './llm-serving-state-transitions.js';
import type { LLMServingClusterState } from './llm-serving-types.js';

describe('Domain 11: LLM Inference Serving & PagedAttention Fidelity', () => {
  const rng = new DeterministicRNG(202);
  const checker = new LLMServingInvariantChecker();

  it('LLM-1 & LLM-2: manages physical KV block lifecycle with zero collision and no leak', () => {
    let state = createDefaultLLMServingCluster();
    expect(checker.check(state)).toBeNull();

    // Initial state has 32 blocks free
    expect(state.kvBlockPool.freeBlockIndices.length).toBe(32);

    // Step 1: req-1 (48 tokens = 3 blocks) and req-2 (32 tokens = 2 blocks) admitted to PREFILL
    state = pureLLMServingTransition(
      state,
      { id: 'step-1', tick: 1, type: 'LLM_STEP_BATCH' },
      rng,
    ).nextState;

    expect(state.requests['req-1']?.state).toBe('PREFILL');
    expect(state.requests['req-2']?.state).toBe('PREFILL');
    expect(state.blockTable['req-1']?.length).toBe(3);
    expect(state.blockTable['req-2']?.length).toBe(2);
    expect(state.kvBlockPool.freeBlockIndices.length).toBe(32 - 5);
    expect(checker.check(state)).toBeNull();

    // Step 2: Transition from PREFILL to DECODE
    state = pureLLMServingTransition(
      state,
      { id: 'step-2', tick: 2, type: 'LLM_STEP_BATCH' },
      rng,
    ).nextState;

    expect(state.requests['req-1']?.state).toBe('DECODE');
    expect(state.requests['req-2']?.state).toBe('DECODE');
    expect(checker.check(state)).toBeNull();

    // Verify collision detector: simulate illegal sharing
    const collidedState: LLMServingClusterState = JSON.parse(
      JSON.stringify(state),
    ) as LLMServingClusterState;
    collidedState.blockTable['req-2'] = [collidedState.blockTable['req-1']![0]!]; // Illegal block reuse without CoW
    const violation = checker.check(collidedState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('LLM-1');
  });

  it('LLM-2: enforces memory ceiling and detects block accounting leaks', () => {
    const state = createDefaultLLMServingCluster();

    // Simulate leaked block from free pool
    const leakState: LLMServingClusterState = JSON.parse(
      JSON.stringify(state),
    ) as LLMServingClusterState;
    leakState.kvBlockPool.freeBlockIndices.pop(); // Leaked index without allocation
    const violation = checker.check(leakState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('LLM-2');
  });

  it('LLM-3 & LLM-4: validates monotonic forwarding and speculative decoding bounds', () => {
    let state = createDefaultLLMServingCluster();

    // Test LLM-4: cannot have generated tokens while in WAITING
    const prematureState: LLMServingClusterState = JSON.parse(
      JSON.stringify(state),
    ) as LLMServingClusterState;
    prematureState.requests['req-1']!.generatedTokens = 5;
    prematureState.requests['req-1']!.state = 'WAITING';
    let violation = checker.check(prematureState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('LLM-4');

    // Run until requests finish and confirm memory is fully recovered
    for (let t = 1; t <= 40; t++) {
      state = pureLLMServingTransition(
        state,
        { id: `step-${String(t)}`, tick: t, type: 'LLM_STEP_BATCH' },
        rng,
      ).nextState;
      expect(checker.check(state)).toBeNull();
    }

    expect(state.requests['req-1']?.state).toBe('FINISHED');
    expect(state.requests['req-2']?.state).toBe('FINISHED');
    // All 32 blocks must be freed back to the pool
    expect(state.kvBlockPool.freeBlockIndices.length).toBe(32);
    expect(state.metrics.totalCompleted).toBe(2);
  });

  it('SERVE-3: ensures byte-identical output token sequence upon checkpoint-then-resume post preemption', () => {
    // 1. Control Run: Single request runs to completion without any preemption
    const rngControl = new DeterministicRNG(42);
    let controlState = createDefaultLLMServingCluster();
    // Clear default requests and submit single deterministic request
    controlState.requests = {};
    controlState.batchScheduler.runningRequestIds = [];
    controlState.batchScheduler.preemptedRequestIds = [];

    controlState = pureLLMServingTransition(
      controlState,
      {
        id: 'sub-control',
        tick: 1,
        type: 'LLM_SUBMIT_REQUEST',
        payload: { requestId: 'req-target', promptTokens: 32, maxGeneratedTokens: 12 },
      },
      rngControl,
    ).nextState;

    for (let t = 2; t <= 20; t++) {
      controlState = pureLLMServingTransition(
        controlState,
        { id: `ctrl-step-${String(t)}`, tick: t, type: 'LLM_STEP_BATCH' },
        rngControl,
      ).nextState;
      if (controlState.requests['req-target']?.state === 'FINISHED') break;
    }

    expect(controlState.requests['req-target']?.state).toBe('FINISHED');
    const controlTokens = (controlState.requests['req-target'] as any).outputTokens;
    expect(controlTokens).toBeDefined();
    expect(controlTokens.length).toBe(12);

    // 2. Preempted Run: Identical request, preempted partway through, then resumed to completion
    const rngTest = new DeterministicRNG(42);
    let testState = createDefaultLLMServingCluster();
    testState.requests = {};
    testState.batchScheduler.runningRequestIds = [];
    testState.batchScheduler.preemptedRequestIds = [];

    testState = pureLLMServingTransition(
      testState,
      {
        id: 'sub-test',
        tick: 1,
        type: 'LLM_SUBMIT_REQUEST',
        payload: { requestId: 'req-target', promptTokens: 32, maxGeneratedTokens: 12 },
      },
      rngTest,
    ).nextState;

    // Run 4 ticks: prefill then generate 2 tokens
    for (let t = 2; t <= 5; t++) {
      testState = pureLLMServingTransition(
        testState,
        { id: `test-step-${String(t)}`, tick: t, type: 'LLM_STEP_BATCH' },
        rngTest,
      ).nextState;
    }

    expect(testState.requests['req-target']?.state).toBe('DECODE');
    expect(testState.requests['req-target']?.generatedTokens).toBeGreaterThan(0);

    // Force preemption of req-target
    testState = pureLLMServingTransition(
      testState,
      {
        id: 'preempt-req',
        tick: 6,
        type: 'LLM_PREEMPT_REQUEST',
        payload: { requestId: 'req-target' },
      },
      rngTest,
    ).nextState;

    expect(testState.requests['req-target']?.state).toBe('PREEMPTED');

    // Run steps to let batch scheduler resume the preempted request and finish
    for (let t = 7; t <= 30; t++) {
      testState = pureLLMServingTransition(
        testState,
        { id: `test-resume-${String(t)}`, tick: t, type: 'LLM_STEP_BATCH' },
        rngTest,
      ).nextState;
      if (testState.requests['req-target']?.state === 'FINISHED') break;
    }

    expect(testState.requests['req-target']?.state).toBe('FINISHED');
    const resumedTokens = (testState.requests['req-target'] as any).outputTokens;
    expect(resumedTokens).toBeDefined();
    expect(resumedTokens.length).toBe(12);

    // Byte-identical token sequence verification
    expect(resumedTokens).toEqual(controlTokens);
  });

  it('SERVE-3b: detects token sequence divergence if checkpoint loses prior token context (mutation proof)', () => {
    // 1. Control Run
    const rngControl = new DeterministicRNG(42);
    let controlState = createDefaultLLMServingCluster();
    controlState.requests = {};
    controlState.batchScheduler.runningRequestIds = [];
    controlState.batchScheduler.preemptedRequestIds = [];

    controlState = pureLLMServingTransition(
      controlState,
      {
        id: 'sub-control',
        tick: 1,
        type: 'LLM_SUBMIT_REQUEST',
        payload: { requestId: 'req-target', promptTokens: 32, maxGeneratedTokens: 12 },
      },
      rngControl,
    ).nextState;

    for (let t = 2; t <= 20; t++) {
      controlState = pureLLMServingTransition(
        controlState,
        { id: `ctrl-step-${String(t)}`, tick: t, type: 'LLM_STEP_BATCH' },
        rngControl,
      ).nextState;
      if (controlState.requests['req-target']?.state === 'FINISHED') break;
    }
    const controlTokens = (controlState.requests['req-target'] as any).outputTokens;

    // 2. Broken checkpoint run: position is preserved but prior tokens in KV cache are lost
    const rngTest = new DeterministicRNG(42);
    let testState = createDefaultLLMServingCluster();
    testState.requests = {};
    testState.batchScheduler.runningRequestIds = [];
    testState.batchScheduler.preemptedRequestIds = [];

    testState = pureLLMServingTransition(
      testState,
      {
        id: 'sub-test',
        tick: 1,
        type: 'LLM_SUBMIT_REQUEST',
        payload: { requestId: 'req-target', promptTokens: 32, maxGeneratedTokens: 12 },
      },
      rngTest,
    ).nextState;

    for (let t = 2; t <= 5; t++) {
      testState = pureLLMServingTransition(
        testState,
        { id: `test-step-${String(t)}`, tick: t, type: 'LLM_STEP_BATCH' },
        rngTest,
      ).nextState;
    }

    // Force preemption
    testState = pureLLMServingTransition(
      testState,
      {
        id: 'preempt-req',
        tick: 6,
        type: 'LLM_PREEMPT_REQUEST',
        payload: { requestId: 'req-target' },
      },
      rngTest,
    ).nextState;

    // Deliberately simulate broken checkpoint that lost prior token cache
    const targetReq = testState.requests['req-target'];
    expect(targetReq?.checkpoint).toBeDefined();
    if (targetReq?.checkpoint) {
      targetReq.checkpoint.tokens = []; // Cleared tokens / lost context
    }

    // Resume from broken checkpoint
    for (let t = 7; t <= 30; t++) {
      testState = pureLLMServingTransition(
        testState,
        { id: `test-resume-${String(t)}`, tick: t, type: 'LLM_STEP_BATCH' },
        rngTest,
      ).nextState;
      if (testState.requests['req-target']?.state === 'FINISHED') break;
    }

    const brokenResumedTokens = (testState.requests['req-target'] as any).outputTokens;
    expect(brokenResumedTokens).toBeDefined();
    // Divergence confirmed: broken checkpoint fails to reproduce identical token sequence
    expect(brokenResumedTokens).not.toEqual(controlTokens);
  });
});

