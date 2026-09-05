/**
 * Multi-Agent Orchestration & MCP State Transitions Reducer
 */

import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type {
  AgentNode,
  AgentsClusterState,
  AgentsSimEvent,
  MCPMessage,
  MCPServer,
} from './agents-types.js';

export function createDefaultAgentsCluster(clusterId = 'agents-1'): AgentsClusterState {
  const orchestrator: AgentNode = {
    id: 'agent-orchestrator',
    name: 'Lead Orchestrator',
    role: 'ORCHESTRATOR',
    status: 'IDLE',
    scratchpad: [
      {
        step: 1,
        thought: 'Cluster initialized. Ready to accept complex engineering tasks.',
      },
    ],
    memoryLimitTokens: 8192,
    usedMemoryTokens: 256,
  };

  const researcher: AgentNode = {
    id: 'agent-researcher',
    name: 'Architecture Researcher',
    role: 'RESEARCHER',
    status: 'IDLE',
    scratchpad: [],
    memoryLimitTokens: 4096,
    usedMemoryTokens: 128,
    parentAgentId: 'agent-orchestrator',
  };

  const coder: AgentNode = {
    id: 'agent-coder',
    name: 'Core Systems Coder',
    role: 'CODER',
    status: 'IDLE',
    scratchpad: [],
    memoryLimitTokens: 4096,
    usedMemoryTokens: 128,
    parentAgentId: 'agent-orchestrator',
  };

  const mcpFs: MCPServer = {
    id: 'mcp-fs',
    name: 'Filesystem MCP Gateway',
    uri: 'mcp://localhost:4001',
    status: 'CONNECTED',
    tools: {
      read_file: {
        name: 'read_file',
        description: 'Read file contents from repository workspace',
        parameters: { path: { type: 'string', required: true } },
        latencyTicks: 2,
      },
      write_file: {
        name: 'write_file',
        description: 'Write code artifact to repository workspace',
        parameters: {
          path: { type: 'string', required: true },
          content: { type: 'string', required: true },
        },
        latencyTicks: 3,
        requiresApproval: true,
      },
    },
  };

  const mcpDb: MCPServer = {
    id: 'mcp-db',
    name: 'PostgreSQL MCP Gateway',
    uri: 'mcp://localhost:4002',
    status: 'CONNECTED',
    tools: {
      execute_query: {
        name: 'execute_query',
        description: 'Run read-only SQL query against database',
        parameters: { sql: { type: 'string', required: true } },
        latencyTicks: 4,
      },
    },
  };

  return {
    clusterId,
    tick: 0,
    agents: {
      'agent-orchestrator': orchestrator,
      'agent-researcher': researcher,
      'agent-coder': coder,
    },
    mcpServers: {
      'mcp-fs': mcpFs,
      'mcp-db': mcpDb,
    },
    messageBus: [],
    executionGraph: {
      nodes: ['agent-orchestrator', 'agent-researcher', 'agent-coder'],
      edges: [
        { from: 'agent-orchestrator', to: 'agent-researcher', type: 'DELEGATE' },
        { from: 'agent-orchestrator', to: 'agent-coder', type: 'DELEGATE' },
      ],
      activeExecutiveId: 'agent-orchestrator',
      recursionDepth: 1,
      maxRecursionDepth: 5,
    },
    budgetTracker: {
      totalTokensUsed: 512,
      maxTokenBudget: 50000,
      turnCount: 0,
      maxTurns: 30,
    },
    metrics: {
      activeConversations: 1,
      toolCallSuccessRate: 1.0,
      avgRecursionDepth: 1.0,
    },
  };
}

export function pureAgentsTransition(
  state: AgentsClusterState,
  event: AgentsSimEvent,
  rng: DeterministicRNG,
): { nextState: AgentsClusterState; emittedEvents: AgentsSimEvent[] } {
  const nextState: AgentsClusterState = JSON.parse(JSON.stringify(state)) as AgentsClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'TICK' as any:
    case 'AGENTS_TICK': {
      // Advance in-flight MCP message responses
      const remainingMessages: MCPMessage[] = [];
      for (const msg of nextState.messageBus) {
        if (msg.method === 'tools/call' && nextState.tick >= msg.tick + 2) {
          // Deliver simulated tool response
          const caller = nextState.agents[msg.senderId];
          const toolName = String(msg.params?.['toolName'] ?? '');
          if (caller) {
            caller.status = 'EVALUATING';
            const lastStep = caller.scratchpad[caller.scratchpad.length - 1];
            if (lastStep) {
              lastStep.observation = `Tool [${toolName}] returned 200 OK: { status: "success", rowsMatched: 1 }`;
            }
          }
        } else {
          remainingMessages.push(msg);
        }
      }
      nextState.messageBus = remainingMessages;
      break;
    }

    case 'AGENTS_DISPATCH_TASK': {
      const { taskId, prompt } = event.payload;
      const orchestrator = nextState.agents['agent-orchestrator'];
      if (orchestrator) {
        orchestrator.status = 'THINKING';
        orchestrator.scratchpad.push({
          step: orchestrator.scratchpad.length + 1,
          thought: `Received task "${taskId}": "${prompt}". Decomposing into researcher and coder subtasks.`,
        });
        orchestrator.usedMemoryTokens += 150;
      }
      nextState.budgetTracker.turnCount++;
      nextState.budgetTracker.totalTokensUsed += 150;
      break;
    }

    case 'AGENTS_STEP_REACT': {
      const { agentId, thought, toolName, toolParams } = event.payload;
      const agent = nextState.agents[agentId];
      if (agent) {
        const stepNum = agent.scratchpad.length + 1;
        const entry = {
          step: stepNum,
          thought,
          action: toolName ? `call_mcp_tool(${toolName}, ${JSON.stringify(toolParams)})` : undefined,
        };
        agent.scratchpad.push(entry);
        agent.usedMemoryTokens += 80;
        nextState.budgetTracker.totalTokensUsed += 80;

        if (toolName) {
          agent.status = 'CALLING_TOOL';
          const msgId = `mcp-msg-${String(nextState.tick)}-${String(Math.floor(rng.nextFloat() * 1000))}`;
          nextState.messageBus.push({
            id: msgId,
            senderId: agentId,
            receiverId: 'mcp-gateway',
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              toolName,
              toolParams,
            },
            tick: nextState.tick,
          });
        } else {
          agent.status = 'THINKING';
        }
      }
      break;
    }

    case 'AGENTS_MCP_TOOL_RESPONSE': {
      const { messageId, result, error } = event.payload;
      const msgIndex = nextState.messageBus.findIndex((m) => m.id === messageId);
      if (msgIndex !== -1) {
        const msg = nextState.messageBus[msgIndex];
        if (msg) {
          const caller = nextState.agents[msg.senderId];
          if (caller) {
            caller.status = 'EVALUATING';
            const lastEntry = caller.scratchpad[caller.scratchpad.length - 1];
            if (lastEntry) {
              lastEntry.observation = error
                ? `Error (${String(error.code)}): ${error.message}`
                : `Result: ${JSON.stringify(result ?? {})}`;
            }
          }
        }
        nextState.messageBus.splice(msgIndex, 1);
      }
      break;
    }

    case 'AGENTS_DELEGATE_SUBAGENT': {
      const { parentId, subagentId, role, prompt } = event.payload;
      nextState.agents[subagentId] = {
        id: subagentId,
        name: `${role} Worker ${subagentId.slice(-4)}`,
        role,
        status: 'THINKING',
        scratchpad: [
          {
            step: 1,
            thought: `Delegated from ${parentId}: "${prompt}". Formulating execution plan.`,
          },
        ],
        memoryLimitTokens: 4096,
        usedMemoryTokens: 120,
        parentAgentId: parentId,
      };

      nextState.executionGraph.nodes.push(subagentId);
      nextState.executionGraph.edges.push({
        from: parentId,
        to: subagentId,
        type: 'DELEGATE',
      });
      nextState.executionGraph.recursionDepth++;
      break;
    }

    case 'AGENTS_INJECT_TOOL_FAILURE': {
      const { serverId, toolName } = event.payload;
      const server = nextState.mcpServers[serverId];
      if (server && server.tools[toolName]) {
        server.status = 'ERROR';
      }
      break;
    }

    case 'AGENTS_HALLUCINATED_TOOL_ATTACK': {
      const { agentId, toolName } = event.payload;
      const agent = nextState.agents[agentId];
      if (agent) {
        agent.status = 'CALLING_TOOL';
        nextState.messageBus.push({
          id: `attack-${String(nextState.tick)}`,
          senderId: agentId,
          receiverId: 'mcp-gateway',
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            toolName,
            toolParams: {},
          },
          tick: nextState.tick,
        });
      }
      break;
    }
  }

  (nextState as any).rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
