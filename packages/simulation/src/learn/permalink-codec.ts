import { PermalinkPayloadV2Schema, type PermalinkPayloadV2 } from '@the-visualizer/contracts';

import { DomainRegistry } from '../domains/registry.js';
import { DeterministicRNG } from '../prng/deterministic-rng.js';

export interface PermalinkReplayResult {
  domainId: string;
  seed: number;
  finalTick: number;
  state: unknown;
  violations: Array<{ name: string; description: string; tick: number }>;
}

function base64UrlEncode(json: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf8');
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
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
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
