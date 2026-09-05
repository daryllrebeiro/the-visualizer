/**
 * Multi-Agent Orchestration & Model Context Protocol (MCP) Types & State Model
 *
 * References:
 * - Model Context Protocol (MCP Specification 2024-11-05)
 * - Yao et al. (2022): ReAct: Synergizing Reasoning and Acting in Language Models
 * - Wu et al. (2023): AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation
 */

export type AgentRole = 'ORCHESTRATOR' | 'RESEARCHER' | 'CODER' | 'AUDITOR' | 'CRITIC';

export type AgentStatus =
  | 'IDLE'
  | 'THINKING'
  | 'CALLING_TOOL'
  | 'EVALUATING'
  | 'TERMINATED'
  | 'BLOCKED';

export interface ScratchpadEntry {
  step: number;
  thought: string;
  action?: string | undefined;
  observation?: string | undefined;
}

export interface AgentNode {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  scratchpad: ScratchpadEntry[];
  memoryLimitTokens: number;
  usedMemoryTokens: number;
  parentAgentId?: string | undefined;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; required?: boolean | undefined }>;
  latencyTicks: number;
  requiresApproval?: boolean | undefined;
}

export interface MCPServer {
  id: string;
  name: string;
  uri: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  tools: Record<string, MCPToolDefinition>;
}

export interface MCPMessage {
  id: string;
  senderId: string;
  receiverId: string;
  jsonrpc: '2.0';
  method: 'tools/call' | 'tools/list' | 'tools/response' | 'error';
  params?: Record<string, unknown> | undefined;
  result?: Record<string, unknown> | undefined;
  error?: { code: number; message: string } | undefined;
  tick: number;
}

export interface AgentExecutionGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string; type: 'DELEGATE' | 'SUPERVISE' | 'FEEDBACK' }>;
  activeExecutiveId: string;
  recursionDepth: number;
  maxRecursionDepth: number;
}

export interface AgentBudgetTracker {
  totalTokensUsed: number;
  maxTokenBudget: number;
  turnCount: number;
  maxTurns: number;
}

export interface AgentsClusterState {
  clusterId: string;
  tick: number;
  agents: Record<string, AgentNode>;
  mcpServers: Record<string, MCPServer>;
  messageBus: MCPMessage[];
  executionGraph: AgentExecutionGraph;
  budgetTracker: AgentBudgetTracker;
  metrics: {
    activeConversations: number;
    toolCallSuccessRate: number;
    avgRecursionDepth: number;
  };
}

export type AgentsSimEvent =
  | { id: string; tick: number; type: 'AGENTS_TICK'; payload: Record<string, unknown> }
  | {
      id: string;
      tick: number;
      type: 'AGENTS_DISPATCH_TASK';
      payload: {
        taskId: string;
        prompt: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'AGENTS_STEP_REACT';
      payload: {
        agentId: string;
        thought: string;
        toolName?: string | undefined;
        toolParams?: Record<string, unknown> | undefined;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'AGENTS_MCP_TOOL_RESPONSE';
      payload: {
        messageId: string;
        result?: Record<string, unknown> | undefined;
        error?: { code: number; message: string } | undefined;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'AGENTS_DELEGATE_SUBAGENT';
      payload: {
        parentId: string;
        subagentId: string;
        role: AgentRole;
        prompt: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'AGENTS_INJECT_TOOL_FAILURE';
      payload: {
        serverId: string;
        toolName: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'AGENTS_HALLUCINATED_TOOL_ATTACK';
      payload: {
        agentId: string;
        toolName: string;
      };
    };
