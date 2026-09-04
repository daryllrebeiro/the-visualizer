'use client';

import React, { useState } from 'react';

import type { EvictionPolicy, RedisClusterState, RedisNode } from '@the-visualizer/simulation';
import { extractHashTag, getClusterSlot } from '@the-visualizer/simulation';

interface RedisClusterVisualizerProps {
  state: RedisClusterState;
  onSetKey: (key: string, value: string, ttl: number | null, targetNodeId?: string) => void;
  onGetKey: (key: string, targetNodeId?: string) => void;
  onDelKey: (key: string) => void;
  onReshard: (
    sourceMasterId: string,
    targetMasterId: string,
    startSlot: number,
    endSlot: number,
  ) => void;
  onCrashNode: (nodeId: string) => void;
  onRecoverNode: (nodeId: string) => void;
  onSetEvictionPolicy: (policy: EvictionPolicy) => void;
}

export function RedisClusterVisualizer({
  state,
  onSetKey,
  onGetKey,
  onDelKey,
  onReshard,
  onCrashNode,
  onRecoverNode,
  onSetEvictionPolicy,
}: RedisClusterVisualizerProps): React.JSX.Element {
  const [keyInput, setKeyInput] = useState('{user:42}:profile');
  const [valInput, setValInput] = useState('{"tier":"premium"}');
  const [ttlInput, setTtlInput] = useState<string>('');
  const [readKeyInput, setReadKeyInput] = useState('{user:42}:profile');
  const [targetNodeInput, setTargetNodeInput] = useState<string>('1');

  const computedSlot = keyInput ? getClusterSlot(keyInput) : 0;
  const hashtag = keyInput ? extractHashTag(keyInput) : '';

  const totalOps = state.totalHits + state.totalMisses;
  const hitRate = totalOps > 0 ? ((state.totalHits / totalOps) * 100).toFixed(1) : '100.0';

  const nodes = Object.values(state.nodes) as RedisNode[];
  const masters = nodes.filter((n) => n.role === 'MASTER');

  const handleSetSubmit = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    const ttl = ttlInput.trim() ? parseInt(ttlInput.trim(), 10) : null;
    onSetKey(keyInput.trim(), valInput.trim(), ttl, targetNodeInput ? targetNodeInput : undefined);
  };

  const handleGetSubmit = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    if (!readKeyInput.trim()) return;
    onGetKey(readKeyInput.trim(), targetNodeInput ? targetNodeInput : undefined);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '16px',
      }}
    >
      {/* Top Banner: Metrics & Eviction Policy Selector */}
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
          <span style={{ fontSize: '1.4rem' }}>⚡</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
              Redis Cluster (16,384 Hash Slots & Multi-Policy Eviction)
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Hit Rate: <strong style={{ color: '#4ade80' }}>{hitRate}%</strong> ({state.totalHits}{' '}
              hits / {state.totalMisses} misses) · Evictions:{' '}
              <strong style={{ color: '#f43f5e' }}>{state.totalEvictions}</strong> · MOVED
              Redirects: <strong style={{ color: '#38bdf8' }}>{state.totalMovedRedirects}</strong> ·
              ASK Redirects: <strong style={{ color: '#fbbf24' }}>{state.totalAskRedirects}</strong>
            </span>
          </div>
        </div>

        {/* Eviction Policy Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Eviction Policy:</span>
          <select
            value={state.evictionPolicy}
            onChange={(e) => onSetEvictionPolicy(e.target.value as EvictionPolicy)}
            aria-label="Redis cache eviction policy"
            style={{
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '0.75rem',
            }}
          >
            <option value="allkeys-lru">allkeys-lru (Least Recently Used)</option>
            <option value="allkeys-lfu">allkeys-lfu (Least Frequently Used)</option>
            <option value="volatile-ttl">volatile-ttl (Shortest TTL First)</option>
            <option value="allkeys-random">allkeys-random (Uniform Random)</option>
            <option value="noeviction">noeviction (Error on Maxmemory)</option>
          </select>

          <button
            onClick={() => onReshard('1', '2', 5000, 5460)}
            className="btn btn--indigo"
            style={{ fontSize: '0.75rem', padding: '5px 10px' }}
          >
            🔄 Reshard Slots 5000-5460
          </button>
        </div>
      </div>

      {/* 16,384 Slot Allocation Bar */}
      <div
        style={{
          backgroundColor: '#0f172a',
          borderRadius: '8px',
          padding: '12px',
          border: '1px solid #1e293b',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: '#94a3b8',
            marginBottom: '6px',
          }}
        >
          <span>16,384 HASH SLOTS DISTRIBUTION [0 → 16383]</span>
          <span>
            Key <code>{keyInput}</code> {hashtag !== keyInput ? `(hashtag: {${hashtag}})` : ''} →
            Slot <strong style={{ color: '#ec4899' }}>{computedSlot}</strong>
          </span>
        </div>

        {/* Multi-Segment Color Bar */}
        <div
          style={{
            height: '14px',
            borderRadius: '4px',
            display: 'flex',
            overflow: 'hidden',
            position: 'relative',
            backgroundColor: '#020617',
          }}
        >
          {masters.map((m) => {
            const totalSlots = m.slotRanges.reduce(
              (acc, r) => acc + (r.endSlot - r.startSlot + 1),
              0,
            );
            const pct = (totalSlots / 16384) * 100;
            return (
              <div
                key={m.id}
                style={{
                  width: `${pct}%`,
                  backgroundColor: m.status === 'FAIL' ? '#475569' : m.color,
                  height: '100%',
                  opacity: 0.85,
                  transition: 'width 0.3s ease',
                }}
                title={`Master #${m.id}: ${totalSlots} slots`}
              />
            );
          })}

          {/* Key Pinpoint Indicator */}
          {keyInput && (
            <div
              style={{
                position: 'absolute',
                left: `${(computedSlot / 16384) * 100}%`,
                top: 0,
                bottom: 0,
                width: '3px',
                backgroundColor: '#ffffff',
                boxShadow: '0 0 8px #ffffff',
              }}
            />
          )}
        </div>
      </div>

      {/* Operations & Master/Replica Shard Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 340px) 1fr',
          gap: '16px',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left Form: SET / GET */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* SET Command Form */}
          <form
            onSubmit={handleSetSubmit}
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
              ✍️ SET Command
            </div>
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Key e.g. {user:100}:token"
              style={{
                padding: '5px 8px',
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
                padding: '5px 8px',
                fontSize: '0.75rem',
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '4px',
              }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="number"
                value={ttlInput}
                onChange={(e) => setTtlInput(e.target.value)}
                placeholder="TTL (ticks, optional)"
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  fontSize: '0.75rem',
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                }}
              />
              <select
                value={targetNodeInput}
                onChange={(e) => setTargetNodeInput(e.target.value)}
                aria-label="Target Redis contact node"
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  fontSize: '0.75rem',
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                }}
              >
                <option value="">Auto-Route</option>
                <option value="1">Contact Node 1</option>
                <option value="2">Contact Node 2</option>
                <option value="3">Contact Node 3</option>
              </select>
            </div>
            <button
              type="submit"
              className="btn btn--primary"
              style={{ fontSize: '0.75rem', padding: '6px' }}
            >
              Execute SET
            </button>
          </form>

          {/* GET Command Form */}
          <form
            onSubmit={handleGetSubmit}
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
              📖 GET / DEL Command
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={readKeyInput}
                onChange={(e) => setReadKeyInput(e.target.value)}
                placeholder="Key to fetch"
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  fontSize: '0.75rem',
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                }}
              />
              <button
                type="submit"
                className="btn btn--indigo"
                style={{ fontSize: '0.75rem', padding: '5px 10px' }}
              >
                GET
              </button>
              <button
                type="button"
                onClick={() => onDelKey(readKeyInput.trim())}
                className="btn btn--rose"
                style={{ fontSize: '0.75rem', padding: '5px 10px' }}
              >
                DEL
              </button>
            </div>
          </form>

          {/* Resharding & Slot Migration Card */}
          <div
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
              🔄 Slot Migration & Resharding (ASK vs MOVED)
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
              Migrate slot range to test transient <code>ASK</code> vs permanent <code>MOVED</code>{' '}
              redirects.
            </div>
            <button
              type="button"
              onClick={() => onReshard('1', '2', 0, 500)}
              className="btn btn--secondary"
              style={{ fontSize: '0.75rem', padding: '5px 10px' }}
            >
              ⚡ Reshard Slots 0-500 (Master 1 → 2)
            </button>
          </div>
        </div>

        {/* Right: Master / Replica Shard Pairs Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '12px',
            overflowY: 'auto',
          }}
        >
          {masters.map((master) => {
            const replica = nodes.find((n) => n.role === 'REPLICA' && n.masterId === master.id);
            const isMasterDown = master.status === 'FAIL';
            const entries = Object.values(master.storage);

            return (
              <div
                key={master.id}
                style={{
                  backgroundColor: isMasterDown ? 'rgba(244, 63, 94, 0.05)' : '#0f172a',
                  border: isMasterDown
                    ? '1px solid rgba(244, 63, 94, 0.4)'
                    : `1px solid ${master.color}60`,
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {/* Master Node Header */}
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: master.color,
                      }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f8fafc' }}>
                      Master #{master.id} ({master.port})
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: isMasterDown ? '#f43f5e20' : '#22c55e20',
                      color: isMasterDown ? '#f43f5e' : '#4ade80',
                      fontWeight: 700,
                    }}
                  >
                    {master.status}
                  </span>
                </div>

                {/* Slots & Memory Gauge */}
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  Slots:{' '}
                  <strong>
                    {master.slotRanges.map((r) => `${r.startSlot}-${r.endSlot}`).join(', ')}
                  </strong>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.7rem',
                      color: '#cbd5e1',
                    }}
                  >
                    <span>Memory Usage</span>
                    <span>
                      {master.memoryUsedBytes} / {master.maxMemoryBytes} B
                    </span>
                  </div>
                  <div
                    style={{
                      height: '4px',
                      backgroundColor: '#1e293b',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, (master.memoryUsedBytes / master.maxMemoryBytes) * 100)}%`,
                        backgroundColor:
                          master.memoryUsedBytes > master.maxMemoryBytes * 0.8
                            ? '#f43f5e'
                            : '#38bdf8',
                        transition: 'width 0.2s linear',
                      }}
                    />
                  </div>
                </div>

                {/* Stored Keys List */}
                <div
                  style={{
                    maxHeight: '100px',
                    overflowY: 'auto',
                    backgroundColor: '#020617',
                    padding: '6px',
                    borderRadius: '4px',
                  }}
                >
                  {entries.length === 0 ? (
                    <span style={{ fontSize: '0.65rem', color: '#475569', fontStyle: 'italic' }}>
                      (cache empty)
                    </span>
                  ) : (
                    entries.map((entry) => (
                      <div
                        key={entry.key}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.65rem',
                          fontFamily: 'monospace',
                          color: '#cbd5e1',
                          padding: '2px 0',
                        }}
                      >
                        <span style={{ color: '#38bdf8' }}>
                          {entry.key}: &quot;{entry.value}&quot;
                        </span>
                        <span style={{ color: '#94a3b8' }}>
                          freq:{entry.accessCount} {entry.ttl !== null ? `ttl:${entry.ttl}` : ''}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Replica Shadow Info */}
                {replica && (
                  <div
                    style={{
                      fontSize: '0.65rem',
                      color: '#64748b',
                      borderTop: '1px solid #1e293b',
                      paddingTop: '4px',
                    }}
                  >
                    Replica #{replica.id} ({replica.status}) · Sync:{' '}
                    {Object.keys(replica.storage).length} keys
                  </div>
                )}

                {/* Master Action */}
                {isMasterDown ? (
                  <button
                    onClick={() => onRecoverNode(master.id)}
                    className="btn btn--emerald"
                    style={{ fontSize: '0.7rem', padding: '3px' }}
                  >
                    ⚡ Recover Master
                  </button>
                ) : (
                  <button
                    onClick={() => onCrashNode(master.id)}
                    className="btn btn--rose"
                    style={{ fontSize: '0.7rem', padding: '3px' }}
                  >
                    💥 Crash Master (Trigger Failover)
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
