'use client';

import React from 'react';

import { CompareRunConfigSchema, type CompareRunConfig } from '@the-visualizer/contracts';
import { DeterministicRNG, DomainRegistry, divergenceTicks, structuralDiff, type StateDiff } from '@the-visualizer/simulation';

function tickType(domainId: string): string {
  return `${domainId.toUpperCase().replace(/-/g, '_')}_TICK`;
}

interface SharedEvent {
  tick: number;
  type: string;
  payload: Record<string, unknown>;
}

function runSeries(
  domainId: string,
  seed: number,
  ticks: number,
  initialOverride: unknown,
  sharedEvents: SharedEvent[],
): unknown[] {
  const plugin = DomainRegistry.get(domainId);
  if (!plugin) throw new Error(`Unknown domain: ${domainId}`);
  const rng = new DeterministicRNG(seed);
  let state: unknown = initialOverride ?? plugin.createDefaultState();
  const series: unknown[] = [];
  const byTick = new Map<number, SharedEvent[]>();
  for (const e of sharedEvents) {
    const list = byTick.get(e.tick) ?? [];
    list.push(e);
    byTick.set(e.tick, list);
  }
  for (let t = 1; t <= ticks; t++) {
    const tickEv = { id: `compare-tick-${String(t)}`, tick: t, type: tickType(domainId), payload: {} };
    state = plugin.reduceState(state, tickEv, rng).nextState;
    for (const extra of byTick.get(t) ?? []) {
      const ev = { id: `compare-extra-${String(t)}`, tick: t, type: extra.type, payload: extra.payload };
      state = plugin.reduceState(state, ev, rng).nextState;
    }
    series.push(state);
  }
  return series;
}

function StateInspector({ state, depth = 0 }: { state: unknown; depth?: number }): React.JSX.Element {
  const [open, setOpen] = React.useState(depth < 1);
  if (state === null || typeof state !== 'object') {
    return <span style={{ color: '#a5f3fc' }}>{JSON.stringify(state)}</span>;
  }
  const entries = Object.entries(state as Record<string, unknown>);
  if (entries.length === 0) return <span style={{ color: '#94a3b8' }}>{Array.isArray(state) ? '[]' : '{}'}</span>;
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
      >
        {Array.isArray(state) ? `[${entries.length} items] ▸` : `{${entries.length} keys} ▸`}
      </button>
    );
  }
  return (
    <div>
      <button
        onClick={() => setOpen(false)}
        style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
      >
        ▾ collapse
      </button>
      <dl style={{ margin: '4px 0 4px 12px', fontSize: '0.75rem' }}>
        {entries.slice(0, 60).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: '6px', padding: '1px 0' }}>
            <dt style={{ color: '#94a3b8', minWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}:</dt>
            <dd style={{ margin: 0, flex: 1, overflow: 'hidden' }}>
              {depth >= 3 ? (
                <span style={{ color: '#94a3b8' }}>…</span>
              ) : (
                <StateInspector state={v} depth={depth + 1} />
              )}
            </dd>
          </div>
        ))}
        {entries.length > 60 && <div style={{ color: '#94a3b8' }}>… {entries.length - 60} more</div>}
      </dl>
    </div>
  );
}

export function CompareShell({ initialDomain = 'raft' }: { initialDomain?: string }): React.JSX.Element {
  const [domainId, setDomainId] = React.useState(initialDomain);
  const [seedA, setSeedA] = React.useState(111);
  const [seedB, setSeedB] = React.useState(222);
  const [ticks, setTicks] = React.useState(120);
  const [overrideText, setOverrideText] = React.useState('');
  const [eventsText, setEventsText] = React.useState('');
  const [scrub, setScrub] = React.useState(120);

  const parsed = React.useMemo<{ cfg: CompareRunConfig; override: unknown; shared: SharedEvent[] } | { error: string }>(() => {
    const cfg = CompareRunConfigSchema.safeParse({ domainId, seedA, seedB, ticks });
    if (!cfg.success) return { error: 'Invalid compare config.' };
    let override: unknown = undefined;
    if (overrideText.trim()) {
      try {
        const v: unknown = JSON.parse(overrideText);
        if (v === null || typeof v !== 'object' || Array.isArray(v)) return { error: 'Initial-state override must be a JSON object.' };
        override = v;
      } catch {
        return { error: 'Initial-state override is not valid JSON.' };
      }
    }
    let shared: SharedEvent[] = [];
    if (eventsText.trim()) {
      try {
        const v: unknown = JSON.parse(eventsText);
        if (!Array.isArray(v)) return { error: 'Shared events must be a JSON array.' };
        shared = v.slice(0, 200).map((e: unknown) => {
          const rec = e as Record<string, unknown>;
          if (typeof rec['tick'] !== 'number' || typeof rec['type'] !== 'string') throw new Error('bad event');
          const payload = rec['payload'];
          return {
            tick: Math.max(1, Math.floor(rec['tick'] as number)),
            type: String(rec['type']).slice(0, 128),
            payload: payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {},
          };
        });
      } catch {
        return { error: 'Shared events must be [{tick, type, payload}].' };
      }
    }
    return { cfg: cfg.data, override, shared };
  }, [domainId, seedA, seedB, ticks, overrideText, eventsText]);

  const result = React.useMemo<{ seriesA: unknown[]; seriesB: unknown[]; divergent: number[] } | { error: string } | null>(() => {
    if (!('cfg' in parsed)) return null;
    try {
      const seriesA = runSeries(parsed.cfg.domainId, parsed.cfg.seedA, parsed.cfg.ticks, parsed.override, parsed.shared);
      const seriesB = runSeries(parsed.cfg.domainId, parsed.cfg.seedB, parsed.cfg.ticks, parsed.override, parsed.shared);
      return { seriesA, seriesB, divergent: divergenceTicks(seriesA, seriesB) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Compare run failed.' };
    }
  }, [parsed]);

  React.useEffect(() => {
    if (result && 'seriesA' in result) setScrub(result.seriesA.length);
  }, [result]);

  const parseError = 'error' in parsed ? parsed.error : null;
  const resultError = result && 'error' in result ? result.error : null;
  const err = parseError ?? resultError;
  const seriesLen = result && 'seriesA' in result ? result.seriesA.length : 1;
  const atTick = Math.min(Math.max(1, scrub), seriesLen);
  const diffs: StateDiff[] =
    result && 'seriesA' in result
      ? structuralDiff(result.seriesA[atTick - 1], result.seriesB[atTick - 1])
      : [];

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '0.8rem',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
          Domain
          <select value={domainId} onChange={(e) => setDomainId(e.target.value)} style={{ ...inputStyle, marginLeft: '6px' }}>
            {DomainRegistry.list().map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <label style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
          Seed A <input type="number" value={seedA} min={0} onChange={(e) => setSeedA(Number(e.target.value))} style={{ ...inputStyle, width: '100px', marginLeft: '6px' }} />
        </label>
        <label style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
          Seed B <input type="number" value={seedB} min={0} onChange={(e) => setSeedB(Number(e.target.value))} style={{ ...inputStyle, width: '100px', marginLeft: '6px' }} />
        </label>
        <label style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
          Ticks <input type="number" value={ticks} min={1} max={1000} onChange={(e) => setTicks(Number(e.target.value))} style={{ ...inputStyle, width: '80px', marginLeft: '6px' }} />
        </label>
      </div>
      <details style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
        <summary style={{ cursor: 'pointer' }}>Advanced: side-B initial-state override + shared event script (JSON)</summary>
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
          <textarea
            value={overrideText}
            onChange={(e) => setOverrideText(e.target.value)}
            placeholder='{"key": "value"} — replaces side-B initial state'
            rows={3}
            style={{ ...inputStyle, flex: 1, minWidth: '240px', fontFamily: 'monospace' }}
          />
          <textarea
            value={eventsText}
            onChange={(e) => setEventsText(e.target.value)}
            placeholder='[{"tick": 5, "type": "RAFT_PROPOSE", "payload": {}}] — applied to both sides'
            rows={3}
            style={{ ...inputStyle, flex: 1, minWidth: '240px', fontFamily: 'monospace' }}
          />
        </div>
      </details>
      {err && <p style={{ color: '#fca5a5', fontSize: '0.82rem', margin: 0 }}>{err}</p>}
      {result && 'seriesA' in result && (
        <>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '10px 14px' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Shared scrubber</span>
            <input
              type="range"
              min={1}
              max={result.seriesA.length}
              value={atTick}
              onChange={(e) => setScrub(Number(e.target.value))}
              style={{ flex: 1 }}
              aria-label="Shared tick scrubber"
            />
            <span style={{ color: '#f8fafc', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>tick {atTick}</span>
            <span style={{ color: result.divergent.length > 0 ? '#fbbf24' : '#86efac', fontSize: '0.78rem' }}>
              {result.divergent.length > 0 ? `${result.divergent.length} divergent ticks` : 'identical'}
            </span>
          </div>
          {result.divergent.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
              <span style={{ color: '#94a3b8' }}>Jump to divergence:</span>
              {result.divergent.slice(0, 20).map((t) => (
                <button key={t} onClick={() => setScrub(t + 1)} style={{ backgroundColor: '#451a03', color: '#fbbf24', border: '1px solid #92400e', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}>
                  t{t + 1}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {(['A', 'B'] as const).map((side) => (
              <section key={side} style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '12px', overflow: 'auto', maxHeight: '420px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#f8fafc' }}>
                  Side {side} · seed {side === 'A' ? seedA : seedB}
                </h3>
                <StateInspector state={side === 'A' ? result.seriesA[atTick - 1] : result.seriesB[atTick - 1]} />
              </section>
            ))}
          </div>
          <section style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '12px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#f8fafc' }}>
              Field diffs at tick {atTick} ({diffs.length})
            </h3>
            {diffs.length === 0 ? (
              <p style={{ color: '#86efac', fontSize: '0.8rem', margin: 0 }}>No differing fields — runs agree exactly here.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.76rem', color: '#e2e8f0', fontFamily: 'monospace' }}>
                {diffs.slice(0, 60).map((d, i) => (
                  <li key={i}>
                    <span style={{ color: '#fbbf24' }}>{d.path}</span> [{d.kind}]
                    {d.kind === 'changed' && (
                      <span style={{ color: '#94a3b8' }}> {JSON.stringify(d.before)?.slice(0, 80)} → {JSON.stringify(d.after)?.slice(0, 80)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
