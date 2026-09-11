import { PermalinkPayloadV2Schema, type PermalinkPayloadV2 } from '@the-visualizer/contracts';

import { DomainRegistry } from '../domains/registry.js';
import { DeterministicRNG } from '../prng/deterministic-rng.js';
import { canonicalStringify, contentHash } from '../shared/primitives.js';

export interface PermalinkReplayResult {
  domainId: string;
  seed: number;
  finalTick: number;
  state: unknown;
  violations: Array<{ name: string; description: string; tick: number }>;
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Builds the inverse lookup table for base64 decoding. */
function b64Inverse(): number[] {
  const table = new Array<number>(128).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) table[B64_ALPHABET.charCodeAt(i)] = i;
  return table;
}

const B64_INV = b64Inverse();

/**
 * Portable base64url codec: `TextEncoder`/`TextDecoder` plus a lookup table.
 * No `Buffer`, no `btoa`/`atob` — identical output on Node, browsers, workers,
 * and any future WASM host.
 */
function base64EncodeBytes(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64_ALPHABET[(n >>> 18) & 63]! + B64_ALPHABET[(n >>> 12) & 63]! + B64_ALPHABET[(n >>> 6) & 63]! + B64_ALPHABET[n & 63]!;
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const n = (bytes[i] ?? 0) << 16;
    out += B64_ALPHABET[(n >>> 18) & 63]! + B64_ALPHABET[(n >>> 12) & 63]! + '==';
  } else if (remaining === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64_ALPHABET[(n >>> 18) & 63]! + B64_ALPHABET[(n >>> 12) & 63]! + B64_ALPHABET[(n >>> 6) & 63]! + '=';
  }
  return out;
}

function base64DecodeToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const out: number[] = [];
  for (let i = 0; i + 3 < clean.length + 1; i += 4) {
    const a = B64_INV[clean.charCodeAt(i)] ?? -1;
    const b = B64_INV[clean.charCodeAt(i + 1)] ?? -1;
    const c = clean[i + 2] === '=' ? 0 : (B64_INV[clean.charCodeAt(i + 2)] ?? -1);
    const d = clean[i + 3] === '=' ? 0 : (B64_INV[clean.charCodeAt(i + 3)] ?? -1);
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('Invalid base64');
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out.push((n >>> 16) & 255);
    if (clean[i + 2] !== '=') out.push((n >>> 8) & 255);
    if (clean[i + 3] !== '=') out.push(n & 255);
  }
  return Uint8Array.from(out);
}

function base64UrlEncode(json: string): string {
  const bytes = new TextEncoder().encode(json);
  return base64EncodeBytes(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  return new TextDecoder().decode(base64DecodeToBytes(base64));
}

/** Encodes a validated permalink payload to a URL-safe string. */
export function encodePermalink(payload: PermalinkPayloadV2): string {
  const parsed = PermalinkPayloadV2Schema.parse(payload);
  return base64UrlEncode(JSON.stringify(parsed));
}

/**
 * Decodes + validates an untrusted permalink string through the exact contract
 * schema used for persisted payloads. Returns null on any failure — callers
 * must treat the result as untrusted input either way.
 */
export function decodePermalink(encoded: string): PermalinkPayloadV2 | null {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > 200000) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(base64UrlDecode(encoded));
    const result = PermalinkPayloadV2Schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Replays a permalink payload through the domain's pure reducer — the same
 * `seed + ordered events → state` path the gateway uses for
 * INTENT_DOMAIN_ACTION (see apps/ws-gateway runner): each stored event becomes
 * `{ id, tick, type, payload }` applied in tick order with a fresh seeded RNG.
 */
export function replayPermalink(payload: PermalinkPayloadV2): PermalinkReplayResult {
  const parsed = PermalinkPayloadV2Schema.parse(payload);
  const plugin = DomainRegistry.get(parsed.domainId);
  if (!plugin) {
    throw new Error(`Unknown domain in permalink: ${parsed.domainId}`);
  }
  const rng = new DeterministicRNG(parsed.seed);
  let state: unknown = plugin.createDefaultState();
  const violations: PermalinkReplayResult['violations'] = [];
  const ordered = [...parsed.events].sort((a, b) => a.tick - b.tick);
  let finalTick = 0;
  for (const [index, stored] of ordered.entries()) {
    const ev = {
      id: `permalink-${String(index)}`,
      tick: stored.tick,
      type: stored.type,
      payload: stored.payload as Record<string, unknown>,
    };
    const res = plugin.reduceState(state, ev, rng);
    state = res.nextState;
    finalTick = stored.tick;
    const check = plugin.validateInvariants(state);
    if (!check.passed && check.violation) {
      violations.push({ ...check.violation, tick: stored.tick });
      break;
    }
  }
  return { domainId: parsed.domainId, seed: parsed.seed, finalTick, state, violations };
}

/** Canonical JSON with sorted keys — byte-stable across replays. */
export function canonicalJson(value: unknown): string {
  return canonicalStringify(value);
}

/**
 * Content address for a permalink payload. Two payloads that replay to the
 * same state share a key, which is what backs server-side replay de-duplication
 * (Phase 3 replay persistence).
 */
export function permalinkContentHash(payload: PermalinkPayloadV2): string {
  return contentHash(PermalinkPayloadV2Schema.parse(payload));
}
