'use client';

import React from 'react';

import type { PermalinkPayloadV2 } from '@the-visualizer/contracts';
import { decodePermalink, encodePermalink } from '@the-visualizer/simulation';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const INLINE_URL_LIMIT = 6000;

/**
 * Shares a deterministic scenario: small payloads encode self-contained in
 * `?p=`, large ones go through the Redis-backed short-link backend.
 * Decoded sequences are validated against the contract schema on load.
 */
export function ShareScenarioButton({
  domainId,
  seed,
  events,
}: {
  domainId: string;
  seed: number;
  events: Array<{ tick: number; type: string; payload: Record<string, unknown> }>;
}): React.JSX.Element {
  const [message, setMessage] = React.useState<string | null>(null);

  const share = async () => {
    setMessage(null);
    const payload: PermalinkPayloadV2 = { v: 2, domainId, seed, events };
    let encoded: string;
    try {
      encoded = encodePermalink(payload);
    } catch {
      setMessage('Could not encode this scenario.');
      return;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const inlineUrl = `${origin}/${domainId}?p=${encoded}`;
    if (inlineUrl.length <= INLINE_URL_LIMIT) {
      await copyText(inlineUrl);
      setMessage('Self-contained permalink copied — replay it anywhere, no backend needed.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/learn/short-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });
      const body = (await res.json()) as { success: boolean; id?: string };
      if (!res.ok || !body.success || !body.id) {
        setMessage('Short-link backend failed; try a smaller event sequence.');
        return;
      }
      // Short links resolve server-side, then replay the identical sequence.
      const shortUrl = `${origin}/${domainId}?short=${body.id}`;
      await copyText(shortUrl);
      setMessage('Short link copied — resolves to the same deterministic replay.');
    } catch {
      setMessage('Short-link backend unreachable.');
    }
  };

  return (
    <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
      <button
        onClick={() => void share()}
        title="Copy a shareable permalink: seed + event sequence, replayed deterministically"
        style={{ backgroundColor: '#0e7490', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}
      >
        🔗 Share scenario
      </button>
      {message && <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{message}</span>}
    </span>
  );
}

async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to prompt-less failure
    }
  }
}

/** Resolves `?p=` or `?short=` from the current URL into a validated payload. */
export async function resolveIncomingPermalink(search: string): Promise<PermalinkPayloadV2 | null> {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const encoded = params.get('p');
  if (encoded) return decodePermalink(encoded);
  const shortId = params.get('short');
  if (!shortId || !/^[A-Za-z0-9_-]{10}$/.test(shortId)) return null;
  try {
    const res = await fetch(`${API_URL}/learn/short-links/${shortId}`);
    const body = (await res.json()) as { success: boolean; payload?: PermalinkPayloadV2 };
    return res.ok && body.success ? (body.payload ?? null) : null;
  } catch {
    return null;
  }
}
