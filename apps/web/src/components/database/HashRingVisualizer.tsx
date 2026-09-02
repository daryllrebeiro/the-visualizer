'use client';

import React, { useState } from 'react';
import type { ConsistencyLevel, DBClusterState } from '@the-visualizer/simulation';
import { ConsistentHashRing, hashToToken } from '@the-visualizer/simulation';

interface HashRingVisualizerProps {
  state: DBClusterState;
  onWriteKey: (key: string, value: string, consistency: ConsistencyLevel) => void;
  onReadKey: (key: string, consistency: ConsistencyLevel) => void;
  onAddNode: () => void;
  onCrashNode: (nodeId: string) => void;
  onRecoverNode: (nodeId: string) => void;
  onUpdateConsistency: (read: ConsistencyLevel, write: ConsistencyLevel) => void;
}

export function HashRingVisualizer({
  state,
  onWriteKey,
  onReadKey,
  onAddNode,
  onCrashNode,
  onRecoverNode,
  onUpdateConsistency,
}: HashRingVisualizerProps): React.JSX.Element {
  const [keyInput, setKeyInput] = useState('user:42');
  const [valInput, setValInput] = useState('{"name":"Alice"}');
  const [readKeyInput, setReadKeyInput] = useState('user:42');
  const [lastReadResult, setLastReadResult] = useState<string | null>(null);

  const cx = 200;
  const cy = 200;
  const radius = 140;

  // Memoized Consistent Hash Ring instance to prevent continuous re-allocation
  const ring = React.useMemo(() => {
    const r = new ConsistentHashRing(3);
    r.setRingTokens(state.ringTokens);
    return r;
  }, [state.ringTokens]);

  const activeKeyToken = React.useMemo(() => (keyInput ? hashToToken(keyInput) : 0), [keyInput]);

  const replicaNodeIds = React.useMemo(
    () => ring.findReplicas(keyInput, state.replicationFactor).replicaNodeIds,
    [ring, keyInput, state.replicationFactor],
  );

  const tokenToAngle = (token: number): number => {
    return (token / 4294967295) * 360;
  };

  const angleToCoord = (deg: number): { x: number; y: number } => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  // Pre-calculated vnode coordinate mapping
  const tokenCoordinates = React.useMemo(() => {
    return state.ringTokens.map((item, idx) => {
      const deg = (item.token / 4294967295) * 360;
      const rad = ((deg - 90) * Math.PI) / 180;
      return {
        idx,
        item,
        pos: {
          x: cx + radius * Math.cos(rad),
          y: cy + radius * Math.sin(rad),
        },
      };
    });
  }, [state.ringTokens]);

  // PACELC Quorum Calculation
  const getRequiredCount = (level: ConsistencyLevel): number => {
    switch (level) {
      case 'ONE': return 1;
      case 'ALL': return state.replicationFactor;
      case 'QUORUM':
      default: return Math.floor(state.replicationFactor / 2) + 1;
    }
  };

  const rCount = getRequiredCount(state.readConsistency);
  const wCount = getRequiredCount(state.writeConsistency);
  const isStrongConsistency = rCount + wCount > state.replicationFactor;

  const handleReadSubmit = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    if (!readKeyInput.trim()) return;
    onReadKey(readKeyInput.trim(), state.readConsistency);

    // Look up what sampled value might be
    const { replicaNodeIds: rNodes } = ring.findReplicas(readKeyInput.trim(), state.replicationFactor);
    const aliveRNodes = rNodes.filter((id) => state.nodes[id]?.status === 'ALIVE');
    if (aliveRNodes.length > 0) {
      const records = aliveRNodes.map((id) => state.nodes[id]?.storage[readKeyInput.trim()]).filter(Boolean);
      if (records.length > 0) {
        const latest = records.reduce((max, cur) => (cur && cur.version > (max?.version ?? 0) ? cur : max), records[0]);
        setLastReadResult(`Key "${readKeyInput}": "${latest?.value ?? ''}" (v${String(latest?.version ?? 0)}) from ${String(aliveRNodes.length)} replicas`);
      } else {
        setLastReadResult(`Key "${readKeyInput}": (null / not found)`);
      }
    } else {
      setLastReadResult(`Error: All replicas for "${readKeyInput}" are DOWN`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px' }}>
      {/* Top Banner with PACELC & Consistency Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.4rem' }}>🗄️</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
              Consistent Hash Ring (Dynamo / Cassandra Architecture)
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Replication Factor (N): <strong>{state.replicationFactor}</strong> · Total Tokens: <strong>{state.ringTokens.length}</strong> · Stale Reads: <strong style={{ color: state.staleReadsObserved > 0 ? '#f43f5e' : '#4ade80' }}>{state.staleReadsObserved}</strong> · Read Repairs: <strong style={{ color: '#38bdf8' }}>{state.readRepairsCompleted}</strong>
            </span>
          </div>
        </div>

        {/* PACELC Consistency Badge & Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: isStrongConsistency ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
              border: isStrongConsistency ? '1px solid #22c55e' : '1px solid #eab308',
              color: isStrongConsistency ? '#4ade80' : '#fde047',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            {isStrongConsistency
              ? `🛡️ STRONG (R:${rCount} + W:${wCount} > N:${state.replicationFactor})`
              : `⚠️ EVENTUAL (R:${rCount} + W:${wCount} ≤ N:${state.replicationFactor})`}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#cbd5e1' }}>
            <span>Write (W):</span>
            <select
              value={state.writeConsistency}
              onChange={(e) => onUpdateConsistency(state.readConsistency, e.target.value as ConsistencyLevel)}
              aria-label="Write consistency level (W)"
              style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '4px', padding: '4px' }}
            >
              <option value="ONE">ONE (1)</option>
              <option value="QUORUM">QUORUM (2)</option>
              <option value="ALL">ALL (3)</option>
            </select>

            <span style={{ marginLeft: '6px' }}>Read (R):</span>
            <select
              value={state.readConsistency}
              onChange={(e) => onUpdateConsistency(e.target.value as ConsistencyLevel, state.writeConsistency)}
              aria-label="Read consistency level (R)"
              style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '4px', padding: '4px' }}
            >
              <option value="ONE">ONE (1)</option>
              <option value="QUORUM">QUORUM (2)</option>
              <option value="ALL">ALL (3)</option>
            </select>
          </div>

          <button
            onClick={onAddNode}
            disabled={Object.keys(state.nodes).length >= 6}
            className="btn btn--primary"
            style={{ fontSize: '0.75rem', padding: '6px 12px' }}
          >
            ➕ Scale-Out Node
          </button>
        </div>
      </div>

      {/* Main Grid: SVG Hash Ring + Operations + Node Details */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(380px, 420px) 1fr', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Left: SVG Hash Ring */}
        <div
          style={{
            backgroundColor: '#0f172a',
            borderRadius: '8px',
            border: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px',
            position: 'relative',
          }}
        >
          <div style={{ position: 'absolute', top: 12, left: 16, fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>
            32-BIT TOKEN RING [0 → 2³²-1]
          </div>

          <svg width="380" height="380" viewBox="0 0 400 400">
            {/* Outer Ring Circle */}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="#334155"
              strokeWidth="4"
              strokeDasharray="4 4"
            />

            {/* Vnode Markers on Perimeter */}
            {tokenCoordinates.map(({ idx, item, pos }) => {
              const node = state.nodes[item.nodeId];
              const isTargetReplica = replicaNodeIds.includes(item.nodeId);

              return (
                <g key={idx}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isTargetReplica ? 8 : 5}
                    fill={node?.status === 'DOWN' ? '#64748b' : node?.color ?? '#38bdf8'}
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                  <text
                    x={pos.x}
                    y={pos.y - 10}
                    fill="#94a3b8"
                    fontSize="9"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    #{item.nodeId}
                  </text>
                </g>
              );
            })}

            {/* Active Key Token Marker */}
            {keyInput && (
              <g>
                {(() => {
                  const keyDeg = tokenToAngle(activeKeyToken);
                  const keyPos = angleToCoord(keyDeg);
                  return (
                    <>
                      <circle
                        cx={keyPos.x}
                        cy={keyPos.y}
                        r="11"
                        fill="#ec4899"
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                      <text
                        x={keyPos.x}
                        y={keyPos.y + 3}
                        fill="#ffffff"
                        fontSize="8"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        🔑
                      </text>
                    </>
                  );
                })()}
              </g>
            )}

            {/* Center Label */}
            <text x={cx} y={cy - 10} fill="#f8fafc" fontSize="13" fontWeight="bold" textAnchor="middle">
              {replicaNodeIds.length} Replicas
            </text>
            <text x={cx} y={cy + 12} fill="#38bdf8" fontSize="11" fontFamily="monospace" textAnchor="middle">
              [{replicaNodeIds.map((id) => `#${id}`).join(', ')}]
            </text>
          </svg>

          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', textAlign: 'center' }}>
            Key <code>{keyInput}</code> hashes to token <code>{activeKeyToken}</code>
          </div>
        </div>

        {/* Right: Operations & Node Storage Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          {/* Write / Read Command Forms */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Write Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (keyInput.trim()) onWriteKey(keyInput.trim(), valInput.trim(), state.writeConsistency);
              }}
              style={{
                backgroundColor: '#0f172a',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                ✍️ Write Key (W = {state.writeConsistency})
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Key"
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                  }}
                />
                <input
                  type="text"
                  value={valInput}
                  onChange={(e) => setValInput(e.target.value)}
                  placeholder="Value"
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <button type="submit" className="btn btn--primary" style={{ fontSize: '0.75rem', padding: '5px' }}>
                Dispatch Write to Replicas
              </button>
            </form>

            {/* Read Form */}
            <form
              onSubmit={handleReadSubmit}
              style={{
                backgroundColor: '#0f172a',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                📖 Read Key (R = {state.readConsistency})
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={readKeyInput}
                  onChange={(e) => setReadKeyInput(e.target.value)}
                  placeholder="Key to read"
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                  }}
                />
                <button type="submit" className="btn btn--indigo" style={{ fontSize: '0.75rem', padding: '5px 12px' }}>
                  Read
                </button>
              </div>
              {lastReadResult && (
                <div style={{ fontSize: '0.7rem', color: '#38bdf8', fontFamily: 'monospace' }}>
                  {lastReadResult}
                </div>
              )}
            </form>
          </div>

          {/* Node Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {Object.values(state.nodes).map((node) => {
              const isDown = node.status === 'DOWN';
              const keys = Object.keys(node.storage);

              return (
                <div
                  key={node.id}
                  style={{
                    backgroundColor: isDown ? 'rgba(244, 63, 94, 0.05)' : '#0f172a',
                    border: isDown ? '1px solid rgba(244, 63, 94, 0.4)' : `1px solid ${node.color}40`,
                    borderRadius: '6px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: node.color }} />
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f8fafc' }}>
                        Node #{node.id}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: isDown ? '#f43f5e20' : '#22c55e20',
                        color: isDown ? '#f43f5e' : '#4ade80',
                      }}
                    >
                      {node.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    Vnodes: <strong>{node.tokens.length}</strong> · Keys: <strong>{keys.length}</strong> · Hints: <strong>{node.hints.length}</strong>
                  </div>

                  {/* Storage Table */}
                  <div style={{ maxHeight: '80px', overflowY: 'auto', backgroundColor: '#020617', padding: '4px', borderRadius: '4px' }}>
                    {keys.length === 0 ? (
                      <span style={{ fontSize: '0.65rem', color: '#475569', fontStyle: 'italic' }}>(empty)</span>
                    ) : (
                      keys.map((k) => {
                        const rec = node.storage[k];
                        return (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                            <span>{k}: &quot;{rec?.value ?? ''}&quot;</span>
                            <span style={{ color: '#38bdf8' }}>v{String(rec?.version ?? 0)}</span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Node Actions */}
                  {isDown ? (
                    <button
                      onClick={() => onRecoverNode(node.id)}
                      className="btn btn--emerald"
                      style={{ fontSize: '0.7rem', padding: '3px' }}
                    >
                      ⚡ Recover Node
                    </button>
                  ) : (
                    <button
                      onClick={() => onCrashNode(node.id)}
                      className="btn btn--rose"
                      style={{ fontSize: '0.7rem', padding: '3px' }}
                    >
                      💥 Crash Node
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
