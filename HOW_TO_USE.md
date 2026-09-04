# How to Use — The Visualizer

A comprehensive user guide for operating the simulation canvas, deep inspection drawers, interactive scenarios, chaos experiments, and time-travel scrubbing.

---

## 1. Navigating the Canvas Interface

### 1.1 Canvas Viewport & Camera Controls

- **Mouse Wheel Zoom**: Scroll forward or backward over the canvas to smoothly zoom ($0.3\times \to 2.5\times$).
- **Canvas Panning**: Click and drag any empty area of the canvas or hold `Alt` + drag to pan the viewport infinitely.
- **Radar Minimap**: Located in the bottom-right corner, displaying live real-time positions of Brokers (blue/amber), Partitions (indigo), Producers (green), and Consumers (purple).
- **Camera HUD**: Controls at the bottom-left of the canvas allow you to zoom in (`＋`), zoom out (`－`), reset camera zoom/pan (`100%`), or reset dragged node positions (`↺ Layout`).

### 1.2 Interactive Entity Selection (Click-to-Inspect)

Click any entity on the canvas to open the **Deep Inspection Drawer**:

- **Broker Nodes**: View status, rack assignment, live disk usage bytes, and KRaft role. Use quick-action buttons to crash (`💥 Crash`) or recover (`🔧 Recover`) that specific broker.
- **Topic Partitions**: View physical on-disk `.log` segments (`00000000000000000000.log`), sparse index lookups, High-Watermark (HW), Log End Offset (LEO), and the live In-Sync Replica (ISR) matrix.
- **Consumer Nodes**: Inspect member ID, consumer group state (`Stable`, `PreparingRebalance`), rebalance generation ID, and assigned topic-partitions.
- **Producer Nodes**: Access the live **Murmur2 Partitioner Playground** to hash test keys and immediately dispatch messages.

---

## 2. Interactive Scenarios & Playbooks

Click the **🎓 Scenarios** button in the top navigation bar to open pre-packaged educational playbooks:

1. **Leader Failover & ISR Shrink**: Crashes the active leader broker for a partition, demonstrates immediate ISR shrinkage, controller failover, and follower promotion.
2. **Cooperative Sticky Rebalancing**: Adds multiple consumers across topics and illustrates zero-downtime cooperative partition handoffs.
3. **KRaft Metadata Quorum Failover**: Crashes the active KRaft controller node and shows quorum election of a new controller and metadata log reconciliation.

---

## 3. Operating the Simulation

### 3.1 Key-Based Record Production (Murmur2)

1. In the sidebar Producer card or Entity Inspector, specify a target topic and test key (e.g. `order-98214`).
2. The UI computes the exact partition via `toPositive(murmur2(key)) % partitions`.
3. Select an Acknowledgment level (`acks = 0`, `acks = 1`, or `acks = all / -1`).
4. Click **Produce** to dispatch the record. Observe message packets flow to the leader broker and replicate to follower brokers before advancing the High Watermark.

### 3.2 Auto-Produce Interval Timer

1. Enable **Auto-Produce** on any producer node.
2. Set the interval (e.g. `3.0s` or `1.0s`).
3. The circular progress ring around the producer visually indicates timer progress, streaming records synchronously with each completed cycle.

### 3.3 Consumer Groups & Polling

1. Select a Consumer and click **✔ Join Group** (`INTENT_CONSUMER_JOIN`).
2. The coordinator triggers a rebalance and maps assigned partitions.
3. As records arrive on the partition, consumers automatically poll and commit offsets, advancing committed offset markers.

---

## 4. Time-Travel Scrubber & JSON Trace Recording

- **Pause / Resume**: Click **❚❚ Pause Stream** to freeze the simulation timeline.
- **Scrubber Slider**: Drag the slider backward in time to inspect previous states. The engine rewinds state transitions using reverse JSON patches.
- **💾 Export Trace**: Click **Export Trace** to download the complete simulation timeline as a deterministic `.json` trace file.
- **📂 Import Trace**: Click **Import** to load a saved `.json` trace file and replay offline simulations.

---

## 5. Chaos Engineering Laboratory

- **💥 Crash Broker**: Injects random broker failures (`INTENT_CHAOS_KILL_BROKER`) to test partition failover.
- **🔧 Recover Broker**: Restores crashed brokers (`INTENT_CHAOS_RECOVER_BROKER`) to verify replica catch-up and ISR expansion.
- **📁 Create Topic**: Dynamically provisions new topics with custom partition counts.
- **➕ Add Broker**: Scales the cluster dynamically by adding live broker nodes with rack tags.
