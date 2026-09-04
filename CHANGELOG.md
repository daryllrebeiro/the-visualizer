# TheVisualizer Changelog

All notable changes and architectural upgrades implemented across the Modernization, UX, and Hardening Master Plan.

---

## [1.0.0] - Modernization & Hardening Release

### 🎯 Overview

Upgraded TheVisualizer into a production-grade, multi-domain distributed systems laboratory with 8 simulation visualizers, unified application shell, golden determinism test suite, contract fuzzing, accessible table mode, and high-performance real-time telemetry.

---

### 🌟 Major Features & Domain Visualizers

1. **8 Fully-Featured Domain Visualizers**:
   - **Apache Kafka**: KRaft metadata quorum, partition leader election, monotonic high watermark, in-sync replica (ISR) shrink/grow animations, and step-by-step Murmur2 key partitioner byte calculator.
   - **Raft Consensus**: Leader heartbeats, randomized election timeouts, log replication, commit index progression, and interactive split-brain minority partition lab.
   - **Distributed DB**: Consistent hashing ring, virtual nodes (vnodes), PACELC consistency matrix calculator ($R + W > N$).
   - **Redis Cluster**: 16,384 hash slot bar, master-replica failover, CRC16 hashtag parser, MOVED/ASK redirect triggers, and LRU/LFU eviction pressure meters.
   - **Kubernetes**: Level-triggered reconciliation loop, ReplicaSet scaling, pod lifecycle state machines, and multi-node rack capacity allocators.
   - **RabbitMQ**: AMQP 0-9-1 direct/topic/fanout exchanges, routing key pattern matching, FIFO queues, and poison message Dead-Letter Queues (DLQ).
   - **Storage Engine**: B+Tree page traversal / splits alongside LSM-Tree MemTable, Write-Ahead Log (WAL), Leveled Compaction, and Bloom filters.
   - **TCP Networking**: 3-way handshake timeline, sequence/ACK numbering, sliding window buffer, and live AIMD sawtooth congestion curve.

2. **Shared UI Design System (`@the-visualizer/ui`)**:
   - Unified `CanvasShell` with domain switcher dropdown, connection status pills, collapsible chaos controls rail, right inspector drawer, and time-travel timeline scrubber.
   - Global Command Palette (`⌘K` / `Ctrl+K` / `/`).
   - 16 core accessible primitives (`Button`, `Card`, `Badge`, `StatusPill`, `Slider`, `Toggle`, `Select`, `Modal`, `Drawer`, `Tooltip`, `Tabs`, `Gauge`, `ProgressRing`, `Skeleton`, `EmptyState`, `IconButton`).
   - Style guide route at `/design-system`.

3. **Accessibility & Onboarding (WCAG 2.1 AA)**:
   - Interactive 4-step first-run onboarding tour (`OnboardingTour.tsx`) with `localStorage` persistence.
   - Contextual distributed systems glossary tooltips (`GlossaryTooltip.tsx`) covering 15 protocol terms.
   - Screen-reader accessible data table mode (`DataTableModal.tsx`).
   - Global keyboard shortcuts (`/` for command palette, `?` for tour, `Esc` for dismissal).

4. **Engine Determinism & Performance**:
   - Golden determinism test suite (`pnpm test:determinism`) locking hash states across all 8 domains.
   - Headless throughput benchmark measured at **52,000+ ticks/sec** (exceeds 5,000 ticks/sec budget by 10x).
   - Long-running memory stability verified over 10,000 continuous ticks ($< 50\text{ MB}$ delta).

5. **Security & Contract Hardening**:
   - `fast-check` property-based fuzz tests (3,300+ randomized runs) with zero unhandled exceptions.
   - Strict Content Security Policy (CSP), HSTS, X-Frame-Options (`DENY`), and SSRF protections.
   - Reconstitution engine with v1.0 `SimTraceBundle` validation.

6. **Developer Tooling**:
   - Domain generator script: `pnpm create:domain <id> [name]`.
   - Headless CLI simulation runner: `pnpm sim --domain=kafka --ticks=50`.
