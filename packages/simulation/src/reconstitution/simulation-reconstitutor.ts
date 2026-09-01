import { applyPatch, compare, type Operation } from 'fast-json-patch';

import { pureStateTransition } from '../engine/state-transitions.js';
import type {
  InvariantViolationReport,
  KafkaClusterState,
  SimEvent,
  SimEventLog,
  SimTraceBundle,
} from '../engine/types.js';
import { InvariantChecker } from '../invariants/invariant-checker.js';
import { DeterministicRNG } from '../prng/deterministic-rng.js';
import { EventLogParser, type ParsedTraceResult } from './event-log-parser.js';

export interface ReconstitutedStepMetadata {
  stepIndex: number;
  tick: number;
  eventType: string;
  summary: string;
  involvedEntityIds: string[];
  violation?: InvariantViolationReport | undefined;
}

export interface ReconstitutionPatch {
  stepIndex: number;
  forward: Operation[];
  reverse: Operation[];
}

export interface StepResult {
  stepIndex: number;
  tick: number;
  state: KafkaClusterState;
  event: SimEventLog | null;
  violation?: InvariantViolationReport | undefined;
}

/**
 * SimulationReconstitutor — Recreates exact deterministic cluster history from an event log stream.
 *
 * Capabilities:
 *   - Offline deterministic state reconstitution with zero live gateway dependency
 *   - Step-by-step verification of all 8 Kafka safety invariants
 *   - Keyframe snapshotting + RFC 6902 delta patching for $O(1)$ bidirectional scrubbing
 *   - Exporting reconstituted traces as shareable bundles & test fixtures
 */
export class SimulationReconstitutor {
  private initialState: KafkaClusterState | null = null;
  private events: SimEventLog[] = [];
  private metadata: ParsedTraceResult['metadata'] | undefined;

  private readonly keyframes = new Map<number, KafkaClusterState>();
  private readonly patches: ReconstitutionPatch[] = [];
  private readonly stepMetadata: ReconstitutedStepMetadata[] = [];
  private readonly violations: InvariantViolationReport[] = [];

  private currentStep = 0;
  private currentStateCache: KafkaClusterState | null = null;
  private readonly KEYFRAME_STEP_INTERVAL = 50;

  /**
   * Loads and completely reconstitutes a trace bundle or event log stream.
   */
  public loadTrace(input: string | unknown): void {
    const parsed = EventLogParser.parse(input);
    this.initialState = parsed.initialState;
    this.events = parsed.events;
    this.metadata = parsed.metadata;

    this.reconstituteAll();
  }

  /**
   * Fully executes the trace stream from initial state to end, pre-computing
   * keyframes, invariant assertions, and RFC 6902 delta patches.
   */
  private reconstituteAll(): void {
    if (!this.initialState) return;

    this.keyframes.clear();
    this.patches.length = 0;
    this.stepMetadata.length = 0;
    this.violations.length = 0;

    const rng = new DeterministicRNG(this.initialState.rngState ?? 42);
    const invariantChecker = new InvariantChecker();

    let state: KafkaClusterState = JSON.parse(JSON.stringify(this.initialState)) as KafkaClusterState;

    // Step 0 represents the initial state snapshot
    this.keyframes.set(0, JSON.parse(JSON.stringify(state)) as KafkaClusterState);
    this.stepMetadata.push({
      stepIndex: 0,
      tick: state.tick,
      eventType: 'INITIAL_STATE',
      summary: `Cluster initialized with ${Object.keys(state.brokers).length} brokers`,
      involvedEntityIds: Object.keys(state.brokers),
    });

    // Check invariant on initial state
    const initialViolation = invariantChecker.check(state);
    if (initialViolation) {
      const report: InvariantViolationReport = {
        invariantName: initialViolation.invariantName,
        description: initialViolation.description,
        stepIndex: 0,
        tick: initialViolation.tick,
        affectedEntities: initialViolation.affectedEntities,
      };
      this.violations.push(report);
      const firstStep = this.stepMetadata[0];
      if (firstStep) firstStep.violation = report;
    }

    for (let i = 0; i < this.events.length; i++) {
      const stepIndex = i + 1;
      const eventLog = this.events[i];
      if (!eventLog) continue;
      const prevState = JSON.parse(JSON.stringify(state)) as KafkaClusterState;

      // Adapt SimEventLog to SimEvent for transition engine
      const simEvent: SimEvent = {
        id: eventLog.id,
        tick: eventLog.tick,
        type: eventLog.type as SimEvent['type'],
        payload: eventLog.payload,
      };

      // Pure deterministic state transition
      const transitionResult = pureStateTransition(state, simEvent, rng);
      state = transitionResult.nextState;

      // Invariant assertion check
      const violation = invariantChecker.check(state);
      let stepViolation: InvariantViolationReport | undefined;
      if (violation) {
        stepViolation = {
          invariantName: violation.invariantName,
          description: violation.description,
          stepIndex,
          tick: violation.tick,
          affectedEntities: violation.affectedEntities,
        };
        this.violations.push(stepViolation);
      }

      // Delta patch computation (RFC 6902)
      const forward = compare(prevState, state);
      const reverse = compare(state, prevState);
      this.patches.push({
        stepIndex,
        forward,
        reverse,
      });

      // Keyframe storage
      if (stepIndex % this.KEYFRAME_STEP_INTERVAL === 0 || stepIndex === this.events.length) {
        this.keyframes.set(stepIndex, JSON.parse(JSON.stringify(state)) as KafkaClusterState);
      }

      // Metadata summary extraction
      this.stepMetadata.push({
        stepIndex,
        tick: eventLog.tick,
        eventType: eventLog.type,
        summary: this.generateStepSummary(eventLog),
        involvedEntityIds: this.extractInvolvedEntities(eventLog),
        ...(stepViolation ? { violation: stepViolation } : {}),
      });
    }

    this.currentStep = 0;
    this.currentStateCache = JSON.parse(JSON.stringify(this.initialState)) as KafkaClusterState;
  }

  public get totalSteps(): number {
    return this.events.length;
  }

  public get currentStepIndex(): number {
    return this.currentStep;
  }

  public get currentTick(): number {
    return this.stepMetadata[this.currentStep]?.tick ?? 0;
  }

  public get currentEvent(): SimEventLog | null {
    if (this.currentStep === 0) return null;
    return this.events[this.currentStep - 1] ?? null;
  }

  public get currentState(): KafkaClusterState {
    if (!this.currentStateCache) {
      this.currentStateCache = this.seekToStep(this.currentStep);
    }
    return this.currentStateCache;
  }

  /**
   * Advances one step forward in time.
   */
  public stepForward(): StepResult | null {
    if (this.currentStep >= this.totalSteps) return null;

    const nextStep = this.currentStep + 1;
    const patch = this.patches.find((p) => p.stepIndex === nextStep);

    if (patch && this.currentStateCache) {
      this.currentStateCache = applyPatch(this.currentStateCache, patch.forward).newDocument;
    } else {
      this.currentStateCache = this.seekToStep(nextStep);
    }

    this.currentStep = nextStep;
    const meta = this.stepMetadata[this.currentStep];
    const tick = meta ? meta.tick : (this.currentStateCache?.tick ?? 0);
    const violation = meta ? meta.violation : undefined;

    return {
      stepIndex: this.currentStep,
      tick,
      state: this.currentStateCache,
      event: this.currentEvent,
      violation,
    };
  }

  /**
   * Steps one event backward in time using reverse delta patch.
   */
  public stepBackward(): StepResult | null {
    if (this.currentStep <= 0) return null;

    const prevStep = this.currentStep - 1;
    const patch = this.patches.find((p) => p.stepIndex === this.currentStep);

    if (patch && this.currentStateCache) {
      this.currentStateCache = applyPatch(this.currentStateCache, patch.reverse).newDocument;
    } else {
      this.currentStateCache = this.seekToStep(prevStep);
    }

    this.currentStep = prevStep;
    const meta = this.stepMetadata[this.currentStep];
    const tick = meta ? meta.tick : (this.currentStateCache?.tick ?? 0);
    const violation = meta ? meta.violation : undefined;

    return {
      stepIndex: this.currentStep,
      tick,
      state: this.currentStateCache,
      event: this.currentEvent,
      violation,
    };
  }

  /**
   * Random-access seek to a target step index in $O(1)$ keyframe hops.
   */
  public seekToStep(targetStep: number): KafkaClusterState {
    if (!this.initialState) {
      throw new Error('SimulationReconstitutor has no loaded trace');
    }
    const clampedStep = Math.max(0, Math.min(targetStep, this.totalSteps));

    // Find nearest preceding keyframe
    let nearestKeyframeStep = 0;
    for (const keyframeStep of this.keyframes.keys()) {
      if (keyframeStep <= clampedStep && keyframeStep > nearestKeyframeStep) {
        nearestKeyframeStep = keyframeStep;
      }
    }

    const keyframeState = this.keyframes.get(nearestKeyframeStep) ?? this.initialState;
    let state = JSON.parse(JSON.stringify(keyframeState)) as KafkaClusterState;

    if (nearestKeyframeStep === clampedStep) {
      this.currentStep = clampedStep;
      this.currentStateCache = state;
      return state;
    }

    // Apply forward patches from nearest keyframe up to targetStep
    const forwardPatches = this.patches.filter(
      (p) => p.stepIndex > nearestKeyframeStep && p.stepIndex <= clampedStep,
    );

    for (const patch of forwardPatches) {
      state = applyPatch(state, patch.forward).newDocument;
    }

    this.currentStep = clampedStep;
    this.currentStateCache = state;
    return state;
  }

  /**
   * Seeks to the nearest step at or immediately before a given tick.
   */
  public seekToTick(targetTick: number): KafkaClusterState {
    let targetStep = 0;
    for (let i = 0; i < this.stepMetadata.length; i++) {
      const step = this.stepMetadata[i];
      if (step && step.tick <= targetTick) {
        targetStep = i;
      } else {
        break;
      }
    }
    return this.seekToStep(targetStep);
  }

  /**
   * Jumps directly to the step index of an invariant violation.
   */
  public jumpToViolation(violationIndex = 0): KafkaClusterState | null {
    if (this.violations.length === 0 || violationIndex >= this.violations.length) {
      return null;
    }
    const violation = this.violations[violationIndex];
    if (!violation) return null;
    return this.seekToStep(violation.stepIndex);
  }

  public getTimelineSteps(): readonly ReconstitutedStepMetadata[] {
    return this.stepMetadata;
  }

  public getViolations(): readonly InvariantViolationReport[] {
    return this.violations;
  }

  /**
   * Exports the entire reconstituted trace as a standalone, portable SimTraceBundle.
   */
  public exportBundle(name?: string, description?: string): SimTraceBundle {
    if (!this.initialState) {
      throw new Error('Cannot export bundle: No trace loaded');
    }

    const lastMeta = this.stepMetadata[this.stepMetadata.length - 1];
    const maxTick = lastMeta ? lastMeta.tick : 0;

    return {
      version: '1.0',
      exportedAt: Date.now(),
      clusterId: this.initialState.clusterId,
      name: name ?? this.metadata?.name ?? 'Reconstituted Kafka Simulation Trace',
      description:
        description ??
        this.metadata?.description ??
        `Exported trace containing ${this.events.length} events across ${maxTick} ticks`,
      initialState: this.initialState,
      events: this.events,
      metadata: {
        totalTicks: maxTick,
        totalEvents: this.events.length,
        generator: '@the-visualizer/simulation:SimulationReconstitutor',
        seed: this.initialState.rngState ?? 42,
      },
    };
  }

  private generateStepSummary(event: SimEventLog): string {
    const p = event.payload as {
      brokerId?: string | undefined;
      status?: string | undefined;
      topic?: string | undefined;
      partition?: number | undefined;
      key?: string | undefined;
      memberId?: string | undefined;
      groupId?: string | undefined;
      leaderBrokerId?: string | undefined;
      partitions?: number | undefined;
      isr?: string[] | undefined;
    };
    switch (event.type) {
      case 'BROKER_STATUS_CHANGED':
        return `Broker ${p.brokerId ?? ''} status -> ${p.status ?? ''}`;
      case 'BROKER_ADDED':
        return `New Broker ${p.brokerId ?? ''} joined cluster`;
      case 'TOPIC_CREATED':
        return `Topic '${p.topic ?? ''}' created with ${String(p.partitions ?? 1)} partitions`;
      case 'RECORD_PRODUCED':
        return `Message produced to ${p.topic ?? ''}-${String(p.partition ?? 0)} (key: ${p.key ?? ''})`;
      case 'RECORD_CONSUMED':
        return `Message consumed from ${p.topic ?? ''}-${String(p.partition ?? 0)} by ${p.memberId ?? ''}`;
      case 'CONSUMER_JOINED':
        return `Consumer ${p.memberId ?? ''} joined group ${p.groupId ?? ''}`;
      case 'CONSUMER_LEFT':
        return `Consumer ${p.memberId ?? ''} left group ${p.groupId ?? ''}`;
      case 'REBALANCE_STARTED':
        return `Consumer group ${p.groupId ?? ''} initiated rebalance`;
      case 'REBALANCE_COMPLETED':
        return `Consumer group ${p.groupId ?? ''} completed rebalance`;
      case 'PARTITION_LEADER_ELECTED':
        return `Broker ${p.leaderBrokerId ?? ''} elected leader for ${p.topic ?? ''}-${String(p.partition ?? 0)}`;
      case 'ISR_CHANGED':
        return `ISR changed for ${p.topic ?? ''}-${String(p.partition ?? 0)} -> [${p.isr?.join(', ') ?? ''}]`;
      default:
        return `${event.type} event executed at tick ${String(event.tick)}`;
    }
  }

  private extractInvolvedEntities(event: SimEventLog): string[] {
    const ids: string[] = [];
    const p = event.payload as {
      brokerId?: string | undefined;
      leaderBrokerId?: string | undefined;
      topic?: string | undefined;
      groupId?: string | undefined;
      memberId?: string | undefined;
    };
    if (p.brokerId) ids.push(p.brokerId);
    if (p.leaderBrokerId) ids.push(p.leaderBrokerId);
    if (p.topic) ids.push(p.topic);
    if (p.groupId) ids.push(p.groupId);
    if (p.memberId) ids.push(p.memberId);
    return ids;
  }
}
