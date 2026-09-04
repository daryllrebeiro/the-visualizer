# The Visualizer — Exact Apache Kafka Simulation, Deep Inspection & Chaos Engineering Platform

A high-performance, production-ready simulation, visualization, and chaos engineering platform for **Apache Kafka** and event-driven distributed architectures.

The Visualizer makes invisible distributed system behaviors visible, allowing developers, SREs, and architects to model, test, and understand complex Kafka interactions—including **Murmur2 key hashing**, **physical `.log` segment rolling & compaction**, **Two-Phase Commit (2PC) transactions**, **KRaft metadata quorum failovers**, **In-Sync Replica (ISR) dynamics**, and **consumer group cooperative sticky rebalances**—in real time.

---

## 🌟 Key Features

### 1. Exact Kafka Protocol & Storage Engines (`packages/simulation`)

- **Byte-Level Murmur2 Partitioner**: Exact port of Kafka's Java `Utils.murmur2(key)` and `toPositive(hash) % numPartitions`, ensuring 100% deterministic key-to-partition routing.
- **Physical Disk Log Segments & Compaction**: Simulates on-disk `.log` files (`00000000000000000000.log`), sparse offset indexing (`.index`), segment rolling (`segment.bytes`), and background log compaction deduplicating superseded keys.
- **Two-Phase Commit (2PC) Transactions & LSO**: Monotonic `producerId` and `producerEpoch` fencing against zombie writers, 2PC control markers (`COMMIT`/`ABORT`), and Last Stable Offset (LSO) calculations for `read_committed` consumers.
- **KRaft Metadata Quorum**: Controller elections, voter heartbeats, metadata log replication, and zero-Zookeeper failovers.
- **Deterministic Virtual Timeline**: Built on a seeded pseudo-random number generator (SplitMix32) and discrete event loop. Identical inputs guarantee identical execution across runs.

### 2. Deep-Dive Inspection & Interactive Scenarios

- **Click-to-Inspect Drawer**: Click any node on the canvas to open the inspection drawer:
  - **Partitions**: View on-disk `.log` segments, High-Watermark (HW), Log End Offset (LEO), and live ISR matrix.
  - **Brokers**: Monitor live disk IO, KRaft role, and trigger targeted single-node crash/recovery.
  - **Consumers**: Inspect member IDs, rebalance generation IDs, assigned topic-partitions, and committed offset lag.
  - **Producers & Murmur2 Playground**: Real-time hash calculation sandbox with direct keyed message dispatching.
- **Educational Scenarios & Playbooks**: One-click interactive demonstrations:
  1. _Leader Failover & ISR Shrink / Recovery_
  2. _Consumer Group Cooperative Sticky Rebalance_
  3. _KRaft Metadata Quorum Controller Failover_

### 3. Infinite Canvas Navigation & Deterministic Time-Travel

- **Infinite Canvas**: Smooth mouse wheel zoom ($0.3\times \to 2.5\times$), middle-click/Alt-drag camera panning, and screen-space radar minimap.
- **Deterministic Trace Export & Offline Replay**: Export multi-tick cluster timeline history as downloadable `.json` traces (`💾 Export Trace`) and replay offline runs with the playback scrubber (`📂 Import Trace`).

### 4. Zero-Trust Security & Multi-Tenancy

- **SSRF Protection & Token Auth**: Gateway-level SSRF subnet validation and JWT authentication.
- **Multi-Tier Rate Limiting**: Free-tier rate limiting (20 msgs/sec) with automatic socket backpressure.

---

## 🛠️ Monorepo Architecture

```text
the-visualizer/
├── apps/
│   ├── web/                    # Next.js 15 frontend (Canvas renderer, React Flow, HUD)
│   ├── api/                    # Hono REST API (Stateless backend)
│   └── ws-gateway/             # WebSocket Gateway (Stateful simulation runner)
├── packages/
│   ├── simulation/             # Deterministic Discrete-Event Simulation Engine
│   ├── contracts/              # Shared Zod schemas & domain types
│   ├── config/                 # Monorepo environment configurations
│   ├── logging/                # Structured Pino logging & OpenTelemetry metrics
│   └── test-utils/             # Test fixtures & factories
├── docs/                       # Runbooks, deployment blueprints, & architecture docs
│   └── deployment/             # Production hosting guide
├── docker-compose.yml          # Multi-container production stack (Redis, Postgres, Apps)
```

---

## 🚦 Quick Start

### 1. Single-Command Docker Deployment (Recommended)

```bash
# Start full stack: Postgres, Redis, API, Gateway, and Web
docker compose up --build -d
```

Access the application:

- **Web UI**: `http://localhost:3002`
- **REST API**: `http://localhost:3000`
- **WebSocket Gateway**: `ws://localhost:3001`

### 2. Local Development Setup

```bash
# Install dependencies
pnpm install

# Start databases (Redis on 6379, Postgres on 5432)
docker compose up redis postgres -d

# Run all apps in development mode
pnpm dev
```

---

## 🧪 Testing & Verification

```bash
# Run unit & integration test suites across all packages
pnpm test

# Run simulation package tests (44 tests including E2E lifecycle)
pnpm --filter @the-visualizer/simulation test

# Run gateway test suites (16 tests including Redis queue draining)
pnpm --filter @the-visualizer/ws-gateway test

# Type-check and compile all production bundles
pnpm build
```

---

## 📖 Operational Documentation

- [**13-Domain Feature Explainer**](docs/FEATURE_EXPLAINER.md): Complete navigation matrix and protocol breakdowns for all 13 interactive visualizers (`/kafka`, `/raft`, `/database`, `/redis`, `/kubernetes`, `/rabbitmq`, `/storage`, `/networking`, `/rate-limiter`, `/distributed-lock`, `/cdn-cache`, `/id-gen`, `/transactions`).
- [**Production Hosting Guide**](docs/deployment/HOSTING_GUIDE.md): AWS ECS, GCP Cloud Run, Kubernetes, and Bare-Metal Docker hosting architecture.
- [**How to Run Guide**](HOW_TO_RUN.md): Local development, database migrations, and testing scripts.
- [**How to Use Guide**](HOW_TO_USE.md): Entity inspection, scenario playbooks, canvas controls, and chaos experiments.
- [**Features & Functionalities**](features_and_functionalities.md): Feature matrix and Apache Kafka protocol compliance.
