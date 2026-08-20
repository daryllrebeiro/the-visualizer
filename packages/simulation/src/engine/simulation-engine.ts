import { InvariantChecker, type InvariantViolation } from '../invariants/invariant-checker.js';
import { DeterministicRNG } from '../prng/deterministic-rng.js';
import { VirtualTimeline, type ScheduledEvent } from '../scheduler/virtual-timeline.js';
import { SnapshotManager } from '../snapshot/snapshot-manager.js';

import { pureStateTransition } from './state-transitions.js';
import type { KafkaClusterState, SimEvent } from './types.js';

export interface SimulationConfig {
  seed: number;
  maxTicks: number;
  maxEvents: number;
  maxMemoryMb: number;
  speedMultiplier: number;
}

export interface SimulationEngineCallbacks {
  onEventBatch: (events: SimEvent[], tick: number) => void;
  onInvariantViolation: (violation: InvariantViolation) => void;
  onResourceLimitExceeded: (reason: string) => void;
}

export type SimulationStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'HALTED' | 'COMPLETED';

/**
 * The core simulation engine.
 * Full implementation for Milestone 03.
 * Handles the virtual timeline discrete event loop, executing deterministic transitions.
 */
export class SimulationEngine {
  private readonly config: SimulationConfig;
  private _status: SimulationStatus = 'IDLE';

  private _rng: DeterministicRNG;
  private _timeline: VirtualTimeline<SimEvent>;
  private _state: KafkaClusterState | null = null;

  private readonly snapshotManager = new SnapshotManager();
  private readonly invariantChecker = new InvariantChecker();
  private callbacks: SimulationEngineCallbacks | null = null;
  private eventCount = 0;

  constructor(config: SimulationConfig) {
    this.config = config;
    this._rng = new DeterministicRNG(config.seed);
    this._timeline = new VirtualTimeline<SimEvent>();
  }

  get status(): SimulationStatus {
    return this._status;
  }

  get currentTick(): number {
    return this._timeline.currentTick;
  }

  get state(): KafkaClusterState | null {
    return this._state;
  }

  public registerCallbacks(callbacks: SimulationEngineCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Initialize the engine with a starting topology state.
   */
  public initialize(initialState: KafkaClusterState): void {
    this._status = 'IDLE';
    this.eventCount = 0;
    this._state = JSON.parse(JSON.stringify(initialState)) as KafkaClusterState;
    this._rng = new DeterministicRNG(this.config.seed);
    this._timeline = new VirtualTimeline<SimEvent>();
    this.snapshotManager.clear();

    // Record the initial state snapshot at tick 0
    this.snapshotManager.recordState(this._state, 0);
  }

  /**
   * Schedule an event on the virtual timeline.
   */
  public scheduleEvent(
    scheduledAt: number,
    id: string,
    type: SimEvent['type'],
    payload: Record<string, unknown>,
  ): void {
    const event: ScheduledEvent<SimEvent> = {
      scheduledAt,
      id,
      payload: {
        id,
        tick: scheduledAt,
        type,
        payload,
      },
    };
    this._timeline.schedule(event);
  }

  /**
   * Steps the simulation forward by N ticks.
   * Pops events from timeline, applies state transition, asserts invariants, and takes snapshots.
   */
  public step(ticks: number): void {
    if (this._status === 'HALTED' || this._status === 'COMPLETED' || !this._state) {
      return;
    }

    const startTick = this._timeline.currentTick;
    const endTick = startTick + ticks;

    // Check resource limits
    if (this.eventCount > this.config.maxEvents) {
      this.halt('Max event limit exceeded');
      this.callbacks?.onResourceLimitExceeded('Max event limit exceeded');
      return;
    }
    if (endTick > this.config.maxTicks) {
      this._status = 'COMPLETED';
      return;
    }

    const batchEvents: SimEvent[] = [];

    // discrete event processing loop
    while (!this._timeline.isEmpty) {
      const nextEventRef = this._timeline.peek();
      if (!nextEventRef || nextEventRef.scheduledAt > endTick) {
        break;
      }

      // Pop the event and advance time
      const event = this._timeline.pop();
      if (!event) break;

      batchEvents.push(event.payload);
      this.eventCount++;

      // Apply transition using deterministic state machine
      const result = pureStateTransition(this._state, event.payload, this._rng);
      this._state = result.nextState;

      // Add emitted secondary events back to timeline
      for (const secondaryEvent of result.emittedEvents) {
        this.scheduleEvent(
          secondaryEvent.tick,
          secondaryEvent.id,
          secondaryEvent.type,
          secondaryEvent.payload,
        );
      }

      // Assert Invariants
      const violation = this.invariantChecker.check(this._state);
      if (violation) {
        this._status = 'HALTED';
        this.callbacks?.onInvariantViolation(violation);
        return;
      }

      // Capture snapshot or patch
      this.snapshotManager.recordState(this._state, this._timeline.currentTick);
    }

    if (batchEvents.length > 0) {
      this.callbacks?.onEventBatch(batchEvents, this._timeline.currentTick);
    }
  }

  /**
   * Time-travels to a specific target tick.
   */
  public seekToTick(targetTick: number): boolean {
    const targetState = this.snapshotManager.getStateAt(targetTick);
    if (targetState) {
      this._state = targetState;
      this._timeline.restoreTick(targetTick);
      return true;
    }
    return false;
  }

  /**
   * Step backward one tick using reverse patches.
   */
  public stepBack(): void {
    if (!this._state) return;
    const prevTick = this._timeline.currentTick - 1;
    if (prevTick < 0) return;

    const previousState = this.snapshotManager.stepBackward(
      this._state,
      this._timeline.currentTick,
    );
    if (previousState) {
      this._state = previousState;
      this._timeline.restoreTick(previousState.tick);
    }
  }

  public play(): void {
    this._status = 'RUNNING';
  }

  public pause(): void {
    this._status = 'PAUSED';
  }

  public halt(reason: string): void {
    this._status = 'HALTED';
    console.warn(`[SimulationEngine] Halted: ${reason}`);
  }

  /**
   * Returns a diagnostic state of the simulation for debugging/logging.
   */
  public debugDump(): string {
    return JSON.stringify({
      status: this._status,
      config: this.config,
      rngState: this._rng.getState(),
      eventsScheduled: this._timeline.size,
      clusterId: this._state?.clusterId ?? null,
      currentTick: this._timeline.currentTick,
      totalEventsProcessed: this.eventCount,
    });
  }
}
