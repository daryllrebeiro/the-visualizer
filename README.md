# The Visualizer — Kafka Event Streaming Simulation & Visualization

A high-performance, production-ready simulation, visualization, and chaos engineering platform for Apache Kafka and event-driven architectures. 

The Visualizer makes invisible distributed system behaviors visible, allowing developers and SREs to model, test, and understand complex Kafka interactions—including ISR shrinkages, partition leader elections, consumer rebalances, and network partitions—in real time.

---

## 🌟 Key Features

### 1. Authoritative Event Simulation Engine (`packages/simulation`)
* **Deterministic PRNG**: Built on a seeded **SplitMix32** pseudo-random number generator. Identical inputs guarantee identical execution paths across runs, enabling reproducible debugging and shareable bug reports.
* **Time-Travel Scrubbing**: Jump back and forth in simulation time. Powered by keyframe snapshots and sliding reverse-delta JSON Patches (RFC 6902).
* **Headless Capability**: Completely decoupled from HTTP/WebSockets/React; can run in CLI harnesses, CI pipelines, or fuzzing environments.

### 2. High-Performance Visualization Layer
* **Hybrid Renderer**: HTML5 Canvas animates message flows at 60 FPS under heavy throughput, while React Flow manages graph node arrangements (Brokers, Topics, Consumers).
* **Real-Time Instrumentation**: Interactive metrics showing High-Watermarks vs Log End Offsets (LEO), consumer lags, and partition throughput skew heatmaps.

### 3. Distributed Chaos Laboratory
* **Failure Simulation**: Inject broker crashes (`INTENT_CHAOS_KILL_BROKER`) and observe live leader elections and ISR updates.
* **Network Partitioning**: Create split-brain scenarios and isolate metadata controllers or voter quorums.
* **Slow Consumers & Bursts**: Force consumer lags to explode to test threshold alarms and buffer limits.

### 4. Zero-Trust Security & Multi-Tenancy
* **Tenant Isolation**: PostgreSQL Row-Level Security (RLS) ensures organizations can only access their authorized topologies.
* **JWT Connection Upgrades**: Secure WebSocket upgrade handshakes with JWT authentication verification.

---

## 🛠️ Architecture & Monorepo Structure

```text
the-visualizer/
├── apps/
│   ├── web/                    # Next.js frontend
│   ├── api/                    # Hono REST API (Stateless backend)
│   └── ws-gateway/             # WebSocket Gateway (Stateful gateway)
├── packages/
│   ├── simulation/             # Discrete Event Simulation engine
│   ├── contracts/              # Shared Zod schemas & types
│   ├── config/                 # Monorepo environment configurations
│   ├── logging/                # Structured Pino logging & OpenTelemetry
│   └── test-utils/             # Test fixtures & helpers
├── infrastructure/
│   ├── docker/                 # Container files & Compose configs
│   ├── terraform/              # Infrastructure-as-Code for GCP
│   └── monitoring/             # Prometheus scrapers & Grafana dashboards
├── scripts/                    # Database backups, migrations, & tools
└── docs/                       # Runbooks, playbooks, & manuals
```

---

## 📖 Operational Runbooks

* [**Disaster Recovery Playbook**](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/docs/runbooks/disaster-recovery.md): Daily automated backup restoration scripts, PITR (point-in-time recovery) procedures, GCS replication configs, and RTO/RPO targets.
* [**Release Rollback Playbook**](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/docs/runbooks/rollback.md): Step-by-step instructions to revert Cloud Run deployments, revert database migrations, clear Redis caches, and handle gateway failovers.
* [**Production Readiness Audit**](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/docs/runbooks/production-readiness.md): Verification check matrix across Security, Reliability, Performance, Observability, Product, and Operations.

---

## 🚦 Getting Started

To run the application locally, refer to the guides below:
* [**HOW_TO_RUN.md**](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/HOW_TO_RUN.md): Step-by-step installation, Docker containers, environment setups, database migrations, and testing scripts.
* [**HOW_TO_USE.md**](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/HOW_TO_USE.md): Core platform features, interactive timeline scrubbing, chaos injections, and visual cues.
