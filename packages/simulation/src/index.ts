/**
 * packages/simulation — Deterministic Discrete-Event Simulation Engine
 *
 * ARCHITECTURE RULE: This package has ZERO runtime I/O dependencies.
 * It must run identically in:
 *   - Browser WebWorker (solo sandbox mode)
 *   - Node.js worker threads (multiplayer server mode)
 *
 * No imports from: window, document, process.env, fs, fetch, ws,
 *                  http, PostgreSQL, Redis, or any framework.
 */

export { DeterministicRNG } from './prng/deterministic-rng.js';
export { MinHeapPriorityQueue } from './scheduler/min-heap.js';
export { VirtualTimeline } from './scheduler/virtual-timeline.js';
export { SimulationEngine } from './engine/simulation-engine.js';
export { InvariantChecker } from './invariants/invariant-checker.js';
export { SnapshotManager } from './snapshot/snapshot-manager.js';

export type { SimulationConfig } from './engine/simulation-engine.js';
export type { ScheduledEvent, VirtualTimestamp } from './scheduler/virtual-timeline.js';
export type { InvariantViolation } from './invariants/invariant-checker.js';
export type { Snapshot, SnapshotMetadata } from './snapshot/snapshot-manager.js';
