import { type Operation, applyPatch, compare } from 'fast-json-patch';

import type { KafkaClusterState } from '../engine/types.js';

export interface SnapshotMetadata {
  tick: number;
  eventCount: number;
  createdAt: number; // wall clock ms, for GC/housekeeping only
}

export interface Snapshot {
  state: KafkaClusterState;
  metadata: SnapshotMetadata;
}

/**
 * SlidePatch represents a delta patch (RFC 6902 JSON Patch)
 * to go from one tick state to the next, along with the reverse patch
 * to step backwards immediately.
 */
export interface SlidePatch {
  tick: number;
  forward: Operation[];
  reverse: Operation[];
}

/**
 * SnapshotManager — keyframe snapshots + RFC 6902 forward and reverse delta patches.
 *
 * Requirements:
 *   - Periodic keyframes (every 500 ticks or 1,000 events) for fast random jumps
 *   - Delta patches for step-by-step forward replay
 *   - Reverse delta patches for step-by-step backward scrubbing without full replay
 */
export class SnapshotManager {
  private readonly keyframes = new Map<number, Snapshot>();
  private readonly patches: SlidePatch[] = [];

  private readonly KEYFRAME_TICK_INTERVAL = 500;
  private readonly KEYFRAME_EVENT_INTERVAL = 1000;
  private eventCount = 0;
  private lastState: KafkaClusterState | null = null;

  /**
   * Evaluates if a keyframe snapshot or incremental patch should be recorded
   * for the given state at the current tick.
   */
  public recordState(state: KafkaClusterState, tick: number): void {
    this.eventCount++;

    // Deep clone state to ensure immutable snapshots
    const stateClone = JSON.parse(JSON.stringify(state)) as KafkaClusterState;

    // Check if we should take a full keyframe snapshot
    const shouldTakeKeyframe =
      this.keyframes.size === 0 ||
      tick % this.KEYFRAME_TICK_INTERVAL === 0 ||
      this.eventCount % this.KEYFRAME_EVENT_INTERVAL === 0;

    if (shouldTakeKeyframe) {
      this.keyframes.set(tick, {
        state: stateClone,
        metadata: {
          tick,
          eventCount: this.eventCount,
          createdAt: Date.now(),
        },
      });
    }

    // Generate forward and reverse patches relative to the previous state
    if (this.lastState !== null) {
      const forward = compare(this.lastState, stateClone);
      const reverse = compare(stateClone, this.lastState);

      this.patches.push({
        tick,
        forward,
        reverse,
      });

      // Keep sliding window of patches to prevent memory bloat (max last 2,000 steps)
      if (this.patches.length > 2000) {
        this.patches.shift();
      }
    }

    this.lastState = stateClone;
  }

  /**
   * Reconstructs the exact state at a given target tick using keyframes and forward patches.
   */
  public getStateAt(targetTick: number): KafkaClusterState | undefined {
    // 1. Find the nearest keyframe at or before targetTick
    const nearestKeyframe = this.findNearestKeyframe(targetTick);
    if (!nearestKeyframe) return undefined;

    // 2. Clone the keyframe state as the starting point
    let state = JSON.parse(JSON.stringify(nearestKeyframe.state)) as KafkaClusterState;

    if (nearestKeyframe.metadata.tick === targetTick) {
      return state;
    }

    // 3. Find and apply forward patches from keyframe tick up to targetTick
    const startTick = nearestKeyframe.metadata.tick;
    const applicablePatches = this.patches.filter(
      (p) => p.tick > startTick && p.tick <= targetTick,
    );

    // If we are missing intermediate patches, we cannot reconstruct the state
    if (applicablePatches.length < targetTick - startTick) {
      return undefined;
    }

    for (const patch of applicablePatches) {
      state = applyPatch(state, patch.forward).newDocument;
    }

    return state;
  }

  /**
   * Step backward one tick from the current state using reverse patches.
   * Extremely fast, zero overhead compared to full replay.
   */
  public stepBackward(
    currentState: KafkaClusterState,
    currentTick: number,
  ): KafkaClusterState | undefined {
    const patch = this.patches.find((p) => p.tick === currentTick);
    if (!patch) return undefined;

    const previousState = applyPatch(currentState, patch.reverse).newDocument;
    this.lastState = JSON.parse(JSON.stringify(previousState)) as KafkaClusterState;
    return previousState;
  }

  /**
   * Find the nearest keyframe at or before a given tick.
   */
  public findNearestKeyframe(tick: number): Snapshot | undefined {
    let nearest: Snapshot | undefined;
    for (const [keyframeTick, snapshot] of this.keyframes) {
      if (keyframeTick <= tick) {
        if (!nearest || keyframeTick > nearest.metadata.tick) {
          nearest = snapshot;
        }
      }
    }
    return nearest;
  }

  /**
   * Returns sorted list of all keyframe ticks.
   */
  public getKeyframeTicks(): number[] {
    return Array.from(this.keyframes.keys()).sort((a, b) => a - b);
  }

  public clear(): void {
    this.keyframes.clear();
    this.patches.length = 0;
    this.eventCount = 0;
    this.lastState = null;
  }
}
