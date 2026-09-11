import { describe, expect, it } from 'vitest';

import {
  assertPluginCompatible,
  defineDomainPlugin,
  DomainRegistry,
  PLUGIN_API_VERSION,
  type DomainPlugin,
} from '../index.js';

/** Reference third-party domain: a trivial counter used to document the SDK. */
function buildCounterPlugin(id = 'sdk-counter'): DomainPlugin {
  return defineDomainPlugin(id, 'SDK Counter', 'Reference plugin from the SDK docs', 'ALGORITHMS')
    .withFidelityTag('CONCEPTUAL')
    .withDefaultState(() => ({ value: 0 }))
    .withReducer((state, event) => {
      const s = state as { value: number };
      const e = event as { tick: number; type: string; payload?: Record<string, unknown> };
      if (e.type === 'COUNTER_SET') {
        const next = Number(e.payload?.['value'] ?? s.value);
        return { nextState: { value: Number.isFinite(next) ? next : s.value }, emittedEvents: [] };
      }
      return { nextState: { value: s.value + 1 }, emittedEvents: [] };
    })
    .withInvariant((state) => {
      const s = state as { value: number };
      return Number.isFinite(s.value) && s.value >= 0
        ? { passed: true }
        : { passed: false, violation: { name: 'COUNTER_NON_NEGATIVE', description: 'counter must be >= 0' } };
    })
    .build();
}

describe('Plugin SDK (Phase 3 GA)', () => {
  it('exposes a stable plugin API version and rejects mismatches', () => {
    expect(PLUGIN_API_VERSION).toBe(1);
    expect(() => assertPluginCompatible(1, 'x')).not.toThrow();
    expect(() => assertPluginCompatible(0, 'x')).toThrow(/targets plugin API v0/);
    expect(() => assertPluginCompatible(2, 'y')).toThrow(/provides v1/);
  });

  it('builds, reduces, and validates a third-party domain', () => {
    const plugin = buildCounterPlugin();
    expect(plugin.metadata.id).toBe('sdk-counter');
    expect(plugin.metadata.category).toBe('ALGORITHMS');

    const rng = { nextFloat: () => 0, nextInt: () => 0 } as never;
    let state: unknown = plugin.createDefaultState();
    for (let t = 1; t <= 3; t++) {
      state = plugin.reduceState(state, { id: 'e', tick: t, type: 'TICK', payload: {} }, rng).nextState;
    }
    expect((state as { value: number }).value).toBe(3);
    expect(plugin.validateInvariants(state).passed).toBe(true);

    // Event payload is applied, and the invariant catches a tampered state.
    state = plugin.reduceState(state, { id: 'e', tick: 4, type: 'COUNTER_SET', payload: { value: 10 } }, rng).nextState;
    expect((state as { value: number }).value).toBe(10);
    const bad = plugin.validateInvariants({ value: -1 });
    expect(bad.passed).toBe(false);
    expect(bad.violation?.name).toBe('COUNTER_NON_NEGATIVE');
  });

  it('registers into the live registry and is retrievable', () => {
    const plugin = buildCounterPlugin('sdk-counter-reg');
    DomainRegistry.register(plugin);
    expect(DomainRegistry.get('sdk-counter-reg')?.metadata.id).toBe('sdk-counter-reg');
    expect(DomainRegistry.list().some((m) => m.id === 'sdk-counter-reg')).toBe(true);
  });

  it('refuses to build an incomplete plugin', () => {
    expect(() => defineDomainPlugin('broken', 'Broken', 'no reducer').withDefaultState(() => ({})).build()).toThrow(
      /requires a state transition reducer/,
    );
    expect(() => defineDomainPlugin('broken2', 'Broken', 'no state').withReducer((s) => ({ nextState: s })).build()).toThrow(
      /requires a default state factory/,
    );
  });
});
