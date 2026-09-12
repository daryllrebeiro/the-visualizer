'use client';

import React from 'react';

import { DomainRegistry } from '@the-visualizer/simulation';

import { useSimulationStore } from '../../stores/simulation-store';

/**
 * Generic canvas for any registered domain without a bespoke visualizer
 * (currently `rag` and `agents`, plus any Plugin-SDK domain added later).
 *
 * It is deliberately store-driven rather than prop-driven: it owns no state of
 * its own and works for domains the monolithic shell has never heard of, which
 * is what lets the Plugin SDK and registry scale without per-domain wiring.
 */
export function GenericDomainCanvas({ domainId }: { domainId: string }): React.JSX.Element {
  const storeDomain = useSimulationStore((s) => s.domainId);
  const state = useSimulationStore((s) => s.state);
  const violation = useSimulationStore((s) => s.violation);
  const isPaused = useSimulationStore((s) => s.isPaused);
  const setDomain = useSimulationStore((s) => s.setDomain);
  const step = useSimulationStore((s) => s.step);
  const reset = useSimulationStore((s) => s.reset);
  const togglePause = useSimulationStore((s) => s.togglePause);

  const meta = React.useMemo(() => DomainRegistry.list().find((m) => m.id === domainId), [domainId]);

  React.useEffect(() => {
    if (storeDomain !== domainId) setDomain(domainId);
  }, [domainId, storeDomain, setDomain]);

  React.useEffect(() => {
    if (isPaused || storeDomain !== domainId) return;
    const timer = window.setInterval(() => step(1), 250);
    return () => window.clearInterval(timer);
  }, [isPaused, step, storeDomain, domainId]);

  const active = storeDomain === domainId;
  const tick = active && state !== null && typeof state === 'object' ? Number((state as { tick?: number }).tick ?? 0) : 0;

  return (
    <section
      aria-label={`${meta?.name ?? domainId} simulation`}
      style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.4rem' }}>{meta?.icon ?? '🧩'}</span>
        <strong style={{ color: '#f8fafc' }}>{meta?.name ?? domainId}</strong>
        <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
          {meta?.fidelityDisplayName ?? meta?.fidelityTag} · tick {tick}
        </span>
        <span style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button
            onClick={() => step(10)}
            style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            +10 ticks
          </button>
          <button
            onClick={togglePause}
            style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button
            onClick={() => reset()}
            style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Reset
          </button>
        </span>
      </header>

      {violation && (
        <div role="alert" style={{ backgroundColor: '#450a0a', border: '1px solid #b91c1c', borderRadius: '8px', padding: '10px 12px', color: '#fecaca', fontSize: '0.82rem' }}>
          <strong>Invariant violation: {violation.name}</strong> — {violation.description}
        </div>
      )}

      <pre
        tabIndex={0}
        aria-label="Simulation state (JSON)"
        style={{
          margin: 0,
          padding: '14px',
          backgroundColor: '#020617',
          border: '1px solid #1e293b',
          borderRadius: '10px',
          color: '#a5f3fc',
          fontSize: '0.72rem',
          maxHeight: '520px',
          overflow: 'auto',
        }}
      >
        {active && state !== null && state !== undefined
          ? JSON.stringify(state, null, 2).slice(0, 20000)
          : 'Loading domain state…'}
      </pre>
    </section>
  );
}
