import { describe, expect, it } from 'vitest';

import { decodePermalink, encodePermalink, replayPermalink } from '../index.js';

/**
 * Adversarial permalink coverage (hardening audit Part 3).
 * A permalink is an untrusted input channel: every payload below is something
 * an attacker can craft. Decode must reject malformed input without throwing;
 * replay must never pollute prototypes or crash on foreign event types.
 */
function b64url(json: string): string {
  return Buffer.from(json, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('permalink security: adversarial decode', () => {
  const rejected: Array<[string, string]> = [
    ['wrong-types', b64url(JSON.stringify({ v: 2, domainId: 'kafka', seed: 1, events: [{ tick: 'x', type: 42, payload: [] }] }))],
    ['negative-tick', b64url(JSON.stringify({ v: 2, domainId: 'kafka', seed: 1, events: [{ tick: -5, type: 'KAFKA_TICK', payload: {} }] }))],
    ['oversize-events', b64url(JSON.stringify({ v: 2, domainId: 'kafka', seed: 1, events: Array.from({ length: 501 }, (_, i) => ({ tick: i, type: 'KAFKA_TICK', payload: {} })) }))],
    ['bad-seed', b64url(JSON.stringify({ v: 2, domainId: 'kafka', seed: -1, events: [] }))],
    ['bad-version', b64url(JSON.stringify({ v: 9, domainId: 'kafka', seed: 1, events: [] }))],
    ['huge-string', b64url(JSON.stringify({ v: 2, domainId: 'kafka', seed: 1, events: [{ tick: 1, type: 'KAFKA_TICK', payload: { blob: 'x'.repeat(400000) } }] }))],
    ['truncated-b64', b64url(JSON.stringify({ v: 2, domainId: 'kafka' })).slice(0, 10)],
    ['not-json-b64', b64url('this is not json{{{')],
    ['empty', ''],
    ['oversize-string', 'x'.repeat(200001)],
  ];

  it.each(rejected)('rejects %s without throwing', (_name, encoded) => {
    expect(() => decodePermalink(encoded)).not.toThrow();
    expect(decodePermalink(encoded)).toBeNull();
  });

  it('rejects an unknown domain at replay time', () => {
    const decoded = decodePermalink(encodePermalink({ v: 2, domainId: 'nonexistent-domain', seed: 1, events: [] }));
    expect(decoded).not.toBeNull();
    expect(() => replayPermalink(decoded!)).toThrow(/Unknown domain/);
  });

  it('survives foreign-domain and proto-named event types without polluting Object.prototype', () => {
    const res = replayPermalink({
      v: 2,
      domainId: 'kafka',
      seed: 5,
      events: [
        { tick: 1, type: 'RAFT_REQUEST_VOTE', payload: { term: 9999, candidate: 'evil' } },
        { tick: 2, type: 'KAFKA_TICK', payload: { __proto__: { polluted: true } } },
        { tick: 3, type: '__proto__', payload: {} },
      ],
    });
    expect(res.finalTick).toBe(3);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});
