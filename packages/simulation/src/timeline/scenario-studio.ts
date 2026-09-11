import { DeterministicRNG } from '../prng/deterministic-rng.js';
import { DomainRegistry, type DomainPlugin } from '../domains/registry.js';
import { canonicalStringify, contentHash, deepClone, makeIdFactory } from '../shared/primitives.js';

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
  /** Content address over the deterministic core (excludes timestamps). */
  contentHash: string;
  metadata?: Record<string, unknown>;
}

/**
 * Time-travel studio for a single domain.
 *
 * Correctness contract: `seek(t)` reconstructs the exact state at tick `t` by
 * replaying recorded events in tick order from a fresh seed — it never trusts
 * cached keyframes as an authoritative shortcut, because a keyframe captured
 * without the event stream is not reproducible.
 */
export class ScenarioStudio<TState = any, TEvent = any> {
  private readonly domainPlugin: DomainPlugin<TState, TEvent>;
  private readonly seed: number;
  private readonly keyframeInterval: number;
  private readonly idFactory = makeIdFactory('scenario');
  private eventLog: Array<{ tick: number; event: TEvent }> = [];
  private keyframes: Map<number, TState> = new Map();
  private currentState: TState;
  private currentTick = 0;
  private rng: DeterministicRNG;

  constructor(domainId: string, seed = 12345, keyframeInterval = 10) {
    const plugin = DomainRegistry.get(domainId);
    if (!plugin) throw new Error(`Domain not found: ${domainId}`);
    this.domainPlugin = plugin as DomainPlugin<TState, TEvent>;
    this.seed = seed;
    this.rng = new DeterministicRNG(seed);
    this.keyframeInterval = Math.max(1, keyframeInterval);
    this.currentState = this.domainPlugin.createDefaultState();
    this.keyframes.set(0, deepClone(this.currentState));
  }

  private tickEvent(tick: number): TEvent {
    return {
      id: this.idFactory(),
      tick,
      type: `${this.domainPlugin.metadata.id.toUpperCase().replace(/-/g, '_')}_TICK`,
      payload: {},
    } as unknown as TEvent;
  }

  public recordEvent(tick: number, event: TEvent): void {
    this.eventLog.push({ tick, event });
    this.eventLog.sort((a, b) => a.tick - b.tick);
  }

  /** Advance one tick, optionally applying an explicit event (recorded). */
  public step(event?: TEvent): { state: TState; tick: number; violation: unknown } {
    this.currentTick++;
    if (event) this.recordEvent(this.currentTick, event);
    const simEvent = event ?? this.tickEvent(this.currentTick);

    const result = this.domainPlugin.reduceState(this.currentState, simEvent, this.rng);
    this.currentState = result.nextState;

    if (this.currentTick % this.keyframeInterval === 0) {
      this.keyframes.set(this.currentTick, deepClone(this.currentState));
    }

    const check = this.domainPlugin.validateInvariants(this.currentState);
    return { state: this.currentState, tick: this.currentTick, violation: check.passed ? null : check.violation };
  }

  private eventsAt(tick: number): TEvent[] {
    return this.eventLog.filter((e) => e.tick === tick).map((e) => e.event);
  }

  /** Deterministic replay from tick 0 to `targetTick`. */
  private replayTo(targetTick: number): TState {
    this.rng = new DeterministicRNG(this.seed);
    let state = this.domainPlugin.createDefaultState();
    for (let t = 1; t <= targetTick; t++) {
      const recorded = this.eventsAt(t);
      const applied = recorded.length > 0 ? recorded : [this.tickEvent(t)];
      for (const ev of applied) {
        state = this.domainPlugin.reduceState(state, ev, this.rng).nextState;
      }
    }
    return state;
  }

  public seek(targetTick: number): TState {
    const tick = Math.max(0, targetTick);
    const state = tick === 0 ? this.domainPlugin.createDefaultState() : this.replayTo(tick);
    this.currentState = state;
    this.currentTick = tick;
    if (tick % this.keyframeInterval === 0) this.keyframes.set(tick, deepClone(state));
    return state;
  }

  public getState(): TState {
    return this.currentState;
  }

  public getTick(): number {
    return this.currentTick;
  }

  public exportBundle(now = 0): ScenarioRecording<TState, TEvent> {
    const keyframesList: Keyframe<TState>[] = [];
    for (const [tick, state] of this.keyframes.entries()) {
      keyframesList.push({ tick, state: deepClone(state), timestamp: now });
    }
    keyframesList.sort((a, b) => a.tick - b.tick);

    const core = {
      version: 1 as const,
      domainId: this.domainPlugin.metadata.id,
      seed: this.seed,
      events: this.eventLog,
      totalTicks: this.currentTick,
    };

    return {
      version: 1,
      domainId: core.domainId,
      seed: core.seed,
      initialState: this.domainPlugin.createDefaultState(),
      events: [...core.events],
      keyframes: keyframesList,
      totalTicks: core.totalTicks,
      createdAt: now,
      contentHash: contentHash(core),
    };
  }

  /** Deterministic `.scenario.json` payload (sorted keys, stable hash). */
  public exportJson(now = 0): string {
    return canonicalStringify(this.exportBundle(now));
  }

  public static importBundle<TState = unknown, TEvent = unknown>(
    bundle: ScenarioRecording<TState, TEvent>,
  ): ScenarioStudio<TState, TEvent> {
    const studio = new ScenarioStudio<TState, TEvent>(bundle.domainId, bundle.seed);
    studio.eventLog = [...bundle.events].sort((a, b) => a.tick - b.tick);
    // Rebuild authoritatively from the event log rather than trusting keyframes.
    studio.seek(bundle.totalTicks);
    return studio;
  }

  public static importJson<TState = unknown, TEvent = unknown>(json: string): ScenarioStudio<TState, TEvent> {
    if (typeof json !== 'string' || json.length === 0 || json.length > 2_000_000) {
      throw new Error('Invalid scenario bundle: size');
    }
    const parsed = JSON.parse(json) as ScenarioRecording<TState, TEvent>;
    if (parsed === null || typeof parsed !== 'object' || parsed.version !== 1 || typeof parsed.domainId !== 'string') {
      throw new Error('Invalid scenario bundle');
    }
    if (!Array.isArray(parsed.events) || typeof parsed.seed !== 'number' || typeof parsed.totalTicks !== 'number') {
      throw new Error('Invalid scenario bundle: missing seed/events/totalTicks');
    }
    if (parsed.events.length > 5000) throw new Error('Invalid scenario bundle: event log too large');
    if (parsed.totalTicks < 0 || parsed.totalTicks > 1_000_000) throw new Error('Invalid scenario bundle: tick range');
    return ScenarioStudio.importBundle(parsed);
  }
}
