'use client';

import React from 'react';

import type { DomainKey } from '../../app/domain-options';
import { COMPOSITE_PIPELINES } from '../composite/composite-pipelines';

export interface SupportedPair {
  from: DomainKey;
  to: DomainKey;
  label: string;
}

/** Curated v1 pairs: consecutive stages of designed pipelines + specified pairs. */
export function supportedPairs(): SupportedPair[] {
  const pairs = new Map<string, SupportedPair>();
  const add = (from: DomainKey, to: DomainKey, label: string) => {
    const key = `${from}→${to}`;
    if (!pairs.has(key)) pairs.set(key, { from, to, label });
  };
  for (const pipeline of COMPOSITE_PIPELINES) {
    for (let i = 0; i + 1 < pipeline.stages.length; i++) {
      const a = pipeline.stages[i]!;
      const b = pipeline.stages[i + 1]!;
      add(a.domain, b.domain, `${a.name} → ${b.name}`);
    }
  }
  // Pairs specified in prior domain-batch planning.
  add('rate-limiter', 'redis', 'Admission gate → cache tier');
  add('distributed-lock', 'raft', 'Mutual exclusion → consensus log');
  add('llm-pipeline', 'vectordb', 'Retrieval orchestration → vector index');
  add('model-rollout', 'llm-gateway', 'Release control → serving gateway');
  return [...pairs.values()];
}

export function ComposerCanvas(): React.JSX.Element {
  const pairs = React.useMemo(() => supportedPairs(), []);
  const [nodes, setNodes] = React.useState<DomainKey[]>(['rate-limiter', 'redis']);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [playing, setPlaying] = React.useState(false);
  const [traceLog, setTraceLog] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!playing) return;
    if (activeIndex >= nodes.length - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => {
      const next = activeIndex + 1;
      setActiveIndex(next);
      const pair = pairs.find((p) => p.from === nodes[next - 1] && p.to === nodes[next]);
      setTraceLog((log) => [...log.slice(-50), `trace → ${nodes[next]}${pair ? ` (${pair.label})` : ' (custom hop)'}`]);
    }, 900);
    return () => window.clearTimeout(t);
  }, [playing, activeIndex, nodes, pairs]);

  const startTrace = () => {
    setTraceLog(['trace → start']);
    setActiveIndex(0);
    setPlaying(true);
  };

  const appendNode = (domain: DomainKey) => {
    if (nodes.length >= 8 || nodes.includes(domain)) return;
    setNodes([...nodes, domain]);
    setActiveIndex(-1);
    setPlaying(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div
        style={{
          display: 'flex',
          gap: '0',
          alignItems: 'stretch',
          overflowX: 'auto',
          padding: '16px',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
        }}
      >
        {nodes.map((node, i) => (
          <React.Fragment key={`${node}-${String(i)}`}>
            <a
              href={`/${node}`}
              style={{
                minWidth: '130px',
                textAlign: 'center',
                padding: '14px 10px',
                borderRadius: '10px',
                textDecoration: 'none',
                color: '#f8fafc',
                fontSize: '0.8rem',
                fontWeight: 700,
                backgroundColor: i === activeIndex ? '#4f46e5' : '#1e293b',
                border: i === activeIndex ? '2px solid #a5b4fc' : '1px solid #334155',
              }}
            >
              {node}
              <div style={{ fontWeight: 400, fontSize: '0.68rem', color: '#94a3b8', marginTop: '4px' }}>
                click for detail view
              </div>
            </a>
            {i < nodes.length - 1 && (
              <div style={{ alignSelf: 'center', padding: '0 6px', color: i < activeIndex ? '#86efac' : '#475569', fontSize: '1.2rem' }}>
                →
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={startTrace}
          disabled={playing}
          style={{ backgroundColor: playing ? '#1e293b' : '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 700, cursor: playing ? 'default' : 'pointer' }}
        >
          {playing ? 'Tracing…' : '▶ Run request trace'}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setActiveIndex(-1);
            setTraceLog([]);
          }}
          style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer' }}
        >
          Reset
        </button>
        <select
          aria-label="Append a supported domain"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) appendNode(e.target.value as DomainKey);
            e.target.value = '';
          }}
          style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px' }}
        >
          <option value="">+ append domain…</option>
          {pairs
            .filter((p) => nodes.length === 0 || p.from === nodes[nodes.length - 1])
            .map((p) => (
              <option key={`${p.from}→${p.to}`} value={p.to}>
                {p.to} ({p.label})
              </option>
            ))}
        </select>
        <button
          onClick={() => setNodes(nodes.slice(0, -1))}
          disabled={nodes.length <= 1}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}
        >
          Remove last
        </button>
      </div>
      <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '10px', padding: '12px 14px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8', minHeight: '90px' }}>
        {traceLog.length === 0 ? (
          <span>Trace output appears here as the request flows hop by hop. Only curated supported pairs can be appended.</span>
        ) : (
          traceLog.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0 }}>
        v1 scope: curated supported pairs only — arbitrary domain wiring is intentionally unavailable.
      </p>
    </div>
  );
}
