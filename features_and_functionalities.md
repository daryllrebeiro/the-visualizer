# The Visualizer — Features & Kafka Protocol Capabilities Matrix

This document provides a comprehensive audit of all implemented features, simulation primitives, and UI capabilities in **The Visualizer**.

---

## 1. Apache Kafka Protocol & Storage Engine Fidelity

| Feature / Subsystem | Apache Kafka Spec Reference | Implementation Status | Verified Package / File |
| :--- | :--- | :--- | :--- |
| **Murmur2 Key Partitioner** | `org.apache.kafka.common.utils.Utils.murmur2` | ✅ **Complete** | [`packages/simulation/src/partitioners/murmur2.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/partitioners/murmur2.ts) |
| **Physical Disk Log Segments** | `.log` files (`00000000000000000000.log`), segment rolling | ✅ **Complete** | [`packages/simulation/src/storage/log-segment.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/storage/log-segment.ts) |
| **Sparse Offset Indexing** | `.index` binary offsets mapped to physical byte positions | ✅ **Complete** | [`packages/simulation/src/storage/log-segment.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/storage/log-segment.ts) |
| **Log Compaction** | Key-deduplication retaining highest offset per key | ✅ **Complete** | [`packages/simulation/src/storage/log-segment.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/storage/log-segment.ts) |
| **Log Truncation** | Unclean leader election log offset reconciliation | ✅ **Complete** | [`packages/simulation/src/storage/log-segment.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/storage/log-segment.ts) |
| **2PC Transaction Coordinator** | Two-Phase Commit (`PrepareCommit`, `CompleteCommit`, markers) | ✅ **Complete** | [`packages/simulation/src/transactions/txn-coordinator.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/transactions/txn-coordinator.ts) |
| **Producer ID & Epoch Fencing** | `InitProducerId` monotonic epoch incrementing | ✅ **Complete** | [`packages/simulation/src/transactions/txn-coordinator.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/transactions/txn-coordinator.ts) |
| **Last Stable Offset (LSO)** | `read_committed` vs `read_uncommitted` isolation levels | ✅ **Complete** | [`packages/simulation/src/transactions/txn-coordinator.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/transactions/txn-coordinator.ts) |
| **KRaft Quorum Metadata** | Controller election, metadata log replication, zero-ZK | ✅ **Complete** | [`packages/simulation/src/engine/state-transitions.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/engine/state-transitions.ts) |
| **ISR & Leader Election** | High Watermark (HW) progression, ISR shrink & expansion | ✅ **Complete** | [`packages/simulation/src/engine/state-transitions.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/engine/state-transitions.ts) |
| **Consumer Rebalancing** | Range & Cooperative-Sticky partition assignment protocols | ✅ **Complete** | [`packages/simulation/src/engine/state-transitions.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/engine/state-transitions.ts) |

---

## 2. Interactive User Experience & Visualization

| Capability | Description | Status |
| :--- | :--- | :--- |
| **Click-to-Inspect Drawer** | Slide-out inspection for Partitions (`.log` viewer), Brokers, Consumers, and Producers | ✅ **Complete** |
| **Murmur2 Hash Playground** | Real-time key hashing sandbox computing target partition with instant send trigger | ✅ **Complete** |
| **Educational Scenarios** | 1-click guided playbooks for Leader Failover, Cooperative Rebalance, and KRaft Quorum | ✅ **Complete** |
| **Infinite Canvas Navigation** | Smooth mouse wheel zoom ($0.3\times \to 2.5\times$), middle/Alt drag pan, HUD controls | ✅ **Complete** |
| **Radar Minimap** | Fixed screen-space radar HUD displaying real-time cluster entity coordinates | ✅ **Complete** |
| **Synchronized Auto-Produce** | Circular countdown ring with synchronized, rate-limited server timer dispatching | ✅ **Complete** |
| **Deterministic Time-Travel** | Playback scrubber with forward/reverse JSON Patch state restoration | ✅ **Complete** |
| **JSON Trace Export & Import** | Complete multi-tick timeline export (`.json`) and offline interactive replay | ✅ **Complete** |

---

## 3. Production Infrastructure & Security

| Component | Technology | Status |
| :--- | :--- | :--- |
| **Multi-Container Stack** | Docker Compose with health checks (Web, API, Gateway, Redis 7, Postgres 16) | ✅ **Complete** |
| **Security Headers & CSP** | Content Security Policy, HSTS, X-Frame-Options DENY, X-Content-Type-Options | ✅ **Complete** |
| **SSRF Protection** | Private subnet and loopback IP blocking on webhook dispatches | ✅ **Complete** |
| **Session Rate Limiting** | 20 msgs/sec free-tier token bucket rate limiter with backpressure | ✅ **Complete** |
| **Automated Testing** | 60 total passing tests (44 simulation engine + 16 websocket gateway) | ✅ **Complete** |
