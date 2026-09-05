import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { AgentsInvariantChecker } from './agents-invariants.js';
import { createDefaultAgentsCluster, pureAgentsTransition } from './agents-state-transitions.js';
import type { AgentsClusterState } from './agents-types.js';

describe('Domain 10: Multi-Agent MCP Orchestration Fidelity & Invariants', () => {
  const rng = new DeterministicRNG(101);
  const checker = new AgentsInvariantChecker();

  it('AGENT-1: detects infinite recursion loop exceeding max depth', () => {
    let state = createDefaultAgentsCluster();
    expect(checker.check(state)).toBeNull();

    // Delegate subagents up to max depth (5)
    for (let i = 2; i <= 5; i++) {
      state = pureAgentsTransition(
        state,
        {
          id: `del-${String(i)}`,
          tick: i,
          type: 'AGENTS_DELEGATE_SUBAGENT',
          payload: {
            parentId: `agent-worker-${String(i - 1)}`,
            subagentId: `agent-worker-${String(i)}`,
            role: 'CODER',
            prompt: `Recursive step ${String(i)}`,
          },
        },
        rng,
      ).nextState;
    }
    expect(state.executionGraph.recursionDepth).toBe(5);
    expect(checker.check(state)).toBeNull();

    // 6th delegation breaches maxRecursionDepth (5)
    state = pureAgentsTransition(
      state,
      {
        id: 'del-6',
        tick: 6,
        type: 'AGENTS_DELEGATE_SUBAGENT',
        payload: {
          parentId: 'agent-worker-5',
          subagentId: 'agent-worker-6',
          role: 'CODER',
          prompt: 'Unbounded loop recursion',
        },
      },
      rng,
    ).nextState;

    const violation = checker.check(state);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('AGENT-1');
  });

  it('AGENT-2: catches unregistered MCP tool calls and missing required parameters', () => {
    let state = createDefaultAgentsCluster();

    // 1. Valid registered tool call
    state = pureAgentsTransition(
      state,
      {
        id: 'react-1',
        tick: 1,
        type: 'AGENTS_STEP_REACT',
        payload: {
          agentId: 'agent-coder',
          thought: 'Need to inspect repository structure',
          toolName: 'read_file',
          toolParams: { path: '/src/index.ts' },
        },
      },
      rng,
    ).nextState;
    expect(checker.check(state)).toBeNull();

    // 2. Hallucinated / unregistered tool call
    const attackTransition = pureAgentsTransition(
      state,
      {
        id: 'attack-1',
        tick: 2,
        type: 'AGENTS_HALLUCINATED_TOOL_ATTACK',
        payload: {
          agentId: 'agent-coder',
          toolName: 'execute_arbitrary_shell_command',
        },
      },
      rng,
    );
    const attackViolation = checker.check(attackTransition.nextState);
    expect(attackViolation).not.toBeNull();
    expect(attackViolation?.ruleId).toBe('AGENT-2');
    expect(attackViolation?.isPedagogicalFlaw).toBe(true);

    // 3. Registered tool missing required parameters
    const missingParamState: AgentsClusterState = JSON.parse(
      JSON.stringify(state),
    ) as AgentsClusterState;
    missingParamState.messageBus.push({
      id: 'missing-param-msg',
      senderId: 'agent-coder',
      receiverId: 'mcp-gateway',
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        toolName: 'read_file',
        toolParams: {}, // 'path' is required
      },
      tick: 3,
    });
    const missingViolation = checker.check(missingParamState);
    expect(missingViolation).not.toBeNull();
    expect(missingViolation?.ruleId).toBe('AGENT-2');
  });

  it('AGENT-3: enforces agent scratchpad context memory ceiling', () => {
    const state = createDefaultAgentsCluster();
    const agent = state.agents['agent-coder'];
    expect(agent).toBeDefined();
    if (agent) {
      agent.usedMemoryTokens = 5000;
      agent.memoryLimitTokens = 4096;
    }
    const violation = checker.check(state);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('AGENT-3');
  });

  it('AGENT-4: detects split-brain executive contention', () => {
    const state = createDefaultAgentsCluster();
    state.agents['second-orchestrator'] = {
      id: 'second-orchestrator',
      name: 'Rogue Orchestrator',
      role: 'ORCHESTRATOR',
      status: 'THINKING',
      scratchpad: [],
      memoryLimitTokens: 8192,
      usedMemoryTokens: 100,
    };
    state.agents['agent-orchestrator']!.status = 'THINKING';

    const violation = checker.check(state);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('AGENT-4');
  });
});
