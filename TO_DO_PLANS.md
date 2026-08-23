# TheVisualizer — Future Implementation Plans & Roadmap

This document tracks upcoming architectural initiatives, features, and roadmap items for TheVisualizer.

---

## 1. Recreate Events and State from Given Event Log (Phase 2: Event-Driven Simulation Reconstitution)

### Objective
Provide the capability to ingest a raw, serialized event log or JSON trace stream, and deterministically reconstruct the exact historical cluster topology, state transitions, partition offsets, consumer assignments, and animated packet flows without requiring live gateway communication.

### Core Architecture & Capabilities
1. **Log Ingestion & Schema Normalization**:
   - Parse historical `SimEventLog[]` / `SimEvent[]` trace files.
   - Validate event sequence, timestamps, logical simulation ticks, and `involvedEntities` metadata against Zod contract schemas.
   - Detect and resolve missing or partial snapshots using state delta patching (`fast-json-patch`).

2. **Deterministic State Reconstitution Engine**:
   - Execute pure state transitions (`pureStateTransition(state, event, rng)`) sequentially from an initial topology snapshot (or infer initial baseline state from early declaration events).
   - Replay offset progressions, ISR shrink/expansion history, leader election epochs, and consumer group rebalance assignments step-by-step.
   - Enforce the 8 Kafka safety invariants during each reconstituted step to verify that the imported log represents a valid, uncorrupted Kafka execution history.

3. **Reusable Scenario Generator**:
   - Convert imported or recorded event logs into shareable, executable Scenario Definitions (`ScenarioDefinition`).
   - Allow users to export custom failure sequences (e.g. cascading broker crashes, slow consumer lag, transactional aborts) recorded in real time and re-run them as repeatable educational playbooks.

4. **UI Scrubber & Step-by-Step Step Controller**:
   - Interactive time-travel scrubber across reconstituted ticks ($t_0 \to t_{\text{end}}$).
   - Step forward / step backward single-event execution.
   - Jump to specific event index or invariant violation timestamp.
   - Export reconstituted state bundle as standalone test fixtures for unit and CI regression suites.

---
