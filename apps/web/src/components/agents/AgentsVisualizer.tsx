'use client';

import React, { useState } from 'react';

import type { AgentRole, AgentsClusterState } from '@the-visualizer/simulation';

export interface AgentsVisualizerProps {
  state: AgentsClusterState;
  onDispatchTask?: (taskId: string, prompt: string) => void;
  onStepReact?: (agentId: string, thought: string, toolName?: string, toolParams?: Record<string, unknown>) => void;
  onDelegateSubagent?: (parentId: string, subagentId: string, role: AgentRole, prompt: string) => void;
  onInjectToolFailure?: (serverId: string, toolName: string) => void;
  onHallucinatedToolAttack?: (agentId: string, toolName: string) => void;
}

export function AgentsVisualizer({
  state,
  onDispatchTask,
  onStepReact,
  onDelegateSubagent,
  onInjectToolFailure,
  onHallucinatedToolAttack,
}: AgentsVisualizerProps): React.JSX.Element {
  const [selectedAgentId, setSelectedAgentId] = useState<string>('agent-orchestrator');
  const [taskPrompt, setTaskPrompt] = useState('Implement and verify PagedAttention memory safety invariants');

  const selectedAgent = state.agents[selectedAgentId] || Object.values(state.agents)[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px', color: '#f8fafc' }}>
      {/* Top Banner & MCP Metrics */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          padding: '12px 18px',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>🤖</span>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              Multi-Agent Orchestration & Model Context Protocol (MCP)
            </h2>
            <span style={{ backgroundColor: '#4c1d95', color: '#c4b5fd', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px' }}>
              MCP 2024-11-05 / ReAct
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
            Cluster: <code>{state.clusterId}</code> · Tick: <strong>{state.tick}</strong> · Active Swarm: {Object.keys(state.agents).length} Agents · Recursion Depth: {state.executionGraph.recursionDepth} / {state.executionGraph.maxRecursionDepth}
          </div>
        </div>

        {/* Token Budget Gauge */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Tokens Consumed</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38bdf8' }}>
              {state.budgetTracker.totalTokensUsed.toLocaleString()} / {state.budgetTracker.maxTokenBudget.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Tool Success Rate</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: state.metrics.toolCallSuccessRate >= 0.9 ? '#10b981' : '#f59e0b' }}>
              {(state.metrics.toolCallSuccessRate * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      {/* Task Dispatch Bar */}
      <div style={{ display: 'flex', gap: '8px', backgroundColor: '#020617', padding: '10px 14px', borderRadius: '8px', border: '1px solid #1e293b' }}>
        <input
          type="text"
          value={taskPrompt}
          onChange={(e) => setTaskPrompt(e.target.value)}
          placeholder="Dispatch prompt to agent swarm..."
          style={{
            flex: 1,
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            color: '#f8fafc',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.85rem',
          }}
        />
        <button
          onClick={() => onDispatchTask?.(`task-${Date.now()}`, taskPrompt)}
          style={{
            backgroundColor: '#8b5cf6',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🚀 Dispatch Task
        </button>
        <button
          onClick={() => onDelegateSubagent?.('agent-orchestrator', `worker-${Date.now().toString().slice(-4)}`, 'CODER', 'Implement unit tests')}
          style={{
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          ➕ Delegate Subagent
        </button>
        <button
          onClick={() => onInjectToolFailure?.('mcp-fs', 'read_file')}
          style={{
            backgroundColor: '#7c2d12',
            color: '#fdba74',
            border: '1px solid #c2410c',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          💥 Inject MCP 500
        </button>
        <button
          onClick={() => onHallucinatedToolAttack?.('agent-coder', 'unregistered_exploit_tool')}
          style={{
            backgroundColor: '#831843',
            color: '#fbcfe8',
            border: '1px solid #be185d',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          ⚠️ Attack Schema
        </button>
      </div>

      {/* Main Agent Swarm & Scratchpad Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Left: Agent Mesh & Registered MCP Servers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          {/* Swarm Nodes */}
          <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c084fc', marginBottom: '8px' }}>
              👥 Active Swarm Agents ({Object.keys(state.agents).length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
              {Object.values(state.agents).map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  style={{
                    backgroundColor: selectedAgentId === agent.id ? '#1e1b4b' : '#0f172a',
                    border: selectedAgentId === agent.id ? '1px solid #8b5cf6' : '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.8rem', color: '#f8fafc' }}>{agent.name}</strong>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor: agent.status === 'THINKING' ? '#1e3a8a' : agent.status === 'CALLING_TOOL' ? '#78350f' : '#064e3b',
                        color: agent.status === 'THINKING' ? '#93c5fd' : agent.status === 'CALLING_TOOL' ? '#fde047' : '#6ee7b7',
                      }}
                    >
                      {agent.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
                    Role: <span style={{ color: '#a78bfa' }}>{agent.role}</span>
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                    Memory: {agent.usedMemoryTokens} / {agent.memoryLimitTokens} tok
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Registered MCP Servers */}
          <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginBottom: '8px' }}>
              🔌 Model Context Protocol (MCP) Gateways
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
              {Object.values(state.mcpServers).map((server) => (
                <div
                  key={server.id}
                  style={{
                    backgroundColor: '#0f172a',
                    border: server.status === 'CONNECTED' ? '1px solid #1e293b' : '1px solid #ef4444',
                    borderRadius: '6px',
                    padding: '8px 10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.75rem', color: '#38bdf8' }}>{server.name}</strong>
                    <span style={{ fontSize: '0.65rem', color: server.status === 'CONNECTED' ? '#10b981' : '#ef4444' }}>
                      ● {server.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}><code>{server.uri}</code></div>
                  <div style={{ marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {Object.keys(server.tools).map((t) => (
                      <span key={t} style={{ backgroundColor: '#1e293b', color: '#94a3b8', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '3px' }}>
                        {t}()
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* JSON-RPC Message Bus */}
          <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', marginBottom: '6px' }}>
              📡 Live MCP JSON-RPC 2.0 Message Bus ({state.messageBus.length} in-flight)
            </div>
            {state.messageBus.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: '#475569' }}>No messages currently in flight.</div>
            ) : (
              state.messageBus.map((msg: any) => (
                <div
                  key={msg.id}
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #3b82f6',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    fontSize: '0.7rem',
                    marginBottom: '4px',
                  }}
                >
                  <span style={{ color: '#60a5fa' }}>{msg.senderId}</span> → <span style={{ color: '#f472b6' }}>{msg.receiverId}</span> · Method: <code>{msg.method}</code>
                  {msg.params && <div style={{ color: '#94a3b8', marginTop: '2px' }}>{JSON.stringify(msg.params)}</div>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Agent Scratchpad & Inner Monologue */}
        <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
              🧠 ReAct Scratchpad: <span style={{ color: '#c084fc' }}>{selectedAgent?.name}</span>
            </div>
            <button
              onClick={() => onStepReact?.(selectedAgentId, 'Analyzing task constraints and preparing tool invocation.', 'read_file', { path: '/src/config.ts' })}
              style={{
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              ▶ Step ReAct
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
            {selectedAgent?.scratchpad.map((step: any) => (
              <div
                key={step.step}
                style={{
                  backgroundColor: '#020617',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ color: '#60a5fa', fontWeight: 700, marginBottom: '2px' }}>
                  Step {step.step}: Thought
                </div>
                <div style={{ color: '#cbd5e1', lineHeight: 1.4, marginBottom: '6px' }}>
                  {step.thought}
                </div>

                {step.action && (
                  <div style={{ backgroundColor: '#0f172a', padding: '6px 8px', borderRadius: '4px', borderLeft: '3px solid #8b5cf6', marginBottom: '6px' }}>
                    <div style={{ color: '#a78bfa', fontWeight: 700 }}>Action:</div>
                    <code style={{ color: '#f8fafc' }}>{step.action}</code>
                  </div>
                )}

                {step.observation && (
                  <div style={{ backgroundColor: '#0f172a', padding: '6px 8px', borderRadius: '4px', borderLeft: '3px solid #10b981' }}>
                    <div style={{ color: '#34d399', fontWeight: 700 }}>Observation:</div>
                    <div style={{ color: '#94a3b8' }}>{step.observation}</div>
                  </div>
                )}
              </div>
            )) || <div style={{ fontSize: '0.75rem', color: '#475569' }}>No scratchpad steps recorded yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
