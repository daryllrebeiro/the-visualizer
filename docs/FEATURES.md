# TheVisualizer: Complete Feature & Functionality Specification

**TheVisualizer** is an interactive, deterministic, distributed systems visualizer and sandbox engine designed to model Apache Kafka semantics (KRaft metadata quorum, partition leadership, In-Sync Replicas (ISR), dynamic consumer group rebalancing, and auto-offset commits).

---

## 1. System Architecture & Topology

The application is structured as a monorepo containing interconnected microservices and packages:

* **Next.js Web App (`apps/web`)**: Modern React interface featuring HTML5 Canvas 2D visualization, glassmorphic HUD tooltips, interactive cluster controls, playback scrubber, and an event log stream.
* **WebSocket Gateway (`apps/ws-gateway`)**: Manages room sessions, coordinates client intents, executes the discrete-event simulation runner loop at 10 Hz, and streams differential snapshots and transition events.
* **REST API (`apps/api`)**: Handles sandbox authentications (`/auth/dev-login`), topology schema queries, room provisioning, and session state persistence.
* **Simulation Engine (`packages/simulation`)**: Pure deterministic state machine and discrete-event scheduler tracking brokers, topics, partitions, consumer groups, and KRaft controllers.
* **Contracts (`packages/contracts`)**: End-to-end Zod schemas and TypeScript interfaces validating WebSocket intents, cluster events, and state models.

```
┌─────────────────┐       WebSocket (JSON Intents / Snapshots)       ┌────────────────────────┐
│                 │ ◄──────────────────────────────────────────────► │                        │
│ Next.js Web App │                                                  │   WebSocket Gateway    │
│   (apps/web)    │ ───────── REST (Dev-Auth / Rooms) ─────────────► │   (apps/ws-gateway)    │
│                 │ ◄─────────────────────────────────────────────── │                        │
└─────────────────┘                                                  └───────────┬────────────┘
                                                                                 │
                                                                                 ▼
                                                                     ┌────────────────────────┐
                                                                     │   Simulation Engine    │
                                                                     │ (packages/simulation)  │
                                                                     └────────────────────────┘
```

---

## 2. Core Kafka Emulation Primitives

### 2.1 KRaft Metadata Quorum & Controller Election
* **Active Controller Identification**: The engine maintains KRaft voter states and identifies the active controller node (highlighted with an amber controller crown).
* **Automatic Failover**: Crashing the active controller triggers leader election transitions among remaining alive voter brokers.

### 2.2 Topic Partitions & In-Sync Replicas (ISR)
* **Partition Leaders & Followers**: Partitions are allocated across broker nodes with designated leader brokers and follower replica sets.
* **ISR Tracking & High-Watermarks**: Each partition tracks its high-watermark (HW), log end offset (LEO), leader epoch, and minimum In-Sync Replica requirements.
* **Clean & Unclean Leader Election**: If the current partition leader crashes, the engine automatically promotes an in-sync follower to leader.

### 2.3 Consumer Groups, Topic Subscriptions & Rebalancing
* **Dynamic Consumer Group Coordination**: Simulates Kafka consumer group protocols (`order-processors`) with generation IDs and state transitions (`Empty`, `PreparingRebalance`, `CompletingRebalance`, `Stable`).
* **Topic-Specific Filtering**: Consumer group members declare `subscribedTopics`. The coordinator distributes partitions *only* for the topics a consumer has subscribed to.
* **Auto-Rebalancing**: Adding or removing consumers, or topic partition changes, triggers dynamic rebalancing and reassigns partition ownership across active group members.

### 2.4 Asynchronous Offset Commits
* **Auto-Consumption Scheduler**: The gateway runner evaluates partition watermarks against group committed offsets during every simulation tick.
* **Offset Advancement**: Scheduled `RECORD_CONSUMED` events advance group offsets and update partition committed metrics.

---

## 3. Interactive Canvas Visualizer

The visualizer uses HTML5 Canvas with continuous sub-pixel rendering:

```
[PRODUCERS]              [BROKERS & TOPIC PARTITIONS]              [CONSUMERS]
┌─────────┐                                                        ┌─────────┐
│   P-1   │ ───────► ( Envelope Packet ──► Broker / Partitions ) ──►   C-1   │
└─────────┘                                                        └─────────┘
```

### 3.1 2D Node Layout
* **Left Column (Producers)**: Client-side producer nodes displayed with target topic routes (`P-1 → [orders]`).
* **Center Stage (Brokers & Partitions)**:
  * **Broker Nodes**: Circular server nodes showing node IDs, controller badges, disk utilization meters, and status (`ALIVE`, `DEGRADED`, `CRASHED`, `RECOVERING`).
  * **Pulsing Heartbeat Rings**: Concentric green/amber pulses radiating from alive brokers to represent cluster liveness.
  * **Topic Partition Cards**: Rounded cards showing partition identifiers (`orders-0`), leader links, watermarks, and a **visual log segment indicator** that fills up as message offsets increment.
* **Right Column (Consumers)**: Consumer nodes showing client IDs and subscribed topic bindings (`C-xxxxxx → [orders]`).

### 3.2 Message Flow Animations
* **Vector Envelope Packets**: High-fidelity vector envelope icons animate along cubic Bezier curves:
  1. From the producing node to the broker hosting the partition leader.
  2. From the broker hosting the partition to the subscribed consumer member.

### 3.3 Glassmorphic HUD Tooltip Cards
Hovering over any visual entity opens a real-time inspection HUD displaying:
* **Broker Nodes**: Node ID, Active Controller / Follower Role, Host/Port, Disk Capacity, and Last Heartbeat Tick.
* **Topic Partitions**: Topic Name, Partition ID, Leader Broker ID, Leader Epoch, ISR list, High Watermark, and Min-ISR rule.
* **Producers**: Producer ID, Target Topic, and Client Mode status.
* **Consumers**: Consumer Member ID, Group ID, Subscribed Topics list, and number of assigned partitions.

---

## 4. Simulation Controls & Cluster Management

### 4.1 Producers Panel
* **Add / Remove Producers**: Add multiple producers dynamically or remove inactive nodes.
* **Topic Assignment**: Target specific topics (`orders`, `payments`, etc.) per producer.
* **Message Dispatch**: Send single-message intents per producer or trigger bulk dispatch (**⚡ Produce (All)**).

### 4.2 Consumers Panel
* **Dynamic Consumer Slots**: Create and configure multiple simulated consumer clients.
* **Topic Subscriptions**: Select specific topic subscriptions per consumer.
* **Group Join & Leave**: Trigger dynamic cluster group joins (**✔**) and leaves (**❌**), observing automatic rebalance protocols.

### 4.3 Chaos Laboratory
* **Crash Broker (💥)**: Injects chaos faults by abruptly killing random alive brokers, testing controller failover and partition leader re-election.
* **Recover Broker (🔧)**: Restores crashed nodes to `RECOVERING` and `ALIVE` status, triggering follower log catch-up and ISR re-entry.

### 4.4 Cluster Management
* **Add Broker Node (➕)**: Provision new broker instances dynamically into the running cluster.
* **Create Custom Topics (📁)**: Create new topics with custom partition counts; partitions are distributed round-robin across alive brokers.

### 4.5 Time Travel & Playback Scrubber
* **Pause / Resume**: Freeze the 10 Hz simulation tick loop at any moment.
* **Scrub Timeline**: Scrub backwards and forwards through cluster state history to review past events and transitions tick by tick.

### 4.6 Event Log Stream
* **Real-time Event Feed**: Categorized feed of all intents, state snapshots, rebalances, and chaos events with timestamps and status indicators (`INFO`, `WARN`, `ERROR`, `SUCCESS`).
