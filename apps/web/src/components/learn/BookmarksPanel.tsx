'use client';

import React from 'react';

import type { Bookmark } from '@the-visualizer/contracts';

export function BookmarksPanel({
  bookmarks,
  onJump,
  onRemove,
}: {
  bookmarks: Bookmark[];
  onJump: (bookmark: Bookmark) => void;
  onRemove: (id: string) => void;
}): React.JSX.Element {
  return (
    <section
      aria-label="Bookmarks"
      style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '12px 14px' }}
    >
      <h2 style={{ color: '#f8fafc', fontSize: '0.85rem', margin: '0 0 8px' }}>
        Bookmarks ({bookmarks.length})
      </h2>
      {bookmarks.length === 0 && (
        <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>
          Pin a (domain, tick, config) combination from any timeline scrubber to jump back later.
        </p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {bookmarks.map((b) => (
          <li
            key={b.id}
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
            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>🔖 {b.label}</span>
            <span style={{ color: '#94a3b8' }}>
              {b.domainId}@{b.tick}
            </span>
            {b.note && (
              <span style={{ color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.note}</span>
            )}
            <button
              onClick={() => onJump(b)}
              style={{ backgroundColor: '#334155', color: '#f8fafc', border: 'none', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
            >
              Jump
            </button>
            <button
              onClick={() => onRemove(b.id)}
              aria-label={`Remove bookmark ${b.label}`}
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

let bookmarkSeq = 0;

/** Creates a bookmark record with a collision-free client id (no Date.now in sim paths; UI metadata only). */
export function createBookmark(input: {
  label: string;
  domainId: string;
  tick: number;
  configSnapshot?: Record<string, unknown>;
  note?: string;
}): Bookmark {
  bookmarkSeq += 1;
  return {
    id: `bm-${String(Date.now())}-${String(bookmarkSeq)}`,
    label: input.label,
    domainId: input.domainId,
    tick: input.tick,
    configSnapshot: input.configSnapshot ?? {},
    note: input.note ?? '',
    createdAt: Date.now(),
  };
}
