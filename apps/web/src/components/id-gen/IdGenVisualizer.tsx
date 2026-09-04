'use client';

import React, { useState } from 'react';

import type {
  GeneratedIdRecord,
  IdGenClusterState,
  IdGeneratorType,
  IdWorkerState,
} from '@the-visualizer/simulation';

export interface IdGenVisualizerProps {
  state: IdGenClusterState;
  onGenerate?: (workerId: number, count?: number) => void;
  onInjectClockSkew?: (workerId: number, backwardSkewMs: number) => void;
  onFloodOverflow?: (workerId: number, burstCount: number) => void;
  onAssignDuplicateWorker?: (conflictingWorkerId: number) => void;
  onSwitchGeneratorType?: (type: IdGeneratorType) => void;
}

export function IdGenVisualizer({
  state,
  onGenerate,
  onInjectClockSkew,
  onFloodOverflow,
  onAssignDuplicateWorker,
  onSwitchGeneratorType,
}: IdGenVisualizerProps): React.JSX.Element {
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [sortByValue, setSortByValue] = useState<boolean>(false);

  const workers: IdWorkerState[] = Object.values(state.workers);
  const latestRecord = state.generatedIds[state.generatedIds.length - 1];
  const inspectedRecord =
    state.generatedIds.find((r: GeneratedIdRecord) => r.id === selectedRecordId) || latestRecord;

  const displayList = [...state.generatedIds];
  if (sortByValue) {
    displayList.sort((a, b) => (a.id > b.id ? 1 : -1));
  }

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
            <span>🆔</span> Distributed ID Generation Canvas
            <span
              style={{
                fontSize: '0.75rem',
                backgroundColor: '#1e293b',
                color: '#a78bfa',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              Twitter Snowflake 64-bit & RFC 9562 UUIDv7
            </span>
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Algorithm: <strong>{state.generatorType}</strong> · Total Generated:{' '}
            <strong>{state.generatedIds.length}</strong> · Active Workers:{' '}
            <strong>{workers.length}</strong>
          </span>
        </div>

        {/* Generator Type Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Scheme:</span>
          {(['SNOWFLAKE', 'UUID_V7', 'UUID_V4'] as IdGeneratorType[]).map((type) => (
            <button
              key={type}
              onClick={() => onSwitchGeneratorType?.(type)}
              style={{
                backgroundColor: state.generatorType === type ? '#7c3aed' : '#1e293b',
                color: '#f8fafc',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 10px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {type === 'SNOWFLAKE'
                ? 'Snowflake (64-bit)'
                : type === 'UUID_V7'
                  ? 'UUIDv7 (k-sorted)'
                  : 'UUIDv4 (Random)'}
            </button>
          ))}
        </div>
      </div>

      {/* Real-World Flaw Notice */}
      {state.flawsDemonstrated.clockRegressionRefusalTriggered && (
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
            ⚠️ Known Real-World Safety Behavior Demonstrated (ID-3): Backward Clock Skew Refusal
          </strong>
          <p style={{ margin: '4px 0 0 0', color: '#fde68a' }}>
            Worker detected NTP clock regression (current tick &lt; lastSeenTickMs). To prevent
            sequence collision and guarantee uniqueness, the worker paused until local time caught
            up.
          </p>
        </div>
      )}

      {/* Flagship Visual: 64-Bit Snowflake Bit-Field Decomposition Inspector */}
      {inspectedRecord && inspectedRecord.snowflakeFields && (
        <div
          style={{
            backgroundColor: '#020617',
            border: '1px solid #7c3aed40',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#f8fafc', fontWeight: 700 }}>
              Snowflake 64-Bit Bit-Field Inspector (Decoded ID: {inspectedRecord.id})
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#a78bfa', fontWeight: 600 }}>
              Twitter 64-bit Structure
            </span>
          </div>

          {/* Color-Coded Bit Segments Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr 140px 160px',
              gap: '6px',
              marginBottom: '10px',
            }}
          >
            <div
              style={{
                backgroundColor: '#1e293b',
                padding: '8px',
                borderRadius: '4px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Sign</div>
              <div style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: 700 }}>0</div>
              <div style={{ fontSize: '0.65rem', color: '#64748b' }}>1 bit</div>
            </div>

            <div
              style={{
                backgroundColor: '#1e3a8a',
                padding: '8px',
                borderRadius: '4px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.65rem', color: '#93c5fd' }}>Timestamp Delta (ms)</div>
              <div style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 700 }}>
                +{inspectedRecord.snowflakeFields.timestampDeltaMs} ms
              </div>
              <div style={{ fontSize: '0.65rem', color: '#bfdbfe' }}>41 bits (~69 years)</div>
            </div>

            <div
              style={{
                backgroundColor: '#4c1d95',
                padding: '8px',
                borderRadius: '4px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.65rem', color: '#c4b5fd' }}>Worker / Node ID</div>
              <div style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 700 }}>
                #{inspectedRecord.snowflakeFields.workerId}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#ddd6fe' }}>10 bits (0..1023)</div>
            </div>

            <div
              style={{
                backgroundColor: '#064e3b',
                padding: '8px',
                borderRadius: '4px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.65rem', color: '#6ee7b7' }}>Sequence Counter</div>
              <div style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 700 }}>
                {inspectedRecord.snowflakeFields.sequence} / 4095
              </div>
              <div style={{ fontSize: '0.65rem', color: '#a7f3d0' }}>12 bits (4096/ms)</div>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              padding: '8px 12px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              color: '#cbd5e1',
              overflowX: 'auto',
            }}
          >
            Binary: {inspectedRecord.snowflakeFields.formattedBinary}
          </div>
        </div>
      )}

      {/* Worker Nodes Fleet Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
        }}
      >
        {workers.map((worker) => (
          <div
            key={worker.workerId}
            style={{
              backgroundColor: '#020617',
              border:
                worker.status === 'REFUSING_CLOCK_REGRESSION'
                  ? '1px solid #f59e0b'
                  : '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
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
              <span>
                {worker.name} (ID: {worker.workerId})
              </span>
              <span
                style={{
                  color: worker.status === 'ACTIVE' ? '#10b981' : '#f59e0b',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                }}
              >
                {worker.status}
              </span>
            </div>

            <div style={{ color: '#94a3b8' }}>
              Time: <strong>{worker.currentTickMs} ms</strong> · Seq:{' '}
              <strong>{worker.sequence}</strong> · Generated:{' '}
              <strong>{worker.totalGenerated}</strong>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <button
                onClick={() => onGenerate?.(worker.workerId, 1)}
                style={{
                  flex: 1,
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                +1 ID
              </button>
              <button
                onClick={() => onGenerate?.(worker.workerId, 10)}
                style={{
                  flex: 1,
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                +10 IDs
              </button>
              <button
                onClick={() => onInjectClockSkew?.(worker.workerId, 50)}
                style={{
                  backgroundColor: '#b45309',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                }}
                title="Inject -50ms clock drift to test ID-3 refusal"
              >
                Clock Drift
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Global Chaos Controls */}
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '12px',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>Fleet Chaos:</span>
        <button
          onClick={() => onFloodOverflow?.(1, 4200)}
          style={{
            backgroundColor: '#dc2626',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 12px',
            fontSize: '0.75rem',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          title="Demonstrates ID-4 Sequence Overflow (>4096 IDs/ms rollover)"
        >
          Flood &gt;4096 IDs (ID-4 Overflow Rollover)
        </button>
        <button
          onClick={() => onAssignDuplicateWorker?.(1)}
          style={{
            backgroundColor: '#991b1b',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 12px',
            fontSize: '0.75rem',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          title="Deliberately misconfigure two workers with same workerId"
        >
          Duplicate Worker ID (Collision Hazard)
        </button>

        <label
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            color: '#94a3b8',
          }}
        >
          <input
            type="checkbox"
            checked={sortByValue}
            onChange={(e) => setSortByValue(e.target.checked)}
          />
          Sort Table by Numeric ID Value (Demonstrates k-sortability)
        </label>
      </div>

      {/* Interleaved ID Feed */}
      <div
        style={{
          backgroundColor: '#020617',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '14px',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#f8fafc' }}>
          Interleaved Produced ID Stream (
          {sortByValue ? 'Ordered by ID Value' : 'Chronological Generation Order'})
        </h3>
        <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
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
                <th style={{ padding: '6px' }}>Timestamp (ms)</th>
                <th style={{ padding: '6px' }}>Worker</th>
                <th style={{ padding: '6px' }}>Raw Generated ID</th>
                <th style={{ padding: '6px' }}>Sequence</th>
                <th style={{ padding: '6px' }}>Sortable?</th>
              </tr>
            </thead>
            <tbody>
              {displayList.map((rec: GeneratedIdRecord, idx: number) => (
                <tr
                  key={idx}
                  onClick={() => setSelectedRecordId(rec.id)}
                  style={{
                    borderBottom: '1px solid #0f172a',
                    cursor: 'pointer',
                    backgroundColor: inspectedRecord?.id === rec.id ? '#1e293b' : 'transparent',
                  }}
                >
                  <td style={{ padding: '6px' }}>t={rec.tickMs}</td>
                  <td style={{ padding: '6px', fontWeight: 600 }}>Worker #{rec.workerId}</td>
                  <td style={{ padding: '6px', fontFamily: 'monospace', color: '#a78bfa' }}>
                    {rec.id}
                  </td>
                  <td style={{ padding: '6px' }}>{rec.sequence}</td>
                  <td style={{ padding: '6px' }}>
                    <span
                      style={{ color: rec.isSortable ? '#10b981' : '#f59e0b', fontWeight: 600 }}
                    >
                      {rec.isSortable ? '✅ Yes (k-sortable)' : '❌ No (UUIDv4 random)'}
                    </span>
                  </td>
                </tr>
              ))}
              {displayList.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}
                  >
                    No IDs generated yet. Click +1 ID or +10 IDs on any worker above.
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
