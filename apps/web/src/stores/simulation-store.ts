import { create } from 'zustand';

import {
  DeterministicRNG,
  DomainRegistry,
  type DomainPlugin,
} from '@the-visualizer/simulation';

export interface InvariantViolationState {
  name: string;
  description: string;
}

// Monotonic counter for synthetic client-side event ids (no Date.now — ids
// must be reproducible for a given action sequence).
let eventSeqCounter = 0;

export interface LearnActionEvent {
  kind: 'DOMAIN_SWITCH' | 'STEP' | 'ACTION' | 'SCENARIO_LOAD' | 'RESET';
  domainId: string;
  label: string;
}

type LearnActionListener = (event: LearnActionEvent) => void;

const learnActionListeners = new Set<LearnActionListener>();

/**
 * Subscribes to simulation-store actions for the session timeline (feature 2).
 * Additive observability only — never affects simulation state or reducers.
 */
export function subscribeLearnActions(listener: LearnActionListener): () => void {
  learnActionListeners.add(listener);
  return () => {
    learnActionListeners.delete(listener);
  };
}

function emitLearnAction(event: LearnActionEvent): void {
  for (const listener of learnActionListeners) {
    try {
      listener(event);
    } catch {
      // Timeline capture must never break simulation stepping.
    }
  }
}

export interface SimulationStore {
  domainId: string;
  plugin: DomainPlugin<unknown, unknown>;
  state: unknown;
  rng: DeterministicRNG;
  seed: number;
  isPaused: boolean;
  tickRateMs: number;
  violation: InvariantViolationState | null;

  // Actions
  setDomain: (domainId: string, seed?: number) => void;
  step: (ticks?: number) => void;
  dispatchAction: (actionType: string, payload?: Record<string, unknown>) => void;
  loadScenario: (scenarioId: string, seed?: number) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  setTickRateMs: (rateMs: number) => void;
  reset: (seed?: number) => void;
}

const DEFAULT_DOMAIN = 'kafka';
const DEFAULT_SEED = 12345;

/** Deterministic seed derivation: hash(roomId, domainId) — no wall-clock, no Math.random. */
export function deriveSeed(roomId: string, domainId: string): number {
  let h = 0x811c9dc5;
  const s = `${roomId}:${domainId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const useSimulationStore = create<SimulationStore>((set, get) => {
  const initialPlugin = DomainRegistry.get(DEFAULT_DOMAIN);
  if (!initialPlugin) {
    throw new Error(`Default domain plugin not found: ${DEFAULT_DOMAIN}`);
  }

  return {
    domainId: DEFAULT_DOMAIN,
    plugin: initialPlugin as DomainPlugin<unknown, unknown>,
    state: initialPlugin.createDefaultState() as unknown,
    rng: new DeterministicRNG(DEFAULT_SEED),
    seed: DEFAULT_SEED,
    isPaused: false,
    tickRateMs: 500,
    violation: null,

    setDomain: (domainId: string, seed: number = DEFAULT_SEED) => {
      const plugin = DomainRegistry.get(domainId);
      if (!plugin) {
        throw new Error(`Domain plugin not found in registry: ${domainId}`);
      }

      set({
        domainId,
        plugin: plugin as DomainPlugin<unknown, unknown>,
        state: plugin.createDefaultState() as unknown,
        rng: new DeterministicRNG(seed),
        seed,
        violation: null,
      });
      emitLearnAction({ kind: 'DOMAIN_SWITCH', domainId, label: `Switched to ${plugin.metadata.name}` });
    },

    step: (ticks = 1) => {
      const { plugin, state, rng, isPaused } = get();
      if (!plugin || state === null || state === undefined) return;

      let currentState: unknown = state;
      let lastViolation: InvariantViolationState | null = null;

      for (let i = 0; i < ticks; i++) {
        const tickNum = Number((currentState as { tick?: unknown }).tick ?? 0) + 1;
        const tickEvent = {
          id: `${plugin.metadata.id}-tick-${String(tickNum)}`,
          tick: tickNum,
          type: `${plugin.metadata.id.toUpperCase().replace(/-/g, '_')}_TICK`,
          payload: {},
        };

        const result = (plugin as DomainPlugin<unknown, unknown>).reduceState(
          currentState,
          tickEvent as never,
          rng,
        );
        currentState = result.nextState;

        const check = (plugin as DomainPlugin<unknown, unknown>).validateInvariants(
          currentState as never,
        );
        if (!check.passed && check.violation) {
          lastViolation = check.violation;
          break;
        }
      }

      set({
        state: currentState,
        violation: lastViolation,
        isPaused: lastViolation ? true : isPaused,
      });
      emitLearnAction({
        kind: 'STEP',
        domainId: get().domainId,
        label: `Stepped ${String(ticks)} tick${ticks === 1 ? '' : 's'}`,
      });
    },

    togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

    setPaused: (paused: boolean) => set({ isPaused: paused }),

    dispatchAction: (actionType: string, payload: Record<string, unknown> = {}) => {
      const { plugin, state, rng, isPaused } = get();
      if (!plugin || state === null || state === undefined) return;
      const nextTick = Number((state as { tick?: unknown }).tick ?? 0) + 1;
      const event = {
        id: `${plugin.metadata.id}-action-${String(nextTick)}-${String(eventSeqCounter++)}`,
        tick: nextTick,
        type: actionType,
        payload,
      };
      const typed = plugin as DomainPlugin<unknown, unknown>;
      const result = typed.reduceState(state, event as never, rng);
      const check = typed.validateInvariants(result.nextState as never);
      set({
        state: result.nextState,
        violation: check.passed ? null : check.violation ?? null,
        isPaused: !check.passed ? true : isPaused,
      });
      emitLearnAction({ kind: 'ACTION', domainId: get().domainId, label: `Dispatched ${actionType}` });
    },

    loadScenario: (scenarioId: string, seed: number = DEFAULT_SEED) => {
      const { plugin, domainId } = get();
      if (!plugin) return;
      const scenario = (plugin.scenarioLibrary as Array<{ id: string }> | undefined)?.find(
        (s) => s.id === scenarioId,
      );
      if (!scenario) return;

      const baseState = plugin.createDefaultState() as unknown;
      const rng = new DeterministicRNG(seed);

      // Shipped scenarios are executable event scripts (`events`), not
      // `setup(state)` transforms. Apply the recorded events in tick order;
      // fall back to the scenario's `initialState` when no events are defined.
      const events = (scenario as { events?: Array<{ tick: number; type?: string; payload?: Record<string, unknown> }> })
        .events;
      let nextState = (scenario as { initialState?: unknown }).initialState ?? baseState;
      if (Array.isArray(events) && events.length > 0) {
        const ordered = [...events].sort((a, b) => a.tick - b.tick);
        for (const [index, ev] of ordered.entries()) {
          nextState = plugin.reduceState(
            nextState,
            {
              id: `scenario-${String(index)}`,
              tick: ev.tick,
              type: ev.type ?? `${domainId.toUpperCase().replace(/-/g, '_')}_TICK`,
              payload: ev.payload ?? {},
            } as never,
            rng,
          ).nextState;
        }
      }

      const check = plugin.validateInvariants(nextState as never);
      set({
        state: nextState,
        rng,
        seed,
        violation: check.passed ? null : (check.violation ?? null),
        isPaused: false,
      });
      emitLearnAction({
        kind: 'SCENARIO_LOAD',
        domainId: get().domainId,
        label: `Loaded scenario ${scenarioId}`,
      });
    },

    setTickRateMs: (tickRateMs: number) => set({ tickRateMs }),

    reset: (seed?: number) => {
      const { plugin, seed: currentSeed } = get();
      const nextSeed = seed ?? currentSeed;
      set({
        state: plugin.createDefaultState() as unknown,
        rng: new DeterministicRNG(nextSeed),
        seed: nextSeed,
        violation: null,
        isPaused: false,
      });
      emitLearnAction({ kind: 'RESET', domainId: get().domainId, label: 'Reset to default state' });
    },
  };
});
