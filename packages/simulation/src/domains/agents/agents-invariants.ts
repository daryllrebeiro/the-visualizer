/**
 * Multi-Agent Orchestration & MCP Invariant Checker
 *
 * Invariants:
 * - AGENT-1: Acyclic Workflow Termination (recursion depth <= maxRecursionDepth; no runaway loops)
 * - AGENT-2: MCP Schema Conformance (tool calls must match registered tool parameters)
 * - AGENT-3: Strict Context Budget Bounds (agent scratchpad token usage <= memory limit)
 * - AGENT-4: Single Active Executive (exactly one orchestrator agent active at a step)
 */

import type { AgentsClusterState } from './agents-types.js';

export interface AgentInvariantViolation {
  ruleId: 'AGENT-1' | 'AGENT-2' | 'AGENT-3' | 'AGENT-4';
  invariantName: string;
  description: string;
  isPedagogicalFlaw?: boolean | undefined;
}

export class AgentsInvariantChecker {
  public check(state: AgentsClusterState): AgentInvariantViolation | null {
    // 1. AGENT-1: Acyclic Workflow Termination
    if (state.executionGraph.recursionDepth > state.executionGraph.maxRecursionDepth) {
      return {
        ruleId: 'AGENT-1',
        invariantName: 'Acyclic Workflow Termination',
        description: `Agent delegation recursion depth (${state.executionGraph.recursionDepth}) exceeds safe limit (${state.executionGraph.maxRecursionDepth}). Infinite delegation loop detected.`,
      };
    }

    // 2. AGENT-2: MCP Schema Conformance
    // Inspect unhandled messages on the message bus
    for (const msg of state.messageBus) {
      if (msg.method === 'tools/call') {
        const toolName = String(msg.params?.['toolName'] ?? '');
        let toolFound = false;
        let declaringServer = '';

        for (const [srvId, server] of Object.entries(state.mcpServers)) {
          if (server.tools[toolName]) {
            toolFound = true;
            declaringServer = srvId;
            break;
          }
        }

        if (!toolFound) {
          return {
            ruleId: 'AGENT-2',
            invariantName: 'MCP Schema Conformance',
            description: `Agent "${msg.senderId}" attempted to call unregistered MCP tool "${toolName}".`,
            isPedagogicalFlaw: true,
          };
        }

        // Verify required params
        const toolDef = state.mcpServers[declaringServer]?.tools[toolName];
        if (toolDef) {
          const providedParams = (msg.params?.['toolParams'] as Record<string, unknown>) ?? {};
          for (const [pName, pMeta] of Object.entries(toolDef.parameters)) {
            if (pMeta.required && providedParams[pName] === undefined) {
              return {
                ruleId: 'AGENT-2',
                invariantName: 'MCP Schema Conformance',
                description: `Tool call "${toolName}" missing required parameter "${pName}".`,
                isPedagogicalFlaw: true,
              };
            }
          }
        }
      }
    }

    // 3. AGENT-3: Strict Context Budget Bounds
    for (const [agentId, agent] of Object.entries(state.agents)) {
      if (agent.usedMemoryTokens > agent.memoryLimitTokens) {
        return {
          ruleId: 'AGENT-3',
          invariantName: 'Strict Context Budget Bounds',
          description: `Agent "${agentId}" context memory (${agent.usedMemoryTokens} tokens) exceeded limit (${agent.memoryLimitTokens} tokens).`,
        };
      }
    }

    // 4. AGENT-4: Single Active Executive
    const activeOrchestrators = Object.values(state.agents).filter(
      (a) => a.role === 'ORCHESTRATOR' && (a.status === 'THINKING' || a.status === 'CALLING_TOOL'),
    );
    if (activeOrchestrators.length > 1) {
      return {
        ruleId: 'AGENT-4',
        invariantName: 'Single Active Executive',
        description: `Split-brain orchestration: ${String(activeOrchestrators.length)} orchestrators simultaneously hold active executive task lock.`,
      };
    }

    return null;
  }
}
