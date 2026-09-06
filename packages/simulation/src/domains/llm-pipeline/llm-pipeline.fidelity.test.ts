import { describe, expect, it } from 'vitest';
import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { LlmPipelineInvariantChecker } from './llm-pipeline-invariants.js';
import {
  createDefaultLlmPipelineCluster,
  pureLlmPipelineTransition,
} from './llm-pipeline-state-transitions.js';

describe('LLM Pipeline Domain Fidelity & Invariant Suite', () => {
  const checker = new LlmPipelineInvariantChecker();

  it('verifies default cluster state passes all invariants including PIPE-8', () => {
    const state = createDefaultLlmPipelineCluster();
    const violation = checker.check(state);
    expect(violation).toBeUndefined();
  });

  // PIPE-8 Requirement 1: Response is fully traceable and passes
  it('[PIPE-8:passing] end-to-end ingest -> retrieve -> tool -> synthesize produces unbroken verified lineage', () => {
    const rng = new DeterministicRNG(1337);
    let state = createDefaultLlmPipelineCluster();

    // 1. Ingest new technical doc
    state = pureLlmPipelineTransition(
      state,
      {
        id: 'ingest-vllm',
        tick: 1,
        type: 'PIPE_INGEST_DOC',
        payload: {
          docId: 'doc-vllm-spec',
          title: 'PagedAttention Engine Specification',
          content:
            'PagedAttention partitions memory blocks to prevent memory fragmentation and enables dynamic KV cache allocation.',
        },
      },
      rng,
    ).nextState;

    // 2. Hybrid search & RRF
    state = pureLlmPipelineTransition(
      state,
      {
        id: 'search-1',
        tick: 2,
        type: 'PIPE_EXECUTE_HYBRID_SEARCH',
        payload: { queryId: 'q-vllm', queryText: 'PagedAttention memory fragmentation' },
      },
      rng,
    ).nextState;

    // 3. Agent Tool Call
    state = pureLlmPipelineTransition(
      state,
      {
        id: 'step-tool-vllm',
        tick: 3,
        type: 'PIPE_DISPATCH_AGENT_STEP',
        payload: {
          stepId: 'step-tool-vllm',
          taskId: 'task-vllm',
          type: 'TOOL_CALL',
          toolName: 'vector_search',
          toolArgs: { query: 'PagedAttention' },
          dependsOn: ['step-plan-1'],
        },
      },
      rng,
    ).nextState;

    // 4. Agent Observation
    state = pureLlmPipelineTransition(
      state,
      {
        id: 'step-obs-vllm',
        tick: 4,
        type: 'PIPE_DISPATCH_AGENT_STEP',
        payload: {
          stepId: 'step-obs-vllm',
          taskId: 'task-vllm',
          type: 'OBSERVATION',
          output: 'Found chunk-vllm-spec-1 with relevance score 0.96.',
          dependsOn: ['step-tool-vllm'],
        },
      },
      rng,
    ).nextState;

    // 5. Synthesize Response referencing chunk
    state = pureLlmPipelineTransition(
      state,
      {
        id: 'synth-vllm',
        tick: 5,
        type: 'PIPE_SYNTHESIZE_RESPONSE',
        payload: {
          queryId: 'q-vllm',
          answerText:
            'PagedAttention eliminates GPU memory fragmentation via virtual memory paging tables.',
          claims: [
            {
              claimId: 'claim-vllm-1',
              text: 'PagedAttention eliminates memory fragmentation',
              citationChunkId: 'chunk-doc-vllm-spec-1',
              observationStepId: 'step-obs-vllm',
            },
          ],
        },
      },
      rng,
    ).nextState;

    // Verify PIPE-8 passes
    const violation = checker.check(state);
    expect(violation).toBeUndefined();
    expect(state.metrics.provenanceIntegrityPct).toBe(100);
  });

  // PIPE-8 Requirement 2: Lineage-severing chaos scenario triggers and check correctly fails
  it('[PIPE-8:failing-chaos] detects severed lineage and triggers PIPE-8 violation', () => {
    const rng = new DeterministicRNG(1337);
    let state = createDefaultLlmPipelineCluster();

    // Trigger chaos: sever lineage on default response claim
    state = pureLlmPipelineTransition(
      state,
      {
        id: 'sever-1',
        tick: 1,
        type: 'PIPE_SEVER_LINEAGE',
        payload: {
          responseId: 'resp-init',
          claimId: 'claim-init-1',
        },
      },
      rng,
    ).nextState;

    // Assert PIPE-8 violation is detected
    const violation = checker.check(state);
    expect(violation).toBeDefined();
    expect(violation?.invariantName).toBe('PIPE-8');
    expect(violation?.description).toContain('Provenance lineage severed');
  });

  it('detects circular dependency in agent tool DAG (PIPE-2)', () => {
    const state = createDefaultLlmPipelineCluster();
    // Add cycle: step-A -> step-B -> step-A
    state.agentSteps['step-A'] = {
      stepId: 'step-A',
      taskId: 'task-loop',
      type: 'TOOL_CALL',
      toolName: 'search',
      toolArgs: {},
      dependsOn: ['step-B'],
      status: 'COMPLETED',
      executedTick: 1,
    };
    state.agentSteps['step-B'] = {
      stepId: 'step-B',
      taskId: 'task-loop',
      type: 'TOOL_CALL',
      toolName: 'search',
      toolArgs: {},
      dependsOn: ['step-A'],
      status: 'COMPLETED',
      executedTick: 2,
    };

    const violation = checker.check(state);
    expect(violation).toBeDefined();
    expect(violation?.invariantName).toBe('PIPE-2');
  });

  it('detects tool failure chaos and tracks error status', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultLlmPipelineCluster();

    state = pureLlmPipelineTransition(
      state,
      {
        id: 'fail-tool',
        tick: 1,
        type: 'PIPE_INJECT_TOOL_FAILURE',
        payload: { stepId: 'step-tool-1', reason: 'Upstream MCP timeout' },
      },
      rng,
    ).nextState;

    expect(state.agentSteps['step-tool-1']?.status).toBe('FAILED');
    expect(state.agentSteps['step-tool-1']?.output).toContain('Upstream MCP timeout');
    expect(state.chaos.toolFailuresInjected).toBe(1);
  });
});
