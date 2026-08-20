# TheVisualizer — Consolidated Production Engineering Plan

> This document merges the security-first operational discipline of the original engineering plan with the concrete architecture, technology selections, and domain model specifications of the architecture plan into a single, definitive blueprint.

---

# Part I — Foundations & Principles

---

## 1. Mission Statement

The goal is not to build a demo, a prototype, or a technically impressive visualization.

The goal is to build a **production-grade application that real users can safely depend on** to understand, explore, and teach distributed systems — starting with Apache Kafka.

> **Never rely on the frontend to enforce a security, correctness, or resource constraint.**
>
> The frontend is an untrusted client. Every important constraint must be enforced again at the backend boundary.

---

## 2. System Vision & Value Propositions

**TheVisualizer** is an enterprise-grade, server-authoritative distributed systems visualization and simulation platform built around Apache Kafka (KRaft, distributed logs, ISR replication, consumer group rebalancing, exactly-once transactions).

### Core Value Propositions

1. **Interactive Mental Models**: Visualizes complex distributed protocols (KRaft leader election, ISR shrinkage/expansion, cooperative sticky rebalancing, partition leadership migration, transaction two-phase commits) in real time.
2. **Deterministic Chaos Engineering & Time-Travel Replay**: Simulates network partitions, broker crashes, disk stalls, and consumer lag with 100% deterministic reproducibility using seeded logical clocks and reversible delta histories.
3. **Dual-Execution Engine**:
   - _Client-Side Sandbox (WebWorker)_: Zero-latency, instant single-player exploration and offline lab execution with zero backend compute overhead.
   - _Server-Authoritative Multiplayer Engine_: Multi-tenant, synchronized room collaboration with verified challenge grading, replay sharing, and persistent state.
4. **Live Cluster Introspection (Zero-Trust Read-Only)**: Connects to external Kafka clusters to visualize live metadata, broker health, topic partition distributions, and consumer group lag — with strict SSRF protection and data scrubbing.

---

## 3. Engineering Principles (Non-Negotiable)

The system must be designed from the beginning around these principles. They are not aspirational — they are prerequisites for every phase.

| #   | Principle                                       | Enforcement                                                                                                                                                                                                  |
| :-- | :---------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Zero-Trust Client Boundary**                  | The frontend is strictly a view layer and intention emitter. The server validates, computes, and broadcasts.                                                                                                 |
| 2   | **Server Owns Truth**                           | The client renders state. The server determines state.                                                                                                                                                       |
| 3   | **Hybrid Execution Symmetry**                   | The pure simulation engine has zero I/O dependencies (`window`, `document`, `process`, `fs`, `ws`, `fetch`). Same TypeScript compiles to run in Browser WebWorker (solo) and Node.js worker cluster (rooms). |
| 4   | **Deterministic State Evolution**               | `State(t+1) = f(State(t), Event(t), Seed)`. No `Date.now()`, `Math.random()`, or async timing within the engine. All scheduling uses integer virtual ticks.                                                  |
| 5   | **Time-Travel & Golden Replay**                 | Every simulation run produces a deterministic transaction log. The system supports jumping to tick N, stepping backward via reverse-delta patches, and exporting reproducible JSON test cases.               |
| 6   | **Fail-Closed Security**                        | If any invariant is violated or validation is ambiguous, the operation is rejected and a structured security event is logged.                                                                                |
| 7   | **Defense-in-Depth**                            | Resource limits enforced at Edge, Gateway, Service, and Engine layers. Never depend on only one layer.                                                                                                       |
| 8   | **Every Boundary Validates Data**               | HTTP, WebSocket, database input, imported files, external integrations — all validated.                                                                                                                      |
| 9   | **Every Expensive Operation Has a Budget**      | CPU, memory, events, payloads, connections, storage — all have hard limits.                                                                                                                                  |
| 10  | **Durable Data & Ephemeral State Are Separate** | PostgreSQL = durable application state. Simulation worker = ephemeral runtime state. Object storage = large historical artifacts.                                                                            |
| 11  | **Every Production Bug Gets a Regression Test** | A bug that reaches production should become impossible to silently reintroduce.                                                                                                                              |

---

# Part II — Architecture & Technology

---

## 4. System Architecture Blueprint

```
                                  ┌─────────────────────────────────────────────────────────┐
                                  │                  CLIENT BROWSER                         │
                                  │                                                         │
                                  │  ┌───────────────────────┐   ┌───────────────────────┐  │
                                  │  │   UI & Graph Editing  │   │ High-Perf Rendering   │  │
                                  │  │   React / Next.js     │   │ Canvas 2D / WebGL     │  │
                                  │  │   @xyflow/react       │   │ Particle Engine       │  │
                                  │  └───────────┬───────────┘   └───────────▲───────────┘  │
                                  │              │                           │              │
                                  │  ┌───────────▼───────────────────────────┴───────────┐  │
                                  │  │           Client State & Sync Store               │  │
                                  │  │    (Zustand + Delta Patch Reconciler)             │  │
                                  │  └───────────┬───────────────────────────▲───────────┘  │
                                  │              │                           │              │
                                  │  ┌───────────▼───────────┐   ┌───────────┴───────────┐  │
                                  │  │ Local Sim WebWorker   │   │  Binary WS Client     │  │
                                  │  │ (Solo Sandbox Mode)   │   │  (Multiplayer Mode)   │  │
                                  │  └───────────────────────┘   └───────────▲───────────┘  │
                                  └──────────────────────────────────────────┼──────────────┘
                                                                             │
                                                                 HTTPS / WSS │ (MessagePack / JSON)
                                                                             │
                                  ┌──────────────────────────────────────────▼──────────────┐
                                  │          EDGE GATEWAY / REVERSE PROXY (Envoy / Caddy)   │
                                  │  - TLS Termination & HTTP/2-WSS Upgrades                │
                                  │  - Global Rate Limiting (Token Bucket)                  │
                                  │  - WAF / DDoS Mitigation / Security Headers             │
                                  └──────────────────────┬──────────────────────────────────┘
                                                         │
                                    ┌────────────────────┴────────────────────┐
                                    │                                         │
                    ┌───────────────▼───────────────┐         ┌───────────────▼───────────────┐
                    │      Stateless REST API       │         │    Realtime Session Gateway   │
                    │         (Node.js / Hono)      │         │   (WebSocket Connection Mgr)  │
                    │                               │         │                               │
                    │  - AuthN (Passkeys/OIDC/JWT)  │         │  - Connection Authentication  │
                    │  - AuthZ (Tenant RBAC)        │         │  - Heartbeats & Frame Encoding│
                    │  - Topology / Scenario CRUD   │         │  - Client Ingress Rate Limits │
                    │  - Share Link Resolution      │         │  - Redis Presence / Routing   │
                    └───────────────┬───────────────┘         └───────────────┬───────────────┘
                                    │                                         │
                                    │                           Redis Streams │ Intent Dispatch
                                    │                           & Pub/Sub     │ & Broadcast
                                    │                                         │
                    ┌───────────────▼───────────────┐         ┌───────────────▼───────────────┐
                    │      Primary Persistence      │         │ Distributed Simulation Pool   │
                    │       (PostgreSQL 16)         │         │      (Worker Engine Nodes)    │
                    │                               │         │                               │
                    │  - Row-Level Security (RLS)   │         │  - Deterministic DES Runner   │
                    │  - Topology & Metadata        │         │  - Seeded Logical Clock (Tick)│
                    │  - Scenario Definitions       │         │  - Invariant Verification     │
                    │  - Audit Logs & Usage         │         │  - Periodic Snapshotter       │
                    └───────────────┬───────────────┘         └───────────────┬───────────────┘
                                    │                                         │
                                    └────────────────────┬────────────────────┘
                                                         │
                                              ┌──────────▼──────────┐
                                              │ S3 / Object Storage │
                                              │                     │
                                              │ - Replay Artifacts  │
                                              │ - Topology Backups  │
                                              │ - Export Bundles    │
                                              └─────────────────────┘
```

The architecture must keep the simulation engine independent from React, Next.js, HTTP, WebSockets, PostgreSQL, Redis, and Browser APIs. It should be usable as a standalone library.

---

## 5. Technology Stack & Architecture Decision Records

| Component             | Selected Technology                               | Alternative Evaluated  | Key Rationale                                                                            |
| :-------------------- | :------------------------------------------------ | :--------------------- | :--------------------------------------------------------------------------------------- |
| **Monorepo**          | **Turborepo + pnpm**                              | Nx, Lerna              | Fast remote caching, zero-config workspace dependency graphs, minimal CI overhead.       |
| **Frontend**          | **React 19 + Vite / Next.js 15 (App Router)**     | Remix, Pure SPA        | Client-side rendering for canvas + SSR for marketing, auth, shared topology SEO.         |
| **Node Graph Canvas** | **@xyflow/react (React Flow)**                    | Rete.js, GoJS          | Unmatched React integration, extensible custom node architecture, proven stability.      |
| **Packet Visualizer** | **HTML5 Canvas 2D / Pixi.js**                     | Pure SVG DOM           | SVG degrades at >200 moving elements. Canvas handles 10,000+ animated packets at 60 FPS. |
| **Client State**      | **Zustand + RFC 6902 JSON-Patch / MessagePack**   | Yjs, Automerge (CRDT)  | Server-authoritative deterministic sim; CRDT is redundant overhead.                      |
| **Backend**           | **Node.js LTS / Hono**                            | Express, Nest.js       | Ultra-low overhead, native TypeScript, Web Standards API support.                        |
| **Realtime Gateway**  | **`uWebSockets.js` or `ws` + Redis Streams**      | Socket.io              | ~2KB vs ~50KB per connection, clean binary buffer handling.                              |
| **Database**          | **PostgreSQL 16 + Drizzle ORM**                   | Prisma, TypeORM        | Zero-overhead SQL type safety, native RLS, fast connection pooling.                      |
| **Cache & Pub/Sub**   | **Redis 7 (Cluster / Dragonfly)**                 | RabbitMQ, NATS         | Session routing, presence, sliding-window rate limiting, pub/sub broadcast.              |
| **Validation**        | **Zod v3 (TypeBox for hot paths)**                | Joi, Yup               | Single source of truth: TypeScript types inferred from runtime schemas.                  |
| **Observability**     | **OpenTelemetry + Prometheus + Grafana + Sentry** | Datadog                | Vendor-agnostic tracing, custom metrics (`sim_ticks_total`, `active_ws_connections`).    |
| **CI/CD**             | **GitHub Actions**                                | GitLab CI, CircleCI    | Native monorepo caching, broad ecosystem, OIDC integration for deployments.              |
| **IaC**               | **Terraform**                                     | Pulumi, CloudFormation | Multi-cloud, state-driven, mature module ecosystem.                                      |

---

## 6. Repository Structure

```text
thevisualizer/
│
├── apps/
│   ├── web/                    # Next.js frontend
│   ├── api/                    # Hono REST API server
│   └── ws-gateway/             # WebSocket realtime gateway
│
├── packages/
│   ├── simulation/             # Pure deterministic DES engine (zero I/O deps)
│   ├── contracts/              # Zod schemas, TypeScript types, wire protocols
│   ├── ui/                     # Shared React components & design tokens
│   ├── config/                 # Environment config, feature flags
│   ├── logging/                # Structured logging (pino + OpenTelemetry)
│   └── test-utils/             # Shared test fixtures, factories, helpers
│
├── infrastructure/
│   ├── docker/                 # Docker Compose for local dev
│   ├── terraform/              # Production IaC
│   └── monitoring/             # Grafana dashboards, alert rules
│
├── docs/
│   ├── architecture/           # ADRs, system design documents
│   ├── security/               # Threat model, data classification
│   ├── api/                    # OpenAPI specs
│   └── runbooks/               # Operational playbooks
│
├── scripts/                    # Dev tooling, seed scripts, migration helpers
│
├── .github/
│   └── workflows/              # CI/CD pipelines
│
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

---

# Part III — Domain Model & Simulation Engine

---

## 7. Kafka Domain Model

The simulation engine models Kafka's distributed protocol faithfully.

```
                               ┌───────────────────────────────────────────────────────────┐
                               │                      KAFKA CLUSTER                        │
                               │                                                           │
                               │  ┌─────────────────────────────────────────────────────┐  │
                               │  │               KRaft Metadata Quorum                 │  │
                               │  │  Active Controller: Node 1  │ Voters: [1, 2, 3]     │  │
                               │  │  Epoch: 4                   │ Metadata Offset: 1420 │  │
                               │  └─────────────────────────────────────────────────────┘  │
                               │                                                           │
                               │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
                               │  │ Broker 1 (RackA)│ │ Broker 2 (RackB)│ │ Broker 3 (RackC)│ │
                               │  │  P0 (Leader)    │ │  P0 (Follower)  │ │  P0 (Follower)  │ │
                               │  │  LEO: 105       │ │  LEO: 104       │ │  LEO: 98 (Lag)  │ │
                               │  │  HW:  104       │ │  HW:  104       │ │  HW:  104       │ │
                               │  │  ISR: [1, 2]    │ │  ISR: [1, 2]    │ │  ISR: [1, 2]    │ │
                               │  └─────────────────┘ └─────────────────┘ └─────────────────┘ │
                               └───────────────────────────────────────────────────────────┘
```

### 7.1 Domain Entities

The authoritative domain model lives in `packages/contracts` and includes:

**Application Entities**: User, Organization, Membership, Topology, Scenario, Snapshot, ShareLink, AuditEvent

**Kafka Protocol Entities**: BrokerNode, TopicPartition, PartitionReplica, ConsumerGroup, ConsumerGroupMember, TransactionMetadata

```typescript
// packages/contracts/src/domain/kafka.ts

export type NodeId = string;
export type TopicName = string;
export type PartitionId = number;

export interface BrokerNode {
  readonly id: NodeId;
  readonly host: string;
  readonly port: number;
  readonly rack?: string;
  status: 'ALIVE' | 'DEGRADED' | 'CRASHED' | 'RECOVERING';
  diskUsageBytes: number;
  maxDiskSizeBytes: number;
}

export interface TopicPartition {
  readonly topic: TopicName;
  readonly partition: PartitionId;
  leaderBrokerId: NodeId | null;
  leaderEpoch: number;
  replicas: PartitionReplica[];
  isr: NodeId[]; // In-Sync Replicas ⊆ Replicas
  highWatermark: number; // HW ≤ min(LEO of all ISR members)
  minInsyncReplicas: number;
  uncleanLeaderElectionEnabled: boolean;
}

export interface ConsumerGroup {
  readonly id: string;
  state: 'Empty' | 'PreparingRebalance' | 'CompletingRebalance' | 'Stable' | 'Dead';
  protocol: 'range' | 'roundrobin' | 'cooperative-sticky';
  generationId: number;
  leaderMemberId: string | null;
  members: Record<string, ConsumerGroupMember>;
  committedOffsets: Record<string, Record<PartitionId, number>>;
}

export interface TransactionMetadata {
  readonly transactionalId: string;
  producerId: number;
  producerEpoch: number;
  state:
    'Empty' | 'Ongoing' | 'PrepareCommit' | 'PrepareAbort' | 'CompleteCommit' | 'CompleteAbort';
  partitionsInTxn: Array<{ topic: TopicName; partition: PartitionId }>;
}
```

### 7.2 Invariants Enforced on Every Simulation Tick

These are asserted programmatically after every state transition. Violation crashes the simulation with a reproducible dump.

| #   | Invariant                       | Formal Constraint                                                                                     |
| :-- | :------------------------------ | :---------------------------------------------------------------------------------------------------- |
| 1   | **Partition Leader Uniqueness** | For any (Topic, Partition), \|Leader\| ≤ 1                                                            |
| 2   | **Strict ISR Inclusion**        | ∀p: ISR(p) ⊆ Replicas(p)                                                                              |
| 3   | **High-Watermark Bound**        | ∀p: HW(p) ≤ min(LEO(b, p)) for b ∈ ISR(p)                                                             |
| 4   | **Monotonic Log Offsets**       | LEO(b, p) is strictly non-decreasing                                                                  |
| 5   | **Epoch/Generation Fencing**    | Stale LeaderEpoch produces → `FENCED_LEADER_EPOCH`; stale GenerationId commits → `ILLEGAL_GENERATION` |
| 6   | **Min ISR Acknowledgment**      | When acks=all, produce succeeds iff \|ISR(p)\| ≥ MinInSyncReplicas(p)                                 |
| 7   | **Message Accounting**          | Consumed messages ≤ produced messages; committed offset ≤ HW                                          |
| 8   | **Eventual ISR Convergence**    | After broker recovery, ISR eventually converges                                                       |

### 7.3 Versioned Contracts

Create versioned contracts for:

- REST APIs (OpenAPI 3.1)
- WebSocket messages (MessagePack + JSON fallback)
- Simulation events
- Topology import/export schemas
- Saved topology format

All contracts use runtime validation (Zod) so that compile-time safety + runtime safety are both guaranteed.

**Critical rule**: The server must derive ownership from the authenticated session. Never trust `{ "ownerId": "someone-else" }` from the client.

---

## 8. Discrete Event Simulation Engine

The simulation engine (`packages/simulation`) is the most important technical component.

```
                           ┌──────────────────────────────────────────────────┐
                           │          Virtual Priority Queue (Min-Heap)       │
                           │   [Tick 102: Broker2.Heartbeat]                  │
                           │   [Tick 105: Producer1.ProduceRecord]            │
                           │   [Tick 110: Broker1.ReplicationFetch]           │
                           └────────────────────────┬─────────────────────────┘
                                                    │ pop()
                                                    ▼
                               ┌──────────────────────────────────────────────┐
                               │           Step Execution Pipeline            │
                               │                                              │
                               │  1. Advance Virtual Timestamp                │
                               │  2. Apply Deterministic State Transition     │
                               │  3. Assert Invariants (Crash if violated)    │
                               │  4. Compute Reverse-Delta (Time Travel)      │
                               │  5. Schedule Subsequent Events               │
                               │  6. Emit Authoritative Event Batch           │
                               └──────────────────────────────────────────────┘
```

### 8.1 Deterministic PRNG

All randomized behaviors use a **SplitMix32** PRNG seeded per session:

```typescript
export class DeterministicRNG {
  private state: number;
  constructor(seed: number) {
    this.state = seed | 0;
  }
  public nextFloat(): number {
    this.state = (this.state + 0x9e3779b9) | 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return ((z ^ (z >>> 16)) >>> 0) / 4294967296;
  }
}
```

Given `initialState + seed + eventSequence`, the engine must produce identical output across repeated runs. This enables: replay, debugging, bug reports, scenario sharing, regression testing, time travel, reproducible failures.

### 8.2 Time-Travel & Snapshot Memory Management

- **Keyframe Snapshots**: Full deep-clone snapshot every 500 virtual ticks or 1,000 events.
- **Delta Stream**: JSON patches (RFC 6902) generated between steps.
- **Reverse Delta Buffer**: Sliding window of last 2,000 steps for immediate backward scrubbing without full replay.

### 8.3 Engine Boundaries

The engine must NOT know about: HTTP, WebSocket, React, Browser storage, PostgreSQL, Redis. It must be runnable entirely headlessly via CLI or test harness.

---

# Part IV — Infrastructure & Protocols

---

## 9. WebSocket & Realtime Sync Protocol

### 9.1 Intent-Based Communication

The client sends **intents**. The server owns the simulation.

```text
Client  →  intent  →  WebSocket Server  →  validate  →  Authorization
  →  validate  →  Simulation Engine  →  state transition  →  Event  →  Broadcast
```

Never allow: `Client → arbitrary simulation state`.

#### Client → Server (Intents Only)

```typescript
export type ClientIntent =
  | {
      id: string;
      type: 'INTENT_PRODUCE';
      topic: string;
      partition?: number;
      key: string;
      value: string;
      acks: 0 | 1 | -1;
    }
  | {
      id: string;
      type: 'INTENT_CONSUMER_JOIN';
      groupId: string;
      clientId: string;
      topics: string[];
    }
  | { id: string; type: 'INTENT_CONSUMER_LEAVE'; groupId: string; memberId: string }
  | {
      id: string;
      type: 'INTENT_COMMIT_OFFSET';
      groupId: string;
      memberId: string;
      topic: string;
      partition: number;
      offset: number;
    }
  | { id: string; type: 'INTENT_CHAOS_KILL_BROKER'; brokerId: string }
  | { id: string; type: 'INTENT_CHAOS_RECOVER_BROKER'; brokerId: string }
  | {
      id: string;
      type: 'INTENT_CHAOS_NETWORK_PARTITION';
      isolatedBrokerIds: string[];
      durationTicks: number;
    }
  | {
      id: string;
      type: 'INTENT_SIM_CONTROL';
      action: 'PLAY' | 'PAUSE' | 'STEP_FORWARD' | 'STEP_BACK' | 'SET_SPEED';
      speedMultiplier?: number;
    }
  | { id: string; type: 'INTENT_REQUEST_SNAPSHOT' };
```

#### Server → Client (Authoritative Updates)

```typescript
export type ServerMessage =
  | {
      type: 'MSG_INIT_SNAPSHOT';
      sessionId: string;
      serverTick: number;
      state: SimulationState;
      sessionConfig: SessionLimits;
    }
  | {
      type: 'MSG_EVENT_BATCH';
      fromSeq: number;
      toSeq: number;
      serverTick: number;
      events: SimulationEvent[];
      patches: JsonPatchOperation[];
    }
  | { type: 'MSG_INTENT_ACK'; intentId: string; status: 'ACCEPTED' | 'REJECTED'; reason?: string }
  | { type: 'MSG_INVARIANT_VIOLATION'; invariantName: string; details: string; dumpUrl?: string }
  | {
      type: 'MSG_PRESENCE_UPDATE';
      activeUsers: Array<{ userId: string; name: string; cursor?: { x: number; y: number } }>;
    };
```

### 9.2 WebSocket Security Requirements

- Authentication during connection upgrade
- Authorization per session
- Message schema validation (Zod)
- Message size limits
- Rate limits per client
- Connection limits per user
- Idle timeouts + heartbeats (ping/pong, 10s eviction)
- Reconnection with snapshot recovery
- Backpressure handling
- Monotonic sequence numbers

### 9.3 Sequence Gap Detection & Self-Healing

```text
Client expects Seq 204, receives Seq 206 (gap!)
  → Client buffers Seq 206, sends INTENT_REQUEST_SNAPSHOT
  → Server sends authoritative Snapshot at Seq 206
  → Client resets local state, flushes buffer, resumes rendering
```

### 9.4 Synchronization Model

```text
Initial snapshot  +  Incremental events  +  Periodic snapshots
```

Each event carries: `sessionId`, `sequenceNumber`, `simulationTime`, `eventId`, `eventType`, `payload`.

---

## 10. High-Performance Visualization Architecture

To maintain **60–120 FPS** on complex topologies (50 brokers, 500 partitions, 5,000 animated packets):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VIEWPORT CONTAINER                              │
│                                                                        │
│  Layer 1 (Bottom): HTML5 Canvas — Particle & Packet Flight Renderer   │
│  - Animated message dots along bezier splines                         │
│  - requestAnimationFrame + lerp interpolation render loop              │
│  - Particle pooling: zero runtime GC allocations                       │
│                                                                        │
│  Layer 2 (Middle): React Flow Node Graph                               │
│  - Brokers, Topics, Partitions, Producers, Consumer Groups             │
│  - Zoom / Pan / Drag-and-Drop topology construction                    │
│  - React.memo + shallow equality optimization                          │
│                                                                        │
│  Layer 3 (Top): HTML HUD / Inspector & Timeline Controls               │
│  - High-Watermark vs LEO log viewers                                  │
│  - Time-travel scrubber & Chaos action dock                           │
│  - Accessible keyboard navigation & ARIA live-regions                  │
└────────────────────────────────────────────────────────────────────────┘
```

### Frontend Performance Rules

- Do NOT create one heavy DOM element for every message.
- Use Canvas/SVG strategically for particle rendering.
- Particle pooling — zero allocation in the render loop.
- Animation throttling & batched state updates.
- Memoization & virtualization where appropriate.

### Accessibility

- Keyboard navigation
- Screen readers
- `prefers-reduced-motion` support
- Sufficient contrast ratios
- Visible focus states
- Accessible controls

---

## 11. Multi-Tenant Database Design

### PostgreSQL Schema

```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE memberships (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
    PRIMARY KEY (user_id, org_id)
);

CREATE TABLE topologies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    visibility VARCHAR(32) NOT NULL DEFAULT 'PRIVATE'
        CHECK (visibility IN ('PRIVATE', 'UNLISTED', 'PUBLIC')),
    share_token VARCHAR(64) UNIQUE,
    spec_version INT NOT NULL DEFAULT 1,
    definition JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE simulation_replays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topology_id UUID REFERENCES topologies(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    seed INT NOT NULL,
    duration_ticks INT NOT NULL,
    total_events INT NOT NULL,
    artifact_storage_url TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Row-Level Security
ALTER TABLE topologies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON topologies FOR ALL USING (
    org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid())
    OR visibility = 'PUBLIC'
    OR (visibility = 'UNLISTED' AND share_token IS NOT NULL)
);
```

### Database Requirements

- Foreign keys, unique constraints, appropriate indexes
- Transactions with optimistic concurrency
- Soft deletion where required
- Migration discipline (forward-only in production)
- Connection pooling + query timeouts
- Never construct SQL from raw user input

### Tenant Isolation Flow

```text
GET /topologies/:id → Authenticate → Load topology → Verify access → Return

NEVER: GET /topologies/:id → Load by ID → Return
```

---

# Part V — Security & Abuse Prevention

---

## 12. Security Requirements (Every Phase)

The system must:

- Treat all client input as malicious/untrusted
- Validate every API request, WebSocket message, and imported file
- Enforce authorization server-side
- Prevent cross-tenant data access
- Rate-limit expensive operations
- Apply hard resource limits to simulations
- Avoid arbitrary code execution and dynamic code evaluation
- Never execute user-provided JavaScript
- Never deserialize unsafe executable objects
- Never trust client-provided ownership information
- Never expose internal errors to users
- Never store secrets in source control
- Never log credentials or tokens
- Use secure HTTP headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame protections)
- Use secure cookies (`HttpOnly`, `SameSite=Strict`, `Secure`)
- Use TLS everywhere in production
- Keep dependencies continuously patched

## 13. Threat Model

Document and address before implementation:

| Category                | Threats                                                                                                    |
| :---------------------- | :--------------------------------------------------------------------------------------------------------- |
| **Input Attacks**       | Malicious topology uploads, oversized payloads, WebSocket flooding, prototype pollution, path traversal    |
| **Resource Exhaustion** | CPU exhaustion, memory exhaustion, event queue overflow, connection flooding                               |
| **Identity & Access**   | Session hijacking, broken access control, IDOR, CSRF, authentication bypass, credential theft in Live Mode |
| **Injection**           | XSS, SQL injection, log injection, SSRF, request smuggling                                                 |
| **Data Leakage**        | Cross-tenant data leakage, secret leakage, replay attacks                                                  |
| **Infrastructure**      | Dependency compromise, WebSocket message manipulation, malicious share links, DoS                          |

## 14. Multi-Layer Resource Limits

| Resource                           | Free Tier | Pro Tier | Hard System Limit      |
| :--------------------------------- | :-------- | :------- | :--------------------- |
| **Brokers per Cluster**            | 6         | 30       | 100                    |
| **Partitions per Topic**           | 12        | 50       | 250                    |
| **Concurrent Producers/Consumers** | 20        | 100      | 500                    |
| **Virtual Simulation Ticks**       | 5,000     | 100,000  | 500,000                |
| **WebSocket msgs/sec**             | 20        | 100      | 250 (drop & throttle)  |
| **Simulation Worker Memory**       | 64 MB     | 256 MB   | 512 MB (hard OOM kill) |
| **Topology File Upload**           | 512 KB    | 5 MB     | 10 MB                  |

Limits enforced at **every** layer:

```text
Frontend limit → API validation → WebSocket validation
  → Application service → Simulation engine → Worker resource budget
```

### Worker Protection

A simulation session must have: CPU budget, memory budget, event queue limit, maximum runtime, maximum event throughput. If exceeded:

```text
Stop simulation safely → Record reason → Notify client → Release resources
```

## 15. SSRF Protection for Live Cluster Introspection

1. **Private IP Blocklist**: Deny `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.169.254`, `::1`
2. **DNS Rebinding Shield**: Re-verify resolved IP immediately before TCP socket creation
3. **No Credential Storage**: SASL/SCRAM and TLS certs processed in ephemeral memory only
4. **Data Redaction**: Payloads masked by default (`"val***"`)

## 16. Sharing & Public Content Security

Sharing modes: `PRIVATE`, `UNLISTED`, `PUBLIC`.

- Use cryptographically unpredictable identifiers (`nanoid(32)`). Sequential IDs are not sufficient protection.
- Public content must not contain user secrets, tokens, internal IDs, or infrastructure details.
- Forking creates an independent copy. Forked users cannot mutate the original.

---

# Part VI — Implementation Milestones

---

## 17. Milestone Dependency Graph

```
   ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
   │ M00     ├────►│ M01     ├────►│ M02     ├────►│ M03     ├────►│ M04     │
   │ Product │     │ Repo &  │     │ Domain  │     │ Sim     │     │ Property│
   │ + Threat│     │ CI/CD   │     │ Model   │     │ Engine  │     │ Testing │
   └─────────┘     └─────────┘     └─────────┘     └─────────┘     └────┬────┘
                                                                        │
   ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐          │
   │ M09     │◄────┤ M08     │◄────┤ M07     │◄────┤ M05/M06 │◄─────────┘
   │ Chaos & │     │ Frontend│     │ WS Real-│     │ Persist │
   │ Scenarios│    │ Canvas  │     │ time    │     │ + Auth  │
   └────┬────┘     └─────────┘     └─────────┘     └─────────┘
        │
   ┌────▼────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
   │ M10     ├────►│ M11     ├────►│ M12     ├────►│ M13     │
   │ Security│     │ Observe │     │ Deploy  │     │ Beta &  │
   │ Harden  │     │ & Load  │     │ & DR    │     │ GA      │
   └─────────┘     └─────────┘     └─────────┘     └─────────┘
```

---

### Milestone 00 — Product Boundaries & Threat Model

**Objective**: Before writing significant application code, establish exactly what the system is and is not allowed to do.

**Deliverables**:

- Product requirements document defining: user personas, supported browsers/devices, maximum topology size, simulation duration, concurrent sessions per user, users per collaborative session, events per simulated second, saved topology size, event-log size, sharing semantics, account requirements, data retention policy.
- Comprehensive threat model document covering all attack surfaces in §13.
- Data classification policy (what is sensitive, what is public).
- Architecture Decision Records (ADRs) for all technology choices in §5.
- Resource limits document with tiered values per §14.
- Browser support matrix.

**Exit Gate**:

- [ ] All major attack surfaces documented
- [ ] All sensitive data classified
- [ ] Maximum resource limits defined
- [ ] Architecture reviewed against threat model
- [ ] No implementation proceeds with unresolved critical architectural risks

---

### Milestone 01 — Monorepo Architecture & CI/CD Governance

**Objective**: Create a repository that makes incorrect code difficult to merge.

**Deliverables**:

- Turborepo + pnpm workspace per §6 (`apps/web`, `apps/api`, `apps/ws-gateway`, `packages/simulation`, `packages/contracts`, `packages/ui`, `packages/config`, `packages/logging`, `packages/test-utils`).
- TypeScript strict mode (`noImplicitAny`, `exactOptionalPropertyTypes`, `strictNullChecks`, `noUncheckedIndexedAccess`).
- ESLint + Prettier + import boundary rules + conventional commits.
- Pre-commit hooks (lint-staged + husky).
- GitHub Actions CI pipeline:

```text
Install → Lint → Typecheck → Unit tests → Integration tests
  → Secret scanning (TruffleHog) → Build → Container scan (Trivy)
```

- No merge when required checks fail.

**Exit Gate**:

- [ ] `pnpm install && pnpm build && pnpm test` succeeds on clean checkout in < 120s
- [ ] Fresh environment runs `pnpm dev` without undocumented manual configuration

---

### Milestone 02 — Authoritative Domain Model & Schemas

**Objective**: Create one authoritative definition of the application's domain with compile-time AND runtime safety.

**Deliverables**:

- Full TypeScript domain model in `packages/contracts` per §7.1.
- Zod runtime schemas for every domain entity with JSON Schema export.
- Versioned wire protocol contracts for REST, WebSocket, simulation events, topology import/export.
- Serialization/deserialization benchmarks (< 1ms per 1,000 events).

**Exit Gate**:

- [ ] Domain model documented
- [ ] Runtime schemas reject all malformed inputs and prevent prototype pollution
- [ ] Contracts versioned with backward-compatibility strategy
- [ ] No frontend-only domain constraints

---

### Milestone 03 — Headless Deterministic Simulation Engine

**Objective**: Build the core simulation engine independently of all I/O.

**Deliverables**:

- Core Min-Heap Priority Queue and `VirtualTimeline` scheduler in `packages/simulation`.
- State machine models for: KRaft Leader Election, Partition High-Watermark calculation, ISR contraction/expansion, Consumer Group Cooperative Rebalancing.
- SplitMix32 PRNG integration per §8.1.
- In-memory snapshotter and RFC 6902 delta patch calculator per §8.2.
- All 8 invariants from §7.2 asserted on every tick.

**Exit Gate**:

- [ ] Engine runs entirely headlessly (CLI or test harness)
- [ ] 10,000 steps with same seed produces bit-for-bit identical state hashes across 100 independent runs
- [ ] Engine has zero dependencies on HTTP, WebSocket, React, Browser, PostgreSQL, or Redis

---

### Milestone 04 — Invariant Verification & Property-Based Fuzzing

**Objective**: Prove the simulation is internally consistent under arbitrary chaos.

**Deliverables**:

- `fast-check` property-based testing harness generating random interleaved sequences:
  ```text
  produce → crash broker → recover → join consumer → leave consumer
    → rebalance → commit → crash broker → recover
  ```
- Runtime invariant assert framework checking all 8 invariants on every tick.
- Automated failure minimizer: shrinks failing sequences into minimal reproducible test cases.
- Regression scenario library with saved seeds.

**Exit Gate**:

- [ ] 500,000 randomized chaos iterations execute without unhandled invariant violation
- [ ] Critical bugs produce reproducible seed + event log
- [ ] Regression scenarios archived and run in CI

---

### Milestone 05 — Persistence Layer & Multi-Tenant Data Architecture

**Objective**: Build durable persistence without putting hot simulation state into the database.

**Deliverables**:

- PostgreSQL 16 migrations via Drizzle ORM per §11.
- Tenant isolation with Row-Level Security (RLS).
- Repository interfaces with connection pooling, statement timeouts, optimistic concurrency locks.
- Redis cache layer for topology metadata and session presence.
- Backup strategy documented with initial restore test.

**Exit Gate**:

- [ ] Migration system works (up/down)
- [ ] Automated integration tests confirm User A cannot read/mutate User B's topologies under any header/parameter tampering
- [ ] Backup restore has been tested at least once
- [ ] Cross-user access tests fail safely

---

### Milestone 06 — Backend Application Services & Identity Management

**Objective**: Expose simulation and persistence through secure application APIs with proper identity.

**Deliverables**:

- Hono HTTP REST API with OpenAPI (Swagger) generation.
- Clean architecture: `Controller → Service → Domain → Repository` (no business logic in HTTP handlers).
- Authentication: OIDC (Google/GitHub), Magic Links, Session Tokens in `HttpOnly, SameSite=Strict, Secure` cookies.
- Session management: expiration, logout, revocation, CSRF protection.
- RBAC authorization middleware (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`).
- Cryptographically secure share links (`nanoid(32)` tokens).
- Every endpoint defines: auth requirement, authz requirement, request schema, response schema, error contract, rate limit, max payload, audit requirement.

**Exit Gate**:

- [ ] OWASP ASVS Level 2 compliance on auth endpoints
- [ ] User A cannot read/modify User B's topology
- [ ] Viewer cannot edit
- [ ] Expired/revoked sessions are rejected
- [ ] No business logic in HTTP handlers

---

### Milestone 07 — WebSocket Realtime Gateway & Session Cluster

**Objective**: Create reliable server-authoritative real-time communication per §9.

**Deliverables**:

- `uWebSockets.js` connection gateway handling binary MessagePack frames.
- Distributed session pub/sub via Redis Streams.
- Sequence tracking, gap detection, and self-healing snapshot synchronization per §9.3.
- Client heartbeat ping/pong with connection eviction at 10s timeout.
- Full WebSocket security checklist per §9.2.

**Exit Gate**:

- [ ] 1,000 simulated concurrent WebSocket clients receive ordered events with zero frame loss during controlled server restarts
- [ ] Two clients remain consistent under: packet delay, message loss, reconnection, slow clients, temporary server interruptions

---

### Milestone 08 — High-Performance Canvas & Interactive UI

**Objective**: Build a responsive UI that never independently simulates Kafka behavior.

**Deliverables**:

- `@xyflow/react` node graph workspace with custom SVG broker nodes, partition indicators, consumer group docks.
- Dual-layer Canvas 2D particle engine for 60 FPS message flight animations per §10.
- Client-side WebWorker simulation runner for zero-latency standalone sandbox mode.
- Interactive inspector panels (Partition LEO/HW, Consumer Lag graphs, Event Log Table).
- Complete onboarding flow, empty states, error states, loading states.
- Accessibility per §10.

**Exit Gate**:

- [ ] Lighthouse Performance score ≥ 90
- [ ] Stable 60 FPS under 100 brokers + 500 animated packets in Chromium/Firefox/Safari
- [ ] Large topologies remain usable without browser freezes
- [ ] Mobile behavior acceptable

---

### Milestone 09 — Chaos Engineering & Scenario Lab System

**Objective**: Make failure scenarios first-class domain objects.

**Deliverables**:

- Chaos triggers: Broker Kill/Restart, Network Partitions, Slow Disk, Consumer Hangs, Leader Fencing, Producer Burst, Consumer Slowdown, Replication Lag.
- Scenario format: `{ metadata, topology, seed, eventSequence }`.
- Guided interactive scenario engine (e.g., _"Recover from an Unclean Leader Election"_).
- Deterministic lab grading harness verifying solutions against target end-states.
- Users can save and replay exact scenarios with shareable URLs.

**Exit Gate**:

- [ ] 10 built-in scenarios with step-by-step validation and shareable replay URLs
- [ ] Every major chaos scenario has: automated test, visual representation, deterministic replay, documented expected result

---

### Milestone 10 — Security Hardening

**Objective**: Dedicated security engineering sweep before production.

**Deliverables**:

- HTTP security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame protections, SameSite cookies.
- Input validation on: JSON, query params, path params, headers, WebSocket messages, imported files, export requests.
- Protection against: XSS, CSRF, SQL injection, IDOR, SSRF, prototype pollution, path traversal, request smuggling, DoS, rate-limit bypass, authentication bypass.
- Multi-tier Token Bucket rate limiting via Redis per §14.
- SSRF protection per §15.
- Worker memory caps with sandboxed execution timeouts.
- File handling: size limits, MIME validation, content validation, safe filenames, path traversal prevention, retention limits. Never execute uploaded content.
- Secrets management: secrets exist only in secret manager or secure env vars. Never in git, Docker images, logs, client bundles, or DB plaintext.

**Exit Gate**:

- [ ] Automated penetration test suite (OWASP ZAP) runs with zero High or Critical vulnerabilities
- [ ] Security checklist completed
- [ ] Dependency scanning, secret scanning enabled in CI
- [ ] No unresolved critical/high vulnerabilities

---

### Milestone 11 — Observability & Load Testing

**Objective**: Make production failures diagnosable and test before real users discover limits.

**Observability Deliverables**:

- Every request carries: `requestId`, `userId`, `sessionId`, `topologyId`, `traceId` (never secrets).
- Structured JSON logging:
  ```json
  {
    "level": "error",
    "event": "simulation_failed",
    "sessionId": "...",
    "errorCode": "SIMULATION_RESOURCE_LIMIT"
  }
  ```
- OpenTelemetry auto-instrumentation → Prometheus/Grafana.
- Metrics tracked:

| Category        | Metrics                                                                                       |
| :-------------- | :-------------------------------------------------------------------------------------------- |
| **Application** | Request count, error rate, latency, auth failures, rate-limit events                          |
| **Simulation**  | Active sessions, events/sec, queue size, worker CPU/memory, duration, failures                |
| **WebSocket**   | Connections, disconnects, reconnects, msgs/sec, dropped msgs, snapshot requests, backpressure |
| **Database**    | Pool usage, query latency, failed/slow queries                                                |

- Alerts on: error spikes, memory growth, worker crashes, DB/Redis failures, WS failure spikes, abnormal traffic, queue growth, CPU saturation.

**Load Testing Deliverables**:

- k6 scripts for: 10, 50, 100, 500, 1,000 concurrent users.
- Test: API load, WebSocket load, simulation CPU/memory, DB/Redis load, browser rendering, large topologies, long-running simulations.
- Failure tests: kill worker, kill API, restart Redis, restart DB, disconnect browser, delay network, drop WS messages, send malformed messages.

**Exit Gate**:

- [ ] Production incidents investigable without local reproduction
- [ ] System has known capacity limits expressed as: "At X concurrent sessions, p95 latency is Y and CPU is Z"
- [ ] No unbounded queue growth
- [ ] Dashboards and alerts configured

---

### Milestone 12 — Deployment, Infrastructure & Disaster Recovery

**Objective**: Create repeatable, secure deployments with tested disaster recovery.

**Deployment Deliverables**:

- Environments: `local → development → staging → production`. Never test production behavior in production.
- Deployment pipeline:
  ```text
  Git push → CI → Tests → Security scans → Build → Container scan
    → Staging deployment → Smoke tests → Approval → Production
  ```
- Blue/Green zero-downtime deployments with automated health/readiness checks and instant rollback.
- Graceful shutdown with connection draining.
- Database migration strategy (forward-only, with rollback plan).
- Infrastructure as Code (Terraform).
- Docker Compose for local development parity.

**Disaster Recovery Deliverables**:

- PostgreSQL: automated daily backups, point-in-time recovery, backup retention, restore testing.
- Redis: not the sole source of durable truth. If Redis disappears, sessions reconnect but permanent data is safe.
- Object storage: versioning, lifecycle policies, private buckets, least-privilege credentials.
- Recovery objectives: RPO < 1 hour, RTO < 2 hours (initial targets, adjust with product requirements).

**Exit Gate**:

- [ ] Production can be recreated from documented infrastructure + secrets configuration
- [ ] Disaster recovery procedure documented and tested
- [ ] Worker crash recovery tested
- [ ] Graceful shutdown tested

---

### Milestone 13 — Production Readiness Review, Beta & GA

**Objective**: Formal review, controlled launch, and operational excellence.

#### Production Readiness Review Checklist

**Security**:

- [ ] Threat model reviewed
- [ ] Authentication tested
- [ ] Authorization tested
- [ ] Tenant isolation tested
- [ ] Rate limits tested
- [ ] WebSocket security tested
- [ ] CSP configured
- [ ] Secrets audited
- [ ] Dependency vulnerabilities reviewed
- [ ] Secret scanning enabled
- [ ] Security headers verified

**Reliability**:

- [ ] Database backups verified
- [ ] Restore tested
- [ ] Worker crash recovery tested
- [ ] WebSocket reconnect tested
- [ ] Graceful shutdown tested
- [ ] Failure scenarios documented

**Performance**:

- [ ] Load testing completed
- [ ] Browser performance tested
- [ ] Memory leaks investigated
- [ ] Simulation limits established
- [ ] WebSocket throughput tested

**Observability**:

- [ ] Logs available
- [ ] Metrics available
- [ ] Error tracking available
- [ ] Alerts configured
- [ ] Dashboards created
- [ ] Request correlation implemented

**Product**:

- [ ] Onboarding complete
- [ ] Empty states complete
- [ ] Error states complete
- [ ] Loading states complete
- [ ] Mobile behavior acceptable
- [ ] Accessibility reviewed
- [ ] Documentation published

**Operations**:

- [ ] Deployment documented
- [ ] Rollback documented
- [ ] Incident response documented
- [ ] Disaster recovery documented
- [ ] On-call ownership defined

#### Controlled Beta Launch

Do not immediately open to unlimited public traffic. Launch in stages:

```text
Internal testing → Trusted testers → Small public beta → Expanded beta → General availability
```

Monitor: crash rate, error rate, WebSocket stability, topology sizes, simulation durations, CPU/memory usage, abuse patterns, user retention, failed operations. Use actual production behavior to adjust resource limits.

#### General Availability Gates

All must pass: Security ✓, Correctness ✓, Performance ✓, Reliability ✓, Observability ✓, Backup/Recovery ✓, Operational readiness ✓, Documentation ✓.

**Exit Gate**:

- [ ] Beta launch with > 100 external users at < 0.1% error rate and zero data integrity incidents
- [ ] Documented rollback procedure
- [ ] All 7 production readiness dimensions pass

---

# Part VII — Operational Excellence (Post-Launch)

---

## 18. Post-Launch Engineering

Production engineering does not stop at launch. Establish:

- Dependency update schedule (weekly automated PRs)
- Security review schedule (quarterly)
- Incident review process (blameless postmortems)
- Performance regression testing (in CI)
- Database maintenance (vacuum, reindex)
- Cost monitoring
- Capacity planning
- Feature flagging
- Safe migration discipline
- Regular backup restore tests (monthly)

### Incident Response Lifecycle

```text
Incident → Root cause → Immediate fix → Preventative fix
  → Automated regression test → Runbook/documentation update
```

Do not repeatedly fix the same class of incident manually.

---

# Part VIII — Reference Tables

---

## 19. Performance Targets

| Area                             | Target                              |
| :------------------------------- | :---------------------------------- |
| Initial application load         | < 3 seconds on reasonable broadband |
| API p95 latency                  | < 300 ms                            |
| WebSocket intent acknowledgement | < 100 ms under normal load          |
| Simulation event processing      | No unbounded queue growth           |
| Canvas rendering                 | ~60 FPS for normal scenarios        |
| Reconnection                     | Automatic                           |
| Snapshot recovery                | < 2 seconds under normal conditions |

## 20. Reliability Assumptions (Never Assume)

- Redis is always available
- WebSockets never disconnect
- PostgreSQL never fails
- Browser tabs remain open
- Messages arrive in order
- Clients reconnect quickly
- Users behave normally

Every external dependency must have an explicit failure strategy:

```text
PostgreSQL unavailable → API returns controlled error → No process crash
  → No corrupted simulation state → Retry only where safe
```

## 21. Milestone Summary

| Milestone | Primary Goal           | Gate Condition                                 |
| :-------- | :--------------------- | :--------------------------------------------- |
| M00       | Product + threat model | Boundaries and risks defined                   |
| M01       | Repository foundations | CI prevents bad merges                         |
| M02       | Domain + contracts     | Single source of truth with runtime validation |
| M03       | Simulation engine      | Deterministic headless engine works            |
| M04       | Correctness testing    | Invariants survive 500K+ fuzz iterations       |
| M05       | Persistence            | Multi-tenant data survives failures            |
| M06       | Backend + auth         | Identity, authorization, clean architecture    |
| M07       | WebSockets             | Clients synchronize reliably under chaos       |
| M08       | Visualization          | 60 FPS UI under realistic load                 |
| M09       | Chaos scenarios        | Failures are deterministic and replayable      |
| M10       | Security hardening     | Zero critical/high vulnerabilities             |
| M11       | Observability + load   | Capacity measured, failures diagnosable        |
| M12       | Deployment + DR        | Repeatable deploys, tested recovery            |
| M13       | PRR + Beta + GA        | All 7 readiness dimensions pass                |

## 22. Verification & Testing Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│                        COMPREHENSIVE TEST SUITE                        │
│                                                                        │
│  1. Unit Tests (Vitest)                                                │
│     - Pure domain logic, PRNG determinism, binary encoders, schemas    │
│     - Target: 100% coverage on packages/simulation and contracts       │
│                                                                        │
│  2. Property & Invariant Tests (fast-check)                            │
│     - 500k+ randomized event sequences asserting 8 core invariants     │
│                                                                        │
│  3. Integration Tests (Testcontainers + PostgreSQL + Redis)            │
│     - RLS security boundary tests, migration rollbacks, auth flows     │
│                                                                        │
│  4. Realtime Gateway Tests (ws-client-simulator)                       │
│     - Packet drop, out-of-order sequence gap, reconnection tests       │
│                                                                        │
│  5. End-to-End Tests (Playwright)                                      │
│     - Full UI flows, canvas interaction, time-travel, labs, sharing     │
│                                                                        │
│  6. Security Tests (OWASP ZAP + custom)                                │
│     - IDOR, CSRF, XSS, SQL injection, SSRF, tenant isolation          │
│                                                                        │
│  7. Stress & Performance Tests (k6)                                    │
│     - 5,000 concurrent WebSocket sessions, 50k events/sec throughput   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 23. Definition of Production Ready

TheVisualizer is **not production ready** simply because the UI looks polished, the simulator works locally, WebSockets connect, authentication works, or the application deploys.

It is production ready only when **all seven dimensions** pass:

```text
               ┌─────────────────────────────────┐
               │    1. Correctness & Invariants  │
               └────────────────┬────────────────┘
                                │
               ┌────────────────▼────────────────┐
               │    2. Zero-Trust Security       │
               └────────────────┬────────────────┘
                                │
               ┌────────────────▼────────────────┐
               │    3. Deterministic Reliability │
               └────────────────┬────────────────┘
                                │
               ┌────────────────▼────────────────┐
               │    4. 60+ FPS Performance       │
               └────────────────┬────────────────┘
                                │
               ┌────────────────▼────────────────┐
               │    5. End-to-End Observability  │
               └────────────────┬────────────────┘
                                │
               ┌────────────────▼────────────────┐
               │    6. Recoverability & RTO/RPO  │
               └────────────────┬────────────────┘
                                │
               ┌────────────────▼────────────────┐
               │    7. Operational Automation    │
               └─────────────────────────────────┘
```

> **The Gold Standard**: Assume the user is malicious, the network is unreliable, dependencies can fail, browsers can disconnect, data can be malformed, workers can crash, and infrastructure can disappear. Design the system so that none of these events compromises another user's data, corrupts durable state, violates a distributed invariant, exposes unauthenticated state, or causes uncontrolled resource consumption.
