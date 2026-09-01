'use client';

import React from 'react';
import type { RaftClusterState, RaftNode } from '@the-visualizer/simulation';

interface RaftVisualizerProps {
  state: RaftClusterState;
  onProposeCommand: (command: string) => void;
  onCrashNode: (nodeId: string) => void;
  onRecoverNode: (nodeId: string) => void;
  onTogglePartition: (nodeId: string) => void;
}

export function RaftVisualizer({
  state,
  onProposeCommand,
  onCrashNode,
  onRecoverNode,
  onTogglePartition,
}: RaftVisualizerProps): React.JSX.Element {
  const [commandInput, setCommandInput] = React.useState('SET key_1 = "alpha"');

  const nodes = Object.values(state.nodes);

  const getRoleBadgeStyle = (role: RaftNode['role']): { bg: string; color: string; label: string } => {
    switch (role) {
      case 'LEADER':
        return { bg: 'rgba(234, 179, 8, 0.15)', color: '#fbbf24', label: '👑 LEADER' };
      case 'CANDIDATE':
        return { bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', label: '🗳️ CANDIDATE' };
      case 'FOLLOWER':
      default:
        return { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', label: '👥 FOLLOWER' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px' }}>
      {/* Top Banner & Command Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #1e293b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.25rem' }}>🛡️</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
              Raft Consensus Quorum (5-Node Replicated State Machine)
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Active Leader: <strong>{state.activeLeaderId ? `Node #${state.activeLeaderId}` : 'ELECTION IN PROGRESS'}</strong> · Highest Term: <strong>{state.highestTerm}</strong> · Isolated Nodes: <strong>{state.isolatedNodeIds.length > 0 ? state.isolatedNodeIds.join(', ') : 'None'}</strong>
            </span>
          </div>
        </div>

        {/* Client Propose Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (commandInput.trim()) onProposeCommand(commandInput.trim());
          }}
          style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
        >
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder="e.g. SET balance = 500"
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '4px',
              color: '#f8fafc',
              width: '200px',
            }}
          />
          <button
            type="submit"
            disabled={!state.activeLeaderId}
            className="btn btn--primary"
            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
          >
            ✍️ Propose Write
          </button>
        </form>
      </div>

      {/* Nodes Quorum Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {nodes.map((node) => {
          const roleBadge = getRoleBadgeStyle(node.role);
          const isIsolated = state.isolatedNodeIds.includes(node.id);
          const isCrashed = node.status === 'CRASHED';

          return (
            <div
              key={node.id}
              style={{
                backgroundColor: isCrashed
                  ? 'rgba(244, 63, 94, 0.05)'
                  : isIsolated
                    ? 'rgba(234, 179, 8, 0.05)'
                    : '#0f172a',
                border: isCrashed
                  ? '1px solid rgba(244, 63, 94, 0.4)'
                  : isIsolated
                    ? '1px dashed #eab308'
                    : node.role === 'LEADER'
                      ? '1px solid #eab308'
                      : '1px solid #1e293b',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: node.role === 'LEADER' ? '0 0 15px rgba(234, 179, 8, 0.1)' : 'none',
              }}
            >
              {/* Node Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: '#f8fafc' }}>
                    Node #{node.id}
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: roleBadge.bg,
                      color: roleBadge.color,
                    }}
                  >
                    {roleBadge.label}
                  </span>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Term: <strong>{node.currentTerm}</strong>
                </div>
              </div>

              {/* Status Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#cbd5e1' }}>
                <span>Voted For: <strong>{node.votedFor ? `#${node.votedFor}` : 'None'}</strong></span>
                <span>Commit Index: <strong style={{ color: '#4ade80' }}>{node.commitIndex}</strong></span>
              </div>

              {/* Election Countdown Gauge */}
              {node.role !== 'LEADER' && node.status === 'ALIVE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
                    <span>Election Countdown</span>
                    <span>{node.currentElectionCountdown} / {node.electionTimeoutTicks} ticks</span>
                  </div>
                  <div style={{ height: '4px', backgroundColor: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(0, (node.currentElectionCountdown / node.electionTimeoutTicks) * 100))}%`,
                        backgroundColor: node.currentElectionCountdown < 30 ? '#f43f5e' : '#38bdf8',
                        transition: 'width 0.2s linear',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Log Timeline Container */}
              <div style={{ flex: 1, minHeight: '80px', backgroundColor: '#020617', borderRadius: '6px', padding: '8px' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
                  REPLICATED LOG ({node.log.length} entries)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                  {node.log.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: '#475569', fontStyle: 'italic' }}>
                      (log is empty)
                    </span>
                  ) : (
                    node.log.map((entry) => {
                      const isCommitted = entry.index <= node.commitIndex;
                      return (
                        <div
                          key={entry.index}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.75rem',
                            padding: '3px 6px',
                            borderRadius: '4px',
                            backgroundColor: isCommitted ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                            borderLeft: isCommitted ? '3px solid #22c55e' : '3px solid #eab308',
                          }}
                        >
                          <span style={{ fontFamily: 'monospace', color: isCommitted ? '#4ade80' : '#fde047' }}>
                            [idx:{entry.index} t:{entry.term}] {entry.command}
                          </span>
                          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: isCommitted ? '#22c55e' : '#ca8a04' }}>
                            {isCommitted ? 'COMMITTED' : 'PENDING'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                {isCrashed ? (
                  <button
                    onClick={() => onRecoverNode(node.id)}
                    className="btn btn--emerald"
                    style={{ flex: 1, fontSize: '0.75rem', padding: '4px' }}
                  >
                    ⚡ Recover Node
                  </button>
                ) : (
                  <button
                    onClick={() => onCrashNode(node.id)}
                    className="btn btn--rose"
                    style={{ flex: 1, fontSize: '0.75rem', padding: '4px' }}
                  >
                    💥 Crash Node
                  </button>
                )}

                <button
                  onClick={() => onTogglePartition(node.id)}
                  className={isIsolated ? 'btn btn--indigo' : 'btn btn--secondary'}
                  style={{ flex: 1, fontSize: '0.75rem', padding: '4px' }}
                >
                  {isIsolated ? '🔗 Join Net' : '✂️ Isolate'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
