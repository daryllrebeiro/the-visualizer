'use client';

import React from 'react';

import type { SessionTimelineEntry } from '@the-visualizer/contracts';

const KIND_LABEL: Record<SessionTimelineEntry['actionKind'], string> = {
  CONFIG_CHANGE: 'Config',
  CHAOS_INJECT: 'Chaos',
  SCENARIO_LOAD: 'Scenario',
  DOMAIN_SWITCH: 'Domain',
  RESET: 'Reset',
  BOOKMARK: 'Bookmark',
};

export function SessionHistoryPanel({
  entries,
  onJump,
  onClear,
}: {
  entries: SessionTimelineEntry[];
  onJump: (entry: SessionTimelineEntry) => void;
  onClear: () => void;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(true);
  return (
    <section
      aria-label="Session history"
      style={{
        border: '1px solid #334155',
        borderRadius: '10px',
        backgroundColor: '#0f172a',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          color: '#f8fafc',
          fontWeight: 700,
          fontSize: '0.85rem',
          cursor: 'pointer',
        }}
      >
        <span>
          Session history ({entries.length})
        </span>
        <span style={{ color: '#94a3b8' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {entries.length === 0 && (
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>
              No actions recorded yet this session. Switch domains, load scenarios, or inject chaos.
            </p>
          )}
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[...entries].reverse().map((e) => (
              <li
                key={e.seq}
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  fontSize: '0.78rem',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  padding: '6px 10px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    color: '#38bdf8',
                    border: '1px solid #38bdf855',
                    borderRadius: '4px',
                    padding: '1px 5px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {KIND_LABEL[e.actionKind]}
                </span>
                <span style={{ color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.label}
                </span>
                <span style={{ color: '#94a3b8' }}>
                  {e.domainId}@{e.frameRef}
                </span>
                <button
                  onClick={() => onJump(e)}
                  style={{
                    backgroundColor: '#334155',
                    color: '#f8fafc',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  Jump
                </button>
              </li>
            ))}
          </ol>
          {entries.length > 0 && (
            <button
              onClick={onClear}
              style={{
                alignSelf: 'flex-start',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '0.75rem',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Clear session history
            </button>
          )}
        </div>
      )}
    </section>
  );
}
