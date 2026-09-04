'use client';

import React, { useState } from 'react';

import type {
  CdnCacheClusterState,
  EdgePoPState,
  RegionalCacheState,
} from '@the-visualizer/simulation';

export interface CdnCacheVisualizerProps {
  state: CdnCacheClusterState;
  onRequest?: (key: string, clientRegion?: 'US_EAST' | 'US_WEST' | 'EU_WEST' | 'AP_SOUTH') => void;
  onFlashCrowd?: (
    key: string,
    count: number,
    clientRegion?: 'US_EAST' | 'US_WEST' | 'EU_WEST' | 'AP_SOUTH',
  ) => void;
  onPurge?: (key: string) => void;
  onTogglePopStatus?: (popId: string, status: 'ONLINE' | 'OFFLINE') => void;
  onToggleCoalescing?: (enabled: boolean) => void;
  onUpdateOrigin?: (key: string, newValue: string) => void;
}

export function CdnCacheVisualizer({
  state,
  onRequest,
  onFlashCrowd,
  onPurge,
  onTogglePopStatus,
  onToggleCoalescing,
  onUpdateOrigin,
}: CdnCacheVisualizerProps): React.JSX.Element {
  const [selectedKey, setSelectedKey] = useState<string>('/static/banner.jpg');
  const [selectedRegion, setSelectedRegion] = useState<
    'US_EAST' | 'US_WEST' | 'EU_WEST' | 'AP_SOUTH'
  >('US_EAST');

  const pops: EdgePoPState[] = Object.values(state.edgePops);
  const regionalTiers: RegionalCacheState[] = Object.values(state.regionalTiers);

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
            <span>⚡</span> CDN & Multi-Tier Caching Canvas
            <span
              style={{
                fontSize: '0.75rem',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              RFC 9111 HTTP Caching & Edge Shield
            </span>
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Tick: <strong>{state.tick}</strong> · Origin Requests Received:{' '}
            <strong>{state.origin.totalRequestsReceived}</strong> · Max-Age:{' '}
            <strong>{state.defaultMaxAgeTicks}t</strong> · SWR:{' '}
            <strong>{state.defaultStaleWhileRevalidateTicks}t</strong>
          </span>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              color: state.coalescingEnabled ? '#10b981' : '#f59e0b',
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={state.coalescingEnabled}
              onChange={(e) => onToggleCoalescing?.(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            {state.coalescingEnabled
              ? '🛡️ Request Coalescing (Single-Flight)'
              : '⚠️ Coalescing Disabled (Stampede Risk)'}
          </label>
        </div>
      </div>

      {/* Real-World Flaw Notice */}
      {state.flawsDemonstrated.cacheStampedeOriginSpikeDetected && (
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
            ⚠️ Known Real-World Flaw Demonstrated (CDN-2): Cache Stampede (Thundering Herd)
          </strong>
          <p style={{ margin: '4px 0 0 0', color: '#fde68a' }}>
            Flash crowd on cold key bypassed edge without request coalescing, causing N concurrent
            origin fetches and overloading the origin server.
          </p>
        </div>
      )}

      {/* Multi-Tier Topology Waterfall: Edge PoPs -> Regional Shields -> Origin */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '14px',
        }}
      >
        {/* Tier 1: Edge PoP Fleet */}
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
              Edge PoP Fleet (Tier 1)
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>Geo-Distributed</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '8px',
            }}
          >
            {pops.map((pop) => (
              <div
                key={pop.popId}
                style={{
                  backgroundColor: '#0f172a',
                  border: pop.status === 'ONLINE' ? '1px solid #334155' : '1px solid #ef4444',
                  borderRadius: '6px',
                  padding: '8px',
                  fontSize: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
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
                  <span>{pop.region}</span>
                  <button
                    onClick={() =>
                      onTogglePopStatus?.(pop.popId, pop.status === 'ONLINE' ? 'OFFLINE' : 'ONLINE')
                    }
                    style={{
                      backgroundColor: pop.status === 'ONLINE' ? '#1e293b' : '#ef4444',
                      color: '#f8fafc',
                      border: 'none',
                      borderRadius: '3px',
                      padding: '2px 4px',
                      fontSize: '0.65rem',
                      cursor: 'pointer',
                    }}
                  >
                    {pop.status}
                  </button>
                </div>
                <div style={{ color: '#94a3b8' }}>
                  Hits: <strong style={{ color: '#10b981' }}>{pop.totalHits}</strong>
                </div>
                <div style={{ color: '#94a3b8' }}>
                  Misses: <strong style={{ color: '#f59e0b' }}>{pop.totalMisses}</strong>
                </div>
                <div style={{ color: '#94a3b8' }}>
                  Stale (SWR): <strong style={{ color: '#38bdf8' }}>{pop.totalStaleServed}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tier 2: Regional Cache Shields */}
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
              Regional Shield Tier (Tier 2)
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#10b981' }}>Offload Absorber</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '8px',
            }}
          >
            {regionalTiers.map((reg) => (
              <div
                key={reg.tierId}
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '8px',
                  fontSize: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ fontWeight: 700, color: '#f8fafc' }}>Region {reg.region} Shield</div>
                <div style={{ color: '#94a3b8' }}>
                  Shield Hits: <strong style={{ color: '#10b981' }}>{reg.totalHits}</strong>
                </div>
                <div style={{ color: '#94a3b8' }}>
                  Shield Misses: <strong style={{ color: '#f59e0b' }}>{reg.totalMisses}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tier 3: Origin Server */}
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
              Origin Server (Source of Truth)
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>Backend Target</span>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Total Fetches Incurred:</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc', margin: '4px 0' }}>
              {state.origin.totalRequestsReceived}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Stored Objects: {Object.keys(state.origin.storage).length}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Controls & Traffic Injection */}
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '14px',
        }}
      >
        <h3
          style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#f8fafc', fontWeight: 700 }}
        >
          Interactive Traffic & Chaos Controls
        </h3>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Target URI:
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              style={{
                marginLeft: '4px',
                backgroundColor: '#020617',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '4px 8px',
              }}
            >
              {Object.keys(state.origin.storage).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Client Location:
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value as any)}
              style={{
                marginLeft: '4px',
                backgroundColor: '#020617',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '4px 8px',
              }}
            >
              <option value="US_EAST">US East</option>
              <option value="US_WEST">US West</option>
              <option value="EU_WEST">EU West</option>
              <option value="AP_SOUTH">AP South</option>
            </select>
          </label>

          <button
            onClick={() => onRequest?.(selectedKey, selectedRegion)}
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
            Fetch URI
          </button>

          <button
            onClick={() => onFlashCrowd?.(selectedKey, 15, selectedRegion)}
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
            title="Demonstrates CDN-2 Single-Flight Coalescing vs Cache Stampede"
          >
            🌊 Flash Crowd (15 reqs)
          </button>

          <button
            onClick={() => onPurge?.(selectedKey)}
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
            title="Demonstrates CDN-3 Purge Propagation across all PoPs"
          >
            🧹 Purge Key (CDN-3)
          </button>

          <button
            onClick={() => onUpdateOrigin?.(selectedKey, `PAYLOAD_V${Date.now() % 1000}`)}
            style={{
              backgroundColor: '#047857',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            ✏️ Update Origin Object
          </button>
        </div>
      </div>

      {/* Recent Request Stream */}
      <div
        style={{
          backgroundColor: '#020617',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '14px',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#f8fafc' }}>
          Recent Request Waterfall Logs
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
                <th style={{ padding: '6px' }}>Client Region</th>
                <th style={{ padding: '6px' }}>Edge PoP</th>
                <th style={{ padding: '6px' }}>URI Key</th>
                <th style={{ padding: '6px' }}>Served From</th>
                <th style={{ padding: '6px' }}>Coalesced</th>
              </tr>
            </thead>
            <tbody>
              {state.recentRequestLogs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: '6px' }}>t={log.tick}</td>
                  <td style={{ padding: '6px' }}>{log.clientRegion}</td>
                  <td style={{ padding: '6px' }}>{log.edgePopId}</td>
                  <td style={{ padding: '6px', fontFamily: 'monospace' }}>{log.key}</td>
                  <td style={{ padding: '6px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor:
                          log.servedFrom === 'EDGE_HIT'
                            ? '#064e3b'
                            : log.servedFrom === 'EDGE_STALE_WHILE_REVALIDATE'
                              ? '#78350f'
                              : log.servedFrom === 'REGIONAL_HIT'
                                ? '#1e3a8a'
                                : '#7f1d1d',
                        color:
                          log.servedFrom === 'EDGE_HIT'
                            ? '#34d399'
                            : log.servedFrom === 'EDGE_STALE_WHILE_REVALIDATE'
                              ? '#fbbf24'
                              : log.servedFrom === 'REGIONAL_HIT'
                                ? '#93c5fd'
                                : '#fca5a5',
                      }}
                    >
                      {log.servedFrom}
                    </span>
                  </td>
                  <td style={{ padding: '6px' }}>{log.coalesced ? '✅ Yes' : '—'}</td>
                </tr>
              ))}
              {state.recentRequestLogs.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}
                  >
                    No requests dispatched yet. Use the controls above to trigger requests.
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
