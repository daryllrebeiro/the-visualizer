import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  decodePermalink,
  DeterministicRNG,
  divergenceTicks,
  DomainRegistry,
  dueCards,
  encodePermalink,
  replayPermalink,
  reviewCard,
  SessionTimelineBuilder,
  structuralDiff,
} from '../index.js';

function tickType(domainId: string): string {
  return `${domainId.toUpperCase().replace(/-/g, '_')}_TICK`;
}

describe('permalink determinism (feature 4)', () => {
  it('replayed twice produces byte-identical state', () => {
    const payload = {
      v: 2 as const,
      domainId: 'rate-limiter',
      seed: 12345,
      events: Array.from({ length: 25 }, (_, i) => ({
        tick: i + 1,
        type: tickType('rate-limiter'),
        payload: {},
      })),
    };
    const encoded = encodePermalink(payload);
    const first = replayPermalink(decodePermalink(encoded)!);
    const second = replayPermalink(decodePermalink(encoded)!);
    expect(canonicalJson(first.state)).toBe(canonicalJson(second.state));
    expect(first.finalTick).toBe(25);
    expect(first.violations).toEqual([]);
  });

  it('rejects untrusted permalink input without throwing', () => {
    expect(decodePermalink('')).toBeNull();
    expect(decodePermalink('!!!not-base64!!!')).toBeNull();
    expect(decodePermalink('e30')).toBeNull(); // valid base64, wrong shape
    expect(decodePermalink('x'.repeat(200001))).toBeNull();
  });

  it('byte-identical across raft replays with chaos-free ticks', () => {
    const payload = {
      v: 2 as const,
      domainId: 'raft',
      seed: 7,
      events: Array.from({ length: 10 }, (_, i) => ({
        tick: i + 1,
        type: tickType('raft'),
        payload: {},
      })),
    };
    const a = canonicalJson(replayPermalink(payload).state);
    const b = canonicalJson(replayPermalink(payload).state);
    expect(a).toBe(b);
  });

  // Fidelity guard: self-comparison of two replays cannot detect a codec that
  // systematically drops or reorders events. Assert the replayed sequence
  // consumed every encoded event and ended on the last tick.
  it('replays every encoded event (fidelity, not just self-consistency)', () => {
    for (const domainId of ['kafka', 'raft', 'llm-serving', 'search-index', 'merkle-trees']) {
      const eventCount = 40;
      const events = Array.from({ length: eventCount }, (_, i) => ({
        tick: i + 1,
        type: tickType(domainId),
        payload: {},
      }));
      const payload = { v: 2 as const, domainId, seed: 424242, events };
      const result = replayPermalink(decodePermalink(encodePermalink(payload))!);
      expect(result.domainId).toBe(domainId);
      expect(result.finalTick, `${domainId}: last tick must be consumed`).toBe(eventCount);
      // A dropped/reordered final event leaves the state frozen one tick early.
      const truncated = replayPermalink({
        ...payload,
        events: events.slice(0, -1),
      });
      expect(
        canonicalJson(result.state),
        `${domainId}: dropping the last event must change the final state`,
      ).not.toBe(canonicalJson(truncated.state));
    }
  });
});

describe('structural diff determinism (feature 8)', () => {
  it('identical configs produce zero diverging fields', () => {
    const plugin = DomainRegistry.get('rate-limiter')!;
    const seriesA: unknown[] = [];
    const seriesB: unknown[] = [];
    let sa: unknown = plugin.createDefaultState();
    let sb: unknown = plugin.createDefaultState();
    for (let t = 1; t <= 20; t++) {
      const ev = { id: `t-${String(t)}`, tick: t, type: tickType('rate-limiter'), payload: {} };
      sa = plugin.reduceState(sa, ev, new DeterministicRNG(99)).nextState;
      sb = plugin.reduceState(sb, ev, new DeterministicRNG(99)).nextState;
      seriesA.push(sa);
      seriesB.push(sb);
    }
    expect(divergenceTicks(seriesA, seriesB)).toEqual([]);
    expect(structuralDiff(seriesA[19], seriesB[19])).toEqual([]);
  });

  it('flags a mutated field with an exact path', () => {
    const before = { tick: 1, nested: { count: 2, list: [1, 2] } };
    const after = { tick: 1, nested: { count: 3, list: [1, 2, 3] } };
    const diffs = structuralDiff(before, after);
    const paths = diffs.map((d) => d.path).sort();
    expect(paths).toEqual(['$.nested.count', '$.nested.list[2]']);
  });
});

describe('challenge violation detection (feature 10)', () => {
  it('replays a boundary burst into the RL-3 flawed state, byte-identically', () => {
    // RL-3 is a pedagogical flaw: the plugin wrapper intentionally does NOT
    // surface it as a halting violation, so the test asserts the engine
    // reaches the flawed state flag the challenge asks users to trigger.
    const payload = {
      v: 2 as const,
      domainId: 'rate-limiter',
      seed: 12345,
      events: [
        { tick: 9, type: 'RATE_LIMITER_BURST', payload: { clientId: 'client-1', count: 10 } },
        { tick: 11, type: 'RATE_LIMITER_BURST', payload: { clientId: 'client-1', count: 10 } },
      ],
    };
    const first = replayPermalink(payload);
    const second = replayPermalink(payload);
    expect(canonicalJson(first.state)).toBe(canonicalJson(second.state));
    const state = first.state as {
      flawsDemonstrated: { fixedWindowBoundaryBurstDetected: boolean };
    };
    expect(state.flawsDemonstrated.fixedWindowBoundaryBurstDetected).toBe(true);
  });
});
describe('session timeline index (feature 2)', () => {
  it('indexes entries and resolves jump targets', () => {
    const builder = new SessionTimelineBuilder();
    builder.append({
      timestamp: 1000,
      domainId: 'kafka',
      frameRef: 10,
      actionKind: 'CHAOS_INJECT',
      label: 'killed broker',
    });
    builder.append({
      timestamp: 2000,
      domainId: 'raft',
      frameRef: 4,
      actionKind: 'DOMAIN_SWITCH',
      label: 'switched to raft',
    });
    expect(builder.list().map((e) => e.seq)).toEqual([0, 1]);
    expect(builder.entriesForDomain('raft')).toHaveLength(1);
    expect(builder.jumpTarget(1)).toEqual({ domainId: 'raft', frameRef: 4 });
    expect(builder.jumpTarget(99)).toBeNull();
  });
});

describe('spaced repetition determinism (feature 5)', () => {
  it('promotes on correct, resets on wrong, orders due cards', () => {
    const now = 1700000000000;
    const promoted = reviewCard(1, 0, true, now);
    expect(promoted.box).toBe(2);
    expect(promoted.nextReviewAt).toBeGreaterThan(now);
    const lapsed = reviewCard(3, 1, false, now);
    expect(lapsed).toEqual({ box: 0, nextReviewAt: now + 600000, lapses: 2 });
    const cards = [
      { id: 'a', nextReviewAt: now + 1000 },
      { id: 'b', nextReviewAt: now - 1000 },
      { id: 'c', nextReviewAt: now - 5000 },
    ];
    expect(dueCards(cards, now).map((c) => c.id)).toEqual(['c', 'b']);
  });
});
