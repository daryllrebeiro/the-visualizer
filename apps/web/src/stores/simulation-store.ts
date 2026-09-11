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
  plugin: DomainPlugin;
  state: any;
  rng: DeterministicRNG;
  isPaused: boolean;
  tickRateMs: number;
  violation: InvariantViolationState | null;

  // Actions
  setDomain: (domainId: string) => void;
  step: (ticks?: number) => void;
  dispatchAction: (actionType: string, payload?: Record<string, unknown>) => void;
  loadScenario: (scenarioId: string) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  setTickRateMs: (rateMs: number) => void;
  reset: () => void;
}

const DEFAULT_DOMAIN = 'kafka';

export const useSimulationStore = create<SimulationStore>((set, get) => {
  const initialPlugin = DomainRegistry.get(DEFAULT_DOMAIN);
  if (!initialPlugin) {
    throw new Error(`Default domain plugin not found: ${DEFAULT_DOMAIN}`);
  }

  return {
    domainId: DEFAULT_DOMAIN,
    plugin: initialPlugin,
    state: initialPlugin.createDefaultState(),
    rng: new DeterministicRNG(12345),
    isPaused: false,
    tickRateMs: 500,
    violation: null,

    setDomain: (domainId: string) => {
      const plugin = DomainRegistry.get(domainId);
      if (!plugin) {
        throw new Error(`Domain plugin not found in registry: ${domainId}`);
      }

      set({
        domainId,
        plugin,
        state: plugin.createDefaultState(),
        rng: new DeterministicRNG(12345),
        violation: null,
      });
      emitLearnAction({ kind: 'DOMAIN_SWITCH', domainId, label: `Switched to ${plugin.metadata.name}` });
    },

    step: (ticks = 1) => {
      const { plugin, state, rng, isPaused } = get();
      if (!plugin || !state) return;

      let currentState = state;
      let lastViolation: InvariantViolationState | null = null;

      for (let i = 0; i < ticks; i++) {
        const nextTick = Number(currentState.tick ?? 0) + 1;
        const tickEvent = {
          id: `${plugin.metadata.id}-tick-${String(nextTick)}`,
          tick: nextTick,
          type: `${plugin.metadata.id.toUpperCase().replace(/-/g, '_')}_TICK`,
          payload: {},
        };

        const result = plugin.reduceState(currentState, tickEvent, rng);
        currentState = result.nextState;

        const check = plugin.validateInvariants(currentState);
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
      if (!plugin || !state) return;
      const nextTick = Number(state.tick ?? 0) + 1;
      const event = {
        id: `${plugin.metadata.id}-action-${String(nextTick)}-${String(eventSeqCounter++)}`,
        tick: nextTick,
        type: actionType,
        payload,
      };
      const result = plugin.reduceState(state, event, rng);
      const check = plugin.validateInvariants(result.nextState);
      set({
        state: result.nextState,
        violation: check.passed ? null : check.violation ?? null,
        isPaused: !check.passed ? true : isPaused,
      });
      emitLearnAction({ kind: 'ACTION', domainId: get().domainId, label: `Dispatched ${actionType}` });
    },

    loadScenario: (scenarioId: string) => {
      const { plugin } = get();
      if (!plugin) return;
      const scenario = plugin.scenarioLibrary?.find((s) => s.id === scenarioId);
      if (!scenario) return;
      const baseState = plugin.createDefaultState();
      const scenarioState = scenario.setup(baseState);
      set({
        state: scenarioState,
        rng: new DeterministicRNG(12345),
        violation: null,
        isPaused: false,
      });
      emitLearnAction({
        kind: 'SCENARIO_LOAD',
        domainId: get().domainId,
        label: `Loaded scenario ${scenarioId}`,
      });
    },

    setTickRateMs: (tickRateMs: number) => set({ tickRateMs }),

    reset: () => {
      const { plugin } = get();
      set({
        state: plugin.createDefaultState(),
        rng: new DeterministicRNG(12345),
        violation: null,
        isPaused: false,
      });
      emitLearnAction({ kind: 'RESET', domainId: get().domainId, label: 'Reset to default state' });
    },
  };
});
