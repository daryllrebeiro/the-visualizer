'use client';

import React, { useState } from 'react';

import type {
  DistributedLockClusterState,
  LockNodeRecord,
  ProtectedResourceWrite,
} from '@the-visualizer/simulation';

export interface DistributedLockVisualizerProps {
  state: DistributedLockClusterState;
  onAcquire?: (clientId: string) => void;
  onRelease?: (clientId: string) => void;
  onInjectGcPause?: (clientId: string, durationTicks: number) => void;
  onWriteProtectedResource?: (clientId: string, data: string) => void;
  onToggleFencing?: (enabled: boolean) => void;
  onToggleNodeStatus?: (nodeId: string, status: 'ONLINE' | 'PARTITIONED' | 'DOWN') => void;
}

export function DistributedLockVisualizer({
  state,
  onAcquire,
  onRelease: _onRelease,
  onInjectGcPause,
  onWriteProtectedResource,
  onToggleFencing,
  onToggleNodeStatus,
}: DistributedLockVisualizerProps): React.JSX.Element {
  const [writePayload, setWritePayload] = useState<string>('PAYLOAD_ORDER_49');

  const nodes: LockNodeRecord[] = Object.values(state.nodes);
  const clientA = state.clients['client-A'];
  const clientB = state.clients['client-B'];

  const onlineNodes = nodes.filter((n: LockNodeRecord) => n.status === 'ONLINE').length;
  const quorumRequired = Math.floor(nodes.length / 2) + 1; // 3

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '16px',
        overflowY: 'auto',
      }}
    >
      {/* Top Header Banner */}
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
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '1.1rem',
              color: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>🔒</span> Distributed Lock & Fencing Tokens Canvas
            <span
              style={{
                fontSize: '0.75rem',
                backgroundColor: '#1e293b',
                color: '#f87171',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              Redlock Spec & Kleppmann Critique
            </span>
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Tick: <strong>{state.tick}</strong> · TTL: <strong>{state.leaseTtlTicks} ticks</strong>{' '}
            · Online Nodes:{' '}
            <strong>
              {onlineNodes}/{nodes.length}
            </strong>{' '}
            (Quorum: {quorumRequired})
          </span>
        </div>

        {/* Fencing Toggle & Global Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              color: state.fencingEnabled ? '#10b981' : '#f59e0b',
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={state.fencingEnabled}
              onChange={(e) => onToggleFencing?.(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            {state.fencingEnabled
              ? '🛡️ Fencing Enabled (Kleppmann Safety)'
              : '⚠️ Fencing Disabled (Naive Redlock)'}
          </label>
        </div>
      </div>

      {/* Real-World Flaw Notice */}
      {state.flawsDemonstrated.mutualExclusionViolated && (
        <div
          style={{
            backgroundColor: '#451a03',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#fef3c7',
            fontSize: '0.85rem',
          }}
        >
          <strong>
            ⚠️ Known Real-World Flaw Demonstrated (LOCK-4): Naive Mutual Exclusion Broken by GC
            Pause
          </strong>
          <p style={{ margin: '4px 0 0 0', color: '#fde68a' }}>
            Both Client A and Client B believe they hold the lock. This proves Martin
            Kleppmann&apos;s critique: physical clock expiry cannot guarantee mutual exclusion in
            asynchronous networks without downstream fencing tokens (LOCK-1).
          </p>
        </div>
      )}

      {/* Top Split: Redlock Quorum Fleet (Left) and Downstream Protected Resource (Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '14px',
        }}
      >
        {/* Left: 5 Redlock Nodes */}
        <div
          style={{
            backgroundColor: '#020617',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#f8fafc', fontWeight: 700 }}>
              Independent Lock Nodes (Redlock Quorum)
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Quorum Threshold: 3/5</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '8px',
            }}
          >
            {nodes.map((node) => {
              const isHeld = node.heldByClient !== null && node.expiresAtTick > state.tick;
              return (
                <div
                  key={node.nodeId}
                  style={{
                    backgroundColor: '#0f172a',
                    border:
                      node.status === 'DOWN'
                        ? '1px solid #ef4444'
                        : isHeld
                          ? '1px solid #10b981'
                          : '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    fontSize: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontWeight: 700,
                      color: '#f8fafc',
                    }}
                  >
                    <span>{node.nodeId}</span>
                    <button
                      onClick={() =>
                        onToggleNodeStatus?.(
                          node.nodeId,
                          node.status === 'ONLINE' ? 'DOWN' : 'ONLINE',
                        )
                      }
                      style={{
                        backgroundColor: node.status === 'ONLINE' ? '#1e293b' : '#ef4444',
                        color: '#f8fafc',
                        border: 'none',
                        borderRadius: '3px',
                        padding: '2px 4px',
                        fontSize: '0.65rem',
                        cursor: 'pointer',
                      }}
                    >
                      {node.status}
                    </button>
                  </div>

                  <div style={{ color: isHeld ? '#10b981' : '#64748b' }}>
                    {isHeld ? `Held: ${node.heldByClient}` : 'Status: Free'}
                  </div>

                  {isHeld && (
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      Exp: t={node.expiresAtTick} (Token #{node.fencingToken})
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Protected Downstream Storage Target */}
        <div
          style={{
            backgroundColor: '#020617',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#f8fafc', fontWeight: 700 }}>
              Protected Downstream Resource (LOCK-1 Enforcement)
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
              Highest Seen Token: #{state.protectedResource.highestFencingTokenSeen}
            </span>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
              Current Stored State:
            </div>
            <div
              style={{
                fontSize: '0.95rem',
                color: '#38bdf8',
                fontWeight: 700,
                fontFamily: 'monospace',
              }}
            >
              &quot;{state.protectedResource.currentValue}&quot;
            </div>
            <div style={{ display: 'flex', gap: '14px', marginTop: '8px', fontSize: '0.75rem' }}>
              <span style={{ color: '#10b981' }}>
                Safely Rejected Stale:{' '}
                <strong>{state.protectedResource.safelyRejectedCount}</strong>
              </span>
              <span style={{ color: '#ef4444' }}>
                Corrupted Writes: <strong>{state.protectedResource.corruptedWritesCount}</strong>
              </span>
            </div>
          </div>

          {/* Write Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={writePayload}
              onChange={(e) => setWritePayload(e.target.value)}
              placeholder="Write payload..."
              style={{
                flex: 1,
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '6px 8px',
                fontSize: '0.8rem',
              }}
            />
            <button
              onClick={() => onWriteProtectedResource?.('client-A', writePayload)}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 10px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Write as Client A
            </button>
            <button
              onClick={() => onWriteProtectedResource?.('client-B', writePayload)}
              style={{
                backgroundColor: '#7c3aed',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 10px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Write as Client B
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Kleppmann Scenario Stage */}
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '14px',
        }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#f8fafc', fontWeight: 700 }}>
          Interactive Scenario: Martin Kleppmann GC Pause Hazard Walkthrough
        </h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#94a3b8' }}>
          Follow these 4 steps in sequence to reproduce the exact race condition that breaks naive
          distributed locks:
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '10px',
          }}
        >
          <button
            onClick={() => onAcquire?.('client-A')}
            style={{
              backgroundColor: clientA?.state === 'HOLDING' ? '#047857' : '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '10px',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>1. Client A Acquires</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
              Token #{clientA?.assignedFencingToken ?? '—'} · State: {clientA?.state}
            </div>
          </button>

          <button
            onClick={() => onInjectGcPause?.('client-A', 12)}
            style={{
              backgroundColor: clientA?.state === 'PAUSED_GC' ? '#b45309' : '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '10px',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>2. Inject GC Pause (12t)</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
              Client A thread freezes; node leases expire
            </div>
          </button>

          <button
            onClick={() => {
              onAcquire?.('client-B');
              onWriteProtectedResource?.('client-B', 'DATA_COMMITTED_BY_CLIENT_B');
            }}
            style={{
              backgroundColor: clientB?.state === 'HOLDING' ? '#047857' : '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '10px',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>3. Client B Acquires & Writes</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
              Token #{clientB?.assignedFencingToken ?? '—'} · Writes fresh data
            </div>
          </button>

          <button
            onClick={() => onWriteProtectedResource?.('client-A', 'STALE_OVERWRITE_FROM_CLIENT_A')}
            style={{
              backgroundColor: '#dc2626',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '6px',
              padding: '10px',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>4. Client A Resumes & Writes</div>
            <div style={{ fontSize: '0.7rem', color: '#fecaca' }}>
              Attempts write with Token #1. Test safety!
            </div>
          </button>
        </div>
      </div>

      {/* Downstream Write Audit Trail */}
      <div
        style={{
          backgroundColor: '#020617',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '14px',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#f8fafc' }}>
          Protected Resource Write History
        </h3>
        <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.75rem',
              color: '#cbd5e1',
            }}
          >
            <thead>
              <tr
                style={{ borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}
              >
                <th style={{ padding: '6px' }}>Tick</th>
                <th style={{ padding: '6px' }}>Client</th>
                <th style={{ padding: '6px' }}>Fencing Token</th>
                <th style={{ padding: '6px' }}>Payload</th>
                <th style={{ padding: '6px' }}>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {state.protectedResource.writesHistory.map((w: ProtectedResourceWrite, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: '6px' }}>t={w.tick}</td>
                  <td style={{ padding: '6px', fontWeight: 600 }}>{w.clientId}</td>
                  <td style={{ padding: '6px' }}>
                    {w.fencingToken !== null ? `#${w.fencingToken}` : 'None'}
                  </td>
                  <td style={{ padding: '6px', fontFamily: 'monospace' }}>{w.data}</td>
                  <td style={{ padding: '6px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor:
                          w.status === 'ACCEPTED'
                            ? '#064e3b'
                            : w.status === 'REJECTED_STALE_FENCING_TOKEN'
                              ? '#78350f'
                              : '#7f1d1d',
                        color:
                          w.status === 'ACCEPTED'
                            ? '#34d399'
                            : w.status === 'REJECTED_STALE_FENCING_TOKEN'
                              ? '#fbbf24'
                              : '#fca5a5',
                      }}
                    >
                      {w.status}
                    </span>
                  </td>
                </tr>
              ))}
              {state.protectedResource.writesHistory.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}
                  >
                    No writes executed yet. Use the buttons above to test writes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
