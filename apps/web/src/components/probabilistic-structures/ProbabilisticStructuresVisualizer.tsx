'use client';

import React, { useState } from 'react';

import type {
  ProbabilisticStructuresClusterState,
  ProbabilisticStructuresSimEvent,
} from '@the-visualizer/simulation';
import { Badge, ControlButton, DataTable, Panel, StatRow } from '../new-domains/shared';

export interface ProbabilisticStructuresVisualizerProps {
  state: ProbabilisticStructuresClusterState;
  dispatch: (event: ProbabilisticStructuresSimEvent) => void;
}

function hllStandardError(m: number): number {
  return 1.04 / Math.sqrt(m);
}

export function ProbabilisticStructuresVisualizer({
  state,
  dispatch,
}: ProbabilisticStructuresVisualizerProps): React.JSX.Element {
  const [element, setElement] = useState('');
  const ev = (type: ProbabilisticStructuresSimEvent['type'], payload: Record<string, unknown>): void => {
    dispatch({ id: `ps-${Math.random().toString(36).slice(2, 8)}`, tick: state.tick + 1, type, payload } as ProbabilisticStructuresSimEvent);
  };

  const bloomSetBits = state.bloom.bits.reduce((a, b) => a + b, 0);
  const bloomFill = bloomSetBits / state.bloom.m;
  // Theoretical FP rate: (1 - e^(-kn/m))^k with n = inserted count.
  const n = state.distinctInserted;
  const theoreticalFp =
    n === 0 ? 0 : Math.pow(1 - Math.exp((-state.bloom.k * n) / state.bloom.m), state.bloom.k);
  const probes = state.stats.bloomTruePositives + state.stats.bloomFalsePositives + state.stats.bloomLookupNegatives;
  const measuredFp = probes > 0 ? state.stats.bloomFalsePositives / probes : 0;

  const hllRegistersHot = state.hll.registers.filter((r) => r > 0).length;
  const registerMax = Math.max(1, ...state.hll.registers);
  const hllErrorPct = ((Math.abs(hllEstimateOf(state) - n) / Math.max(1, n)) * 100).toFixed(2);
  const hllSigma = hllStandardError(state.hll.m);
  const hllEstimateDisplay = hllEstimateOf(state);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Panel
        title="Probabilistic Data Structures — 5 Structures, One Stream"
        subtitle={`tick ${state.tick} · ${state.distinctInserted} distinct inserted · ${Object.values(state.streamCounts).reduce((a, b) => a + b, 0)} total`}
        accent="#10b981"
        right={<ControlButton label="Tick" onClick={() => ev('PROB_TICK', {})} />}
      >
        <StatRow
          items={[
            { label: 'Distinct', value: String(n) },
            { label: 'Cuckoo kicks', value: String(state.stats.cuckooKicks) },
            { label: 'Cuckoo rejected', value: String(state.cuckoo.rejectedInserts), color: state.cuckoo.rejectedInserts > 0 ? '#f59e0b' : undefined },
            { label: 'CBF deletions', value: String(state.stats.countingBloomDeletions) },
          ]}
        />
      </Panel>

      <Panel title="Feed the stream" accent="#38bdf8">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            value={element}
            onChange={(e) => setElement(e.target.value)}
            placeholder="element (e.g. user-42)"
            style={{
              flex: 1,
              minWidth: '160px',
              backgroundColor: '#020617',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 10px',
              color: '#e2e8f0',
              fontSize: '0.8rem',
            }}
          />
          <ControlButton
            label="Insert"
            tone="success"
            disabled={element.trim().length === 0}
            onClick={() => {
              ev('PROB_INSERT_BATCH', { elements: [element.trim()] });
              setElement('');
            }}
          />
          <ControlButton
            label="Lookup"
            disabled={element.trim().length === 0}
            onClick={() => ev('PROB_LOOKUP', { element: element.trim() })}
          />
          <ControlButton
            label="Delete (counting + cuckoo only)"
            tone="danger"
            disabled={element.trim().length === 0}
            onClick={() => ev('PROB_DELETE', { element: element.trim() })}
          />
          <ControlButton label="Insert 200 random" onClick={() => ev('PROB_INSERT_BATCH', { elements: Array.from({ length: 200 }, (_, i) => `rand-${i}`) })} />
        </div>
      </Panel>

      {state.lastOp && (
        <Panel
          title={`Last op: ${state.lastOp.op} "${state.lastOp.element}"`}
          accent={state.lastOp.note ? '#f59e0b' : '#38bdf8'}
        >
          <StatRow
            items={[
              { label: 'Bloom', value: state.lastOp.bloom === undefined ? '—' : state.lastOp.bloom ? 'POSITIVE' : 'negative', color: state.lastOp.bloom ? '#10b981' : undefined },
              { label: 'Counting', value: state.lastOp.countingBloom === undefined ? '—' : state.lastOp.countingBloom ? 'POSITIVE' : 'negative' },
              { label: 'Cuckoo', value: state.lastOp.cuckoo === undefined ? '—' : state.lastOp.cuckoo ? 'POSITIVE' : 'negative' },
              ...(state.lastOp.hllEstimate !== undefined
                ? [{ label: 'HLL est', value: String(state.lastOp.hllEstimate) }]
                : []),
              ...(state.lastOp.cmsEstimate !== undefined
                ? [{ label: 'CMS est', value: String(state.lastOp.cmsEstimate) }]
                : []),
            ]}
          />
          {state.lastOp.note && <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: '4px' }}>{state.lastOp.note}</div>}
        </Panel>
      )}

      <Panel title="Comparison table — memory vs accuracy vs capability" accent="#f59e0b">
        <DataTable
          headers={['structure', 'memory (bits)', 'supports delete', 'accuracy signal', 'measured']}
          rows={[
            [
              'Standard Bloom',
              `${state.bloom.m}`,
              '✗ (bit-clearing hazard)',
              `theoretical FP ${(theoreticalFp * 100).toFixed(2)}%`,
              `${(measuredFp * 100).toFixed(2)}% FP on absent probes`,
            ],
            [
              'Counting Bloom',
              `${state.countingBloom.m * 4}`,
              '✓ (PROB-2 guarded)',
              `4-bit counters, ${state.countingBloom.counters.filter((c) => c > 0).length} active`,
              `${state.stats.countingBloomDeletions} safe deletions`,
            ],
            [
              'Cuckoo filter',
              `${state.cuckoo.bucketsCount * state.cuckoo.slotsPerBucket * 12}`,
              '✓ (fingerprint removal)',
              `${state.cuckoo.kickLog.length} kicks logged`,
              `${state.cuckoo.rejectedInserts} rejected (surfaced)`,
            ],
            [
              'HyperLogLog',
              `${state.hll.m * 6}`,
              '✗',
              `σ = 1.04/√m = ${(hllSigma * 100).toFixed(2)}%`,
              `est ${hllEstimateDisplay} vs true ${n} (${hllErrorPct}% off)`,
            ],
            [
              'Count-Min Sketch',
              `${state.cms.rows * state.cms.width * 16}`,
              '✗',
              'one-sided error: overestimates only',
              `${Object.keys(state.streamCounts).length} keys tracked`,
            ],
          ]}
        />
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Panel title="Bloom bit array (live)" accent="#38bdf8">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px' }}>
            {state.bloom.bits
              .filter((_, i) => i % Math.max(1, Math.ceil(state.bloom.m / 512)) === 0)
              .map((bit, i) => (
                <div
                  key={i}
                  title={`bit ${i}`}
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '2px',
                    backgroundColor: bit === 1 ? '#38bdf8' : '#1e293b',
                  }}
                />
              ))}
          </div>
          <div style={{ marginTop: '6px', fontSize: '0.7rem', color: '#94a3b8' }}>
            fill factor {(bloomFill * 100).toFixed(1)}% · k={state.bloom.k} hashes (Kirsch-Mitzenmacher double hashing)
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>m:</span>
            {[1024, 2048, 4096, 8192].map((m) => (
              <ControlButton key={m} label={String(m)} tone={state.bloom.m === m ? 'success' : 'default'} onClick={() => ev('PROB_SET_BLOOM_PARAMS', { m })} />
            ))}
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '6px' }}>k:</span>
            {[3, 5, 7, 10].map((k) => (
              <ControlButton key={k} label={String(k)} tone={state.bloom.k === k ? 'success' : 'default'} onClick={() => ev('PROB_SET_BLOOM_PARAMS', { k })} />
            ))}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px' }}>
            Parameter changes reset the stream (documented semantics — a mid-stream rebuild would silently drop elements).
          </div>
        </Panel>

        <Panel title="HyperLogLog registers (leading-zero mechanism)" accent="#8b5cf6">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px' }}>
            {state.hll.registers
              .filter((_, i) => i % Math.max(1, Math.ceil(state.hll.m / 256)) === 0)
              .map((r, i) => (
                <div
                  key={i}
                  title={`register ${i}: ρ=${r}`}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '2px',
                    backgroundColor:
                      r === 0 ? '#1e293b' : `rgba(139, 92, 246, ${Math.min(1, 0.25 + (r / registerMax) * 0.75)})`,
                  }}
                />
              ))}
          </div>
          <div style={{ marginTop: '6px', fontSize: '0.7rem', color: '#94a3b8' }}>
            {hllRegistersHot}/{state.hll.m} registers warm · est = α_m·m²·(Σ2^-M)^-1 ={' '}
            <strong style={{ color: '#8b5cf6' }}>{hllEstimateDisplay}</strong> (true {n})
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>m:</span>
            {[256, 1024, 4096].map((m) => (
              <ControlButton key={m} label={String(m)} tone={state.hll.m === m ? 'success' : 'default'} onClick={() => ev('PROB_SET_HLL_M', { m })} />
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Recent stream operations" accent="#64748b">
        <DataTable
          headers={['op', 'element', 'bloom', 'counting', 'cuckoo', 'note']}
          rows={[...state.recentOps]
            .reverse()
            .slice(0, 12)
            .map((op) => [
              op.op,
              <code key="e" style={{ color: '#94a3b8' }}>{op.element}</code>,
              op.bloom === undefined ? '—' : op.bloom ? 'hit' : 'miss',
              op.countingBloom === undefined ? '—' : op.countingBloom ? 'hit' : 'miss',
              op.cuckoo === undefined ? '—' : op.cuckoo ? 'hit' : 'miss',
              op.note ?? '',
            ])}
          maxHeight="200px"
        />
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <Badge text="PROB-1: no false negatives (Bloom family)" color="#10b981" />
          <Badge text="PROB-4: CMS overestimates only" color="#38bdf8" />
        </div>
      </Panel>
    </div>
  );
}

function hllEstimateOf(state: ProbabilisticStructuresClusterState): number {
  // Display-only recompute (mirrors hllEstimate in the algorithms module).
  const m = state.hll.m;
  const alpha = m === 16 ? 0.673 : m === 32 ? 0.697 : m === 64 ? 0.709 : 0.7213 / (1 + 1.079 / m);
  let sum = 0;
  let zeros = 0;
  for (const r of state.hll.registers) {
    sum += Math.pow(2, -r);
    if (r === 0) zeros++;
  }
  let raw = alpha * m * m * Math.pow(sum, -1);
  if (raw <= 2.5 * m && zeros > 0) {
    raw = m * Math.log(m / zeros);
  }
  return Math.round(raw * 1e4) / 1e4;
}
