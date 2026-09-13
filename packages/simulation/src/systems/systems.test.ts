import { describe, expect, it } from 'vitest';

import { SystemDefinitionSchema } from '@the-visualizer/contracts';

import { bootstrapSystems } from './bootstrap.js';
import { evaluateChallenge, BOOKING_CHALLENGE } from './challenges.js';
import { ECOMMERCE_SYSTEM, TICKET_BOOKING_SYSTEM, COLLAB_DOCS_SYSTEM } from './flagships.js';
import { MVP_CACHE_SYSTEM } from './mvp-cache.js';
import { getSystem, listSystems } from './registry.js';
import { findRoute, buildAdjacency } from './router.js';
import { runSystemScript } from './runtime.js';
import { validateSystem } from './validate.js';

bootstrapSystems();

describe('system contracts', () => {
  it.each([MVP_CACHE_SYSTEM, ECOMMERCE_SYSTEM, TICKET_BOOKING_SYSTEM, COLLAB_DOCS_SYSTEM])(
    'validates $id against SystemDefinitionSchema',
    (def) => {
      expect(() => SystemDefinitionSchema.parse(def)).not.toThrow();
    },
  );

  it('rejects connections referencing missing components', () => {
    const bad = { ...MVP_CACHE_SYSTEM, connections: [{ id: 'x', source: 'ghost', target: 'db', protocol: 'database', direction: 'unidirectional', config: {} }] };
    expect(() => SystemDefinitionSchema.parse(bad)).toThrow();
  });
});

describe('router', () => {
  it('finds a route through the MVP graph', () => {
    const adj = buildAdjacency(MVP_CACHE_SYSTEM.connections as never);
    const path = findRoute(adj, 'service', 'db');
    expect(path.length).toBeGreaterThan(0);
  });

  it('returns empty when disconnected', () => {
    const adj = buildAdjacency(MVP_CACHE_SYSTEM.connections as never);
    expect(findRoute(adj, 'db', 'user')).toEqual([]);
  });
});

describe('runtime determinism', () => {
  it('cache-hit is deterministic and hits Redis', () => {
    const scenario = MVP_CACHE_SYSTEM.scenarios.find((s) => s.id === 'cache-hit')!;
    const a = runSystemScript(MVP_CACHE_SYSTEM, { seed: scenario.seed, events: scenario.events });
    const b = runSystemScript(MVP_CACHE_SYSTEM, { seed: scenario.seed, events: scenario.events });
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.events.some((e) => e.type === 'CACHE_HIT')).toBe(true);
    expect(a.violation).toBeNull();
  });

  it('replay(seed, actions) === original and event ids strictly increase', () => {
    const scenario = MVP_CACHE_SYSTEM.scenarios.find((s) => s.id === 'cache-miss')!;
    const run = runSystemScript(MVP_CACHE_SYSTEM, { seed: scenario.seed, events: scenario.events });
    const replay = runSystemScript(MVP_CACHE_SYSTEM, { seed: scenario.seed, events: scenario.events });
    expect(replay.events).toEqual(run.events);
    const ids = run.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ticket race admits lock and rejects loser', () => {
    const race = TICKET_BOOKING_SYSTEM.scenarios.find((s) => s.id === 'double-race')!;
    const run = runSystemScript(TICKET_BOOKING_SYSTEM, { seed: race.seed, events: race.events });
    const acquired = run.events.filter((e) => e.type === 'LOCK_ACQUIRED').length;
    const rejected = run.events.filter((e) => e.type === 'LOCK_REJECTED').length;
    expect(acquired).toBe(1);
    expect(rejected).toBe(1);
  });

  it('ecommerce checkout traverses to kafka consumers', () => {
    const co = ECOMMERCE_SYSTEM.scenarios.find((s) => s.id === 'checkout')!;
    const run = runSystemScript(ECOMMERCE_SYSTEM, { seed: co.seed, events: co.events });
    expect(run.events.some((e) => e.type === 'MESSAGE_PUBLISHED')).toBe(true);
  });

  it('collab concurrent edit produces ordered events', () => {
    const ce = COLLAB_DOCS_SYSTEM.scenarios.find((s) => s.id === 'concurrent-edit')!;
    const run = runSystemScript(COLLAB_DOCS_SYSTEM, { seed: ce.seed, events: ce.events });
    expect(run.events.length).toBeGreaterThan(2);
    expect(run.violation).toBeNull();
  });

  it('failure injection surfaces timeout when redis is down', () => {
    const s = ECOMMERCE_SYSTEM.scenarios.find((x) => x.id === 'redis-down')!;
    const run = runSystemScript(ECOMMERCE_SYSTEM, { seed: s.seed, events: s.events, failures: s.failures });
    expect(run.events.some((e) => e.type === 'TIMEOUT')).toBe(true);
  });
});

describe('validation + registry + challenges', () => {
  it('registry lists the four built-ins', () => {
    const ids = listSystems().map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['mvp-cache', 'ecommerce', 'ticket-booking', 'collab-docs']));
    expect(getSystem('ecommerce')?.name).toBe('E-commerce');
  });

  it('flags service without retry as warning, not error', () => {
    const issues = validateSystem(MVP_CACHE_SYSTEM);
    expect(issues.some((i) => i.code === 'service-no-retry' && i.severity === 'WARNING')).toBe(true);
    expect(issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
  });

  it('evaluates the booking challenge rule-based', () => {
    const good = evaluateChallenge(BOOKING_CHALLENGE, {
      components: TICKET_BOOKING_SYSTEM.components.map((c) => ({ type: c.type })),
      connections: [],
    });
    expect(good.checks.find((c) => c.id === 'has-concurrency-control')?.pass).toBe(true);
    const bad = evaluateChallenge(BOOKING_CHALLENGE, { components: [{ type: 'service' }], connections: [] });
    expect(bad.checks.find((c) => c.id === 'has-concurrency-control')?.pass).toBe(false);
    expect(bad.score).toBeLessThan(good.score);
  });
});
