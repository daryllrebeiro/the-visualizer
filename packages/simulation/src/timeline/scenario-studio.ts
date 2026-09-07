import { DeterministicRNG } from '../prng/deterministic-rng.js';
import { DomainRegistry, type DomainPlugin } from '../domains/registry.js';

export interface Keyframe<TState = unknown> {
  tick: number;
  state: TState;
  timestamp: number;
}

export interface ScenarioRecording<TState = unknown, TEvent = unknown> {
  version: 1;
  domainId: string;
  seed: number;
  initialState: TState;
  events: Array<{ tick: number; event: TEvent }>;
  keyframes: Keyframe<TState>[];
  totalTicks: number;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export class ScenarioStudio<TState = any, TEvent = any> {
  private keyframes: Map<number, TState> = new Map();
  private eventLog: Array<{ tick: number; event: TEvent }> = [];
  private domainPlugin: DomainPlugin<TState, TEvent>;
  private rng: DeterministicRNG;
  private seed: number;
  private keyframeInterval: number;
  private currentState: TState;
  private currentTick: number = 0;

  constructor(domainId: string, seed: number = 12345, keyframeInterval: number = 10) {
    const plugin = DomainRegistry.get(domainId);
    if (!plugin) throw new Error(`Domain not found: ${domainId}`);
    this.domainPlugin = plugin;
    this.seed = seed;
    this.rng = new DeterministicRNG(seed);
    this.keyframeInterval = Math.max(1, keyframeInterval);
    this.currentState = plugin.createDefaultState();
    this.keyframes.set(0, JSON.parse(JSON.stringify(this.currentState)));
  }

  public recordEvent(tick: number, event: TEvent): void {
    this.eventLog.push({ tick, event });
  }

  public step(event?: TEvent): { state: TState; tick: number; violation: unknown } {
    this.currentTick++;
    const simEvent =
      event ??
      ({
        id: `${this.domainPlugin.metadata.id}-tick-${String(this.currentTick)}`,
        tick: this.currentTick,
        type: `${this.domainPlugin.metadata.id.toUpperCase().replace(/-/g, '_')}_TICK`,
        payload: {},
      } as unknown as TEvent);

    const result = this.domainPlugin.reduceState(this.currentState, simEvent, this.rng);
    this.currentState = result.nextState;

    if (this.currentTick % this.keyframeInterval === 0) {
      this.keyframes.set(this.currentTick, JSON.parse(JSON.stringify(this.currentState)));
    }

    const invariantCheck = this.domainPlugin.validateInvariants(this.currentState);
    return {
      state: this.currentState,
      tick: this.currentTick,
      violation: invariantCheck.passed ? null : invariantCheck.violation,
    };
  }

  public seek(targetTick: number): TState {
    if (targetTick < 0) targetTick = 0;

    // Find nearest keyframe <= targetTick
    const availableKeyframes = Array.from(this.keyframes.keys()).sort((a, b) => a - b);
    let bestKeyframeTick = 0;
    for (const kfTick of availableKeyframes) {
      if (kfTick <= targetTick) {
        bestKeyframeTick = kfTick;
      } else {
        break;
      }
    }

    // Fast-forward from nearest keyframe
    let state = JSON.parse(JSON.stringify(this.keyframes.get(bestKeyframeTick)!));
    const replayRng = new DeterministicRNG(this.seed);

    // Fast-forward PRNG to state before step
    for (let t = 1; t <= bestKeyframeTick; t++) {
      const dummyEv = {
        id: `seek-ff-${String(t)}`,
        tick: t,
        type: `${this.domainPlugin.metadata.id.toUpperCase().replace(/-/g, '_')}_TICK`,
        payload: {},
      } as unknown as TEvent;
      this.domainPlugin.reduceState(state, dummyEv, replayRng);
    }

    for (let t = bestKeyframeTick + 1; t <= targetTick; t++) {
      const tickEv = {
        id: `${this.domainPlugin.metadata.id}-tick-${String(t)}`,
        tick: t,
        type: `${this.domainPlugin.metadata.id.toUpperCase().replace(/-/g, '_')}_TICK`,
        payload: {},
      } as unknown as TEvent;
      const res = this.domainPlugin.reduceState(state, tickEv, replayRng);
      state = res.nextState;
    }

    this.currentState = state;
    this.currentTick = targetTick;
    return state;
  }

  public getState(): TState {
    return this.currentState;
  }

  public getTick(): number {
    return this.currentTick;
  }

  public exportBundle(): ScenarioRecording<TState, TEvent> {
    const keyframesList: Keyframe<TState>[] = [];
    for (const [tick, state] of this.keyframes.entries()) {
      keyframesList.push({ tick, state, timestamp: Date.now() });
    }
    keyframesList.sort((a, b) => a.tick - b.tick);

    return {
      version: 1,
      domainId: this.domainPlugin.metadata.id,
      seed: this.seed,
      initialState: this.domainPlugin.createDefaultState(),
      events: [...this.eventLog],
      keyframes: keyframesList,
      totalTicks: this.currentTick,
      createdAt: Date.now(),
    };
  }

  public static importBundle<TState = unknown, TEvent = unknown>(
    bundle: ScenarioRecording<TState, TEvent>,
  ): ScenarioStudio<TState, TEvent> {
    const studio = new ScenarioStudio<TState, TEvent>(bundle.domainId, bundle.seed);
    studio.eventLog = [...bundle.events];
    for (const kf of bundle.keyframes) {
      studio.keyframes.set(kf.tick, JSON.parse(JSON.stringify(kf.state)));
    }
    studio.currentTick = bundle.totalTicks;
    if (bundle.keyframes.length > 0) {
      const lastKf = bundle.keyframes[bundle.keyframes.length - 1];
      if (lastKf) {
        studio.currentState = JSON.parse(JSON.stringify(lastKf.state)) as TState;
      }
    }
    return studio;
  }
}
