'use client';

import React, { useState } from 'react';

import type {
  RateLimiterAlgorithm,
  RateLimiterBackendMode,
  RateLimiterClusterState,
} from '@the-visualizer/simulation';

export interface RateLimiterVisualizerProps {
  state: RateLimiterClusterState;
  onRequest?: (clientId: string, cost?: number) => void;
  onBurst?: (clientId: string, count: number) => void;
  onUpdateConfig?: (cfg: {
    capacity?: number;
    refillRatePerTick?: number;
    windowSizeTicks?: number;
    limit?: number;
    backendMode?: RateLimiterBackendMode;
    activeAlgorithm?: RateLimiterAlgorithm | 'ALL_PARALLEL';
  }) => void;
  onTriggerBoundaryBurst?: () => void;
}

export function RateLimiterVisualizer({
  state,
  onRequest,
  onBurst,
  onUpdateConfig: _onUpdateConfig,
  onTriggerBoundaryBurst,
}: RateLimiterVisualizerProps): React.JSX.Element {
  const [selectedClient, setSelectedClient] = useState<string>('client-1');
  const client = state.clients[selectedClient] || Object.values(state.clients)[0];

  const algorithms: Array<{
    id: RateLimiterAlgorithm;
    name: string;
    badge: string;
    color: string;
    desc: string;
  }> = [
    {
      id: 'TOKEN_BUCKET',
      name: 'Token Bucket',
      badge: 'RFC 2697',
      color: '#10b981',
      desc: 'Refills smoothly over time; absorbs bursts up to bucket capacity.',
    },
    {
      id: 'LEAKY_BUCKET',
      name: 'Leaky Bucket',
      badge: 'Traffic Shaping',
      color: '#06b6d4',
      desc: 'Constant processing rate output; queues or drops bursts exceeding queue size.',
    },
    {
      id: 'FIXED_WINDOW',
      name: 'Fixed Window Counter',
      badge: 'Boundary Burst Flaw',
      color: '#f59e0b',
      desc: 'Simple clock-aligned counter; vulnerable to 2x bursts straddling window boundary.',
    },
    {
      id: 'SLIDING_LOG',
      name: 'Sliding Window Log',
      badge: 'Exact Rate (O(N) Mem)',
      color: '#8b5cf6',
      desc: 'Tracks timestamps of all admitted requests; mathematically exact trailing window.',
    },
    {
      id: 'SLIDING_COUNTER',
      name: 'Sliding Window Counter',
      badge: 'Cloudflare Approximation',
      color: '#ec4899',
      desc: 'Weighted average approximation: prev_count * (1 - overlap) + curr_count.',
    },
  ];

  const tb = client?.tokenBucket;
  const lb = client?.leakyBucket;
  const fw = client?.fixedWindow;
  const sl = client?.slidingLog;
  const sc = client?.slidingCounter;

  // Cloudflare weighted average stats
  const timeIntoCurrent = sc ? Math.max(0, state.tick - sc.windowStartTick) : 0;
  const overlapFraction = sc ? Math.max(0, 1 - timeIntoCurrent / sc.windowSizeTicks) : 0;
  const estimatedCount = sc
    ? Number((sc.previousCount * overlapFraction + sc.currentCount).toFixed(2))
    : 0;

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
            <span>⏱️</span> Rate Limiter Comparison Canvas
            <span
              style={{
                fontSize: '0.75rem',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              RFC 2697 & Cloudflare Spec
            </span>
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Tick: <strong>{state.tick}</strong> · Mode: <strong>{state.backendMode}</strong> ·
            Capacity: <strong>{state.globalCapacity}</strong> · Refill:{' '}
            <strong>{state.globalRefillRatePerTick}/tick</strong>
          </span>
        </div>

        {/* Client & Algorithm Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Client:
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              style={{
                marginLeft: '4px',
                backgroundColor: '#020617',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '4px 8px',
              }}
            >
              {Object.keys(state.clients).map((cid) => (
                <option key={cid} value={cid}>
                  {cid}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={() => onRequest?.(selectedClient, 1)}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            +1 Request
          </button>

          <button
            onClick={() => onBurst?.(selectedClient, 5)}
            style={{
              backgroundColor: '#7c3aed',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Burst (5)
          </button>

          <button
            onClick={() => onBurst?.(selectedClient, 15)}
            style={{
              backgroundColor: '#d97706',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Spike (15)
          </button>

          <button
            onClick={() => onTriggerBoundaryBurst?.()}
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title="Demonstrates RL-3: Fixed Window allows up to 2x quota straddling window boundary"
          >
            💥 Stage Boundary Burst (RL-3)
          </button>
        </div>
      </div>

      {/* Pedagogical Flaw Notice */}
      {state.flawsDemonstrated.fixedWindowBoundaryBurstDetected && (
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
          <strong>⚠️ Known Real-World Flaw Demonstrated (RL-3): Fixed Window Boundary Burst</strong>
          <p style={{ margin: '4px 0 0 0', color: '#fde68a' }}>
            Fixed Window Counter allowed requests exceeding rate limit across window boundary. This
            demonstrates why production gateways prefer Sliding Window or Token Bucket.
          </p>
        </div>
      )}

      {/* Side-by-Side 5 Algorithm Comparison Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '14px',
        }}
      >
        {algorithms.map((alg) => {
          const admitted = client?.totalAdmitted[alg.id] ?? 0;
          const denied = client?.totalDenied[alg.id] ?? 0;
          const total = admitted + denied;
          const admitRate = total > 0 ? ((admitted / total) * 100).toFixed(1) : '100.0';

          return (
            <div
              key={alg.id}
              style={{
                backgroundColor: '#020617',
                border: `1px solid ${alg.color}40`,
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#f8fafc', fontWeight: 700 }}>
                    {alg.name}
                  </h3>
                  <span style={{ fontSize: '0.7rem', color: alg.color, fontWeight: 600 }}>
                    {alg.badge}
                  </span>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Admitted: <strong style={{ color: '#10b981' }}>{admitted}</strong> / Denied:{' '}
                  <strong style={{ color: '#ef4444' }}>{denied}</strong>
                </div>
              </div>

              {/* Algorithm-Specific Visualizer Canvas */}
              <div
                style={{
                  backgroundColor: '#0f172a',
                  borderRadius: '6px',
                  padding: '12px',
                  border: '1px solid #1e293b',
                  minHeight: '110px',
                }}
              >
                {alg.id === 'TOKEN_BUCKET' && tb && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        marginBottom: '6px',
                      }}
                    >
                      <span>
                        Tokens Available:{' '}
                        <strong>
                          {tb.tokens} / {tb.capacity}
                        </strong>
                      </span>
                      <span>+{tb.refillRatePerTick}/tick</span>
                    </div>
                    {/* SVG Bucket Water level */}
                    <div
                      style={{
                        height: '36px',
                        width: '100%',
                        backgroundColor: '#1e293b',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, (tb.tokens / tb.capacity) * 100)}%`,
                          backgroundColor: '#10b981',
                          transition: 'width 0.2s ease',
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          top: '8px',
                          left: '12px',
                          fontSize: '0.75rem',
                          color: '#ffffff',
                          fontWeight: 700,
                        }}
                      >
                        {((tb.tokens / tb.capacity) * 100).toFixed(0)}% Fill
                      </span>
                    </div>
                  </div>
                )}

                {alg.id === 'LEAKY_BUCKET' && lb && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        marginBottom: '6px',
                      }}
                    >
                      <span>
                        Queue Backlog:{' '}
                        <strong>
                          {lb.queueSize} / {lb.capacity}
                        </strong>
                      </span>
                      <span>Leak: {lb.leakRatePerTick}/tick</span>
                    </div>
                    <div
                      style={{
                        height: '36px',
                        width: '100%',
                        backgroundColor: '#1e293b',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, (lb.queueSize / lb.capacity) * 100)}%`,
                          backgroundColor: lb.queueSize > lb.capacity * 0.8 ? '#ef4444' : '#06b6d4',
                          transition: 'width 0.2s ease',
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          top: '8px',
                          left: '12px',
                          fontSize: '0.75rem',
                          color: '#ffffff',
                          fontWeight: 700,
                        }}
                      >
                        Queue: {lb.queueSize} units
                      </span>
                    </div>
                  </div>
                )}

                {alg.id === 'FIXED_WINDOW' && fw && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        marginBottom: '6px',
                      }}
                    >
                      <span>
                        Window Usage:{' '}
                        <strong>
                          {fw.count} / {fw.limit}
                        </strong>
                      </span>
                      <span>Size: {fw.windowSizeTicks} ticks</span>
                    </div>
                    <div
                      style={{
                        height: '36px',
                        width: '100%',
                        backgroundColor: '#1e293b',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, (fw.count / fw.limit) * 100)}%`,
                          backgroundColor: fw.count >= fw.limit ? '#ef4444' : '#f59e0b',
                          transition: 'width 0.2s ease',
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          top: '8px',
                          left: '12px',
                          fontSize: '0.75rem',
                          color: '#ffffff',
                          fontWeight: 700,
                        }}
                      >
                        Window Start: t={fw.windowStartTick}
                      </span>
                    </div>
                  </div>
                )}

                {alg.id === 'SLIDING_LOG' && sl && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        marginBottom: '6px',
                      }}
                    >
                      <span>
                        Trailing Window Log:{' '}
                        <strong>
                          {sl.log.filter((t: number) => t > state.tick - sl.windowSizeTicks).length}{' '}
                          / {sl.limit}
                        </strong>
                      </span>
                      <span>Exact History</span>
                    </div>
                    <div
                      style={{
                        height: '36px',
                        width: '100%',
                        backgroundColor: '#1e293b',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        overflowX: 'auto',
                      }}
                    >
                      {sl.log.slice(-10).map((t: number, idx: number) => (
                        <span
                          key={idx}
                          style={{
                            backgroundColor: '#8b5cf6',
                            color: '#ffffff',
                            fontSize: '0.65rem',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          t={t}
                        </span>
                      ))}
                      {sl.log.length === 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          No requests in window
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {alg.id === 'SLIDING_COUNTER' && sc && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        marginBottom: '4px',
                      }}
                    >
                      <span>
                        Estimated Count:{' '}
                        <strong style={{ color: '#ec4899' }}>
                          {estimatedCount} / {sc.limit}
                        </strong>
                      </span>
                      <span>Overlap: {(overlapFraction * 100).toFixed(0)}%</span>
                    </div>
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: '#cbd5e1',
                        backgroundColor: '#020617',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                      }}
                    >
                      {sc.previousCount} × {overlapFraction.toFixed(2)} + {sc.currentCount} ={' '}
                      {estimatedCount}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
                {alg.desc}
              </div>

              <div
                style={{
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  borderTop: '1px solid #1e293b',
                  paddingTop: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  Admit Rate: <strong>{admitRate}%</strong>
                </span>
                <span>Total: {total}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Accessible Summary Table */}
      <div
        style={{
          backgroundColor: '#0f172a',
          padding: '14px',
          borderRadius: '8px',
          border: '1px solid #1e293b',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#f8fafc' }}>
          Comparative Summary Table (Client: {selectedClient})
        </h3>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.8rem',
            color: '#cbd5e1',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}>
              <th style={{ padding: '6px 8px' }}>Algorithm</th>
              <th style={{ padding: '6px 8px' }}>Admitted</th>
              <th style={{ padding: '6px 8px' }}>Denied</th>
              <th style={{ padding: '6px 8px' }}>Memory Cost</th>
              <th style={{ padding: '6px 8px' }}>Burst Handling</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '6px 8px', fontWeight: 600, color: '#10b981' }}>
                Token Bucket
              </td>
              <td style={{ padding: '6px 8px' }}>{client?.totalAdmitted.TOKEN_BUCKET ?? 0}</td>
              <td style={{ padding: '6px 8px' }}>{client?.totalDenied.TOKEN_BUCKET ?? 0}</td>
              <td style={{ padding: '6px 8px' }}>O(1)</td>
              <td style={{ padding: '6px 8px' }}>Allows bursts up to capacity</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '6px 8px', fontWeight: 600, color: '#06b6d4' }}>
                Leaky Bucket
              </td>
              <td style={{ padding: '6px 8px' }}>{client?.totalAdmitted.LEAKY_BUCKET ?? 0}</td>
              <td style={{ padding: '6px 8px' }}>{client?.totalDenied.LEAKY_BUCKET ?? 0}</td>
              <td style={{ padding: '6px 8px' }}>O(1)</td>
              <td style={{ padding: '6px 8px' }}>Smooths output to constant rate</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '6px 8px', fontWeight: 600, color: '#f59e0b' }}>
                Fixed Window Counter
              </td>
              <td style={{ padding: '6px 8px' }}>{client?.totalAdmitted.FIXED_WINDOW ?? 0}</td>
              <td style={{ padding: '6px 8px' }}>{client?.totalDenied.FIXED_WINDOW ?? 0}</td>
              <td style={{ padding: '6px 8px' }}>O(1)</td>
              <td style={{ padding: '6px 8px', color: '#f59e0b' }}>Flaw: 2x boundary burst</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '6px 8px', fontWeight: 600, color: '#8b5cf6' }}>
                Sliding Window Log
              </td>
              <td style={{ padding: '6px 8px' }}>{client?.totalAdmitted.SLIDING_LOG ?? 0}</td>
              <td style={{ padding: '6px 8px' }}>{client?.totalDenied.SLIDING_LOG ?? 0}</td>
              <td style={{ padding: '6px 8px', color: '#f87171' }}>O(N) unbounded</td>
              <td style={{ padding: '6px 8px' }}>Strict rate enforcement</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 8px', fontWeight: 600, color: '#ec4899' }}>
                Sliding Window Counter
              </td>
              <td style={{ padding: '6px 8px' }}>{client?.totalAdmitted.SLIDING_COUNTER ?? 0}</td>
              <td style={{ padding: '6px 8px' }}>{client?.totalDenied.SLIDING_COUNTER ?? 0}</td>
              <td style={{ padding: '6px 8px' }}>O(1) (2 counters)</td>
              <td style={{ padding: '6px 8px' }}>Cloudflare weighted approx</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
