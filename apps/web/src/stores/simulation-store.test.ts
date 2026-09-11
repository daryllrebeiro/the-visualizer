import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationStore } from './simulation-store';
import { DomainRegistry } from '@the-visualizer/simulation';

describe('useSimulationStore', () => {
  beforeEach(() => {
    useSimulationStore.getState().reset();
    useSimulationStore.getState().setDomain('kafka');
  });

  it('initializes with default domain (kafka)', () => {
    const state = useSimulationStore.getState();
    expect(state.domainId).toBe('kafka');
    expect(state.plugin).toBeDefined();
    expect(state.plugin.metadata.id).toBe('kafka');
    expect(state.state).toBeDefined();
    expect(state.isPaused).toBe(false);
    expect(state.violation).toBeNull();
  });

  it('supports stepping ticks deterministically', () => {
    const store = useSimulationStore.getState();
    const initialTick: number = store.state.tick ?? 0;

    store.step(1);
    const step1 = useSimulationStore.getState().state;
    expect(step1.tick).toBe(initialTick + 1);

    store.step(5);
    const step6 = useSimulationStore.getState().state;
    expect(step6.tick).toBe(initialTick + 6);
  });

  it('toggles and sets paused state', () => {
    const store = useSimulationStore.getState();
    expect(store.isPaused).toBe(false);

    store.togglePause();
    expect(useSimulationStore.getState().isPaused).toBe(true);

    store.setPaused(false);
    expect(useSimulationStore.getState().isPaused).toBe(false);
  });

  it('supports switching to all registered domains cleanly', () => {
    const allDomains = DomainRegistry.list();
    // Count tracks the registry (28 domains); the per-domain loop below is the assertion.
    expect(allDomains.length).toBeGreaterThan(0);

    for (const meta of allDomains) {
      useSimulationStore.getState().setDomain(meta.id);
      const current = useSimulationStore.getState();
      expect(current.domainId).toBe(meta.id);
      expect(current.plugin.metadata.id).toBe(meta.id);
      expect(current.state).toBeDefined();
      expect(current.violation).toBeNull();

      // Step 2 ticks in this domain
      current.step(2);
      const stepped = useSimulationStore.getState();
      expect(stepped.state).toBeDefined();
    }
  });

  it('resets state and RNG', () => {
    const store = useSimulationStore.getState();
    store.step(10);
    expect(useSimulationStore.getState().state.tick).toBeGreaterThan(0);

    store.reset();
    const resetState = useSimulationStore.getState();
    expect(resetState.state.tick ?? 0).toBe(0);
    expect(resetState.isPaused).toBe(false);
    expect(resetState.violation).toBeNull();
  });

  it('loads a shipped scenario without throwing (regression: scenario.setup does not exist)', () => {
    useSimulationStore.getState().setDomain('raft');
    const plugin = DomainRegistry.get('raft')!;
    const scenario = plugin.scenarioLibrary[0] as { id: string } | undefined;
    expect(scenario, 'raft ships at least one scenario').toBeDefined();

    expect(() => useSimulationStore.getState().loadScenario(scenario!.id)).not.toThrow();
    expect(useSimulationStore.getState().state).toBeDefined();
  });

  it('applies an executable scenario event script deterministically', () => {
    useSimulationStore.getState().setDomain('rate-limiter');
    const plugin = DomainRegistry.get('rate-limiter')!;
    plugin.scenarioLibrary.push({
      id: 'test-executable-burst',
      title: 'Test',
      description: 'injected',
      category: 'chaos',
      invariants: [],
      events: [
        { tick: 9, type: 'RATE_LIMITER_BURST', payload: { clientId: 'client-1', count: 10 } },
        { tick: 11, type: 'RATE_LIMITER_BURST', payload: { clientId: 'client-1', count: 10 } },
      ],
    } as never);

    useSimulationStore.getState().loadScenario('test-executable-burst');
    const state = useSimulationStore.getState().state as {
      flawsDemonstrated: { fixedWindowBoundaryBurstDetected: boolean };
    };
    expect(state.flawsDemonstrated.fixedWindowBoundaryBurstDetected).toBe(true);
  });
});
