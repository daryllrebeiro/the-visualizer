# How to Use

This guide details the core capabilities of the Visualizer platform and how to interact with the simulation, timeline scrubbing, and chaos laboratory tools.

---

## 1. Creating and Loading Topologies

### 1.1 Navigating the Canvas Interface
The main workspace viewport is divided into three key visual layers:
1. **Interactive Node Graph (React Flow)**: Visualizes the arrangement of **Producers**, **Broker Nodes**, **Topic Partitions**, and **Consumer Groups**. Drag, zoom, and arrange elements to build custom cluster topologies.
2. **Real-time Flow Canvas**: Animates message frames as flowing color particles traveling along Bezier splines.
3. **HUD Control Panel**: Displays the chronological event log, partition health indicators, and simulation speeds.

### 1.2 Visual Cues Reference
* **Brokers**: Large nodes showing online state (`ALIVE`), CPU load, and disk storage percentages.
* **Topics & Partitions**: Shows leader replica designations, in-sync replica checklists (green = synced, red = lagging), and offset counters.
* **Message Particles**: Flowing dots representing records.
  * **Colors**: Each topic is mapped to a distinct color.
  * **Size**: Represents the message payload size.
  * **Speed**: Corresponds directly to partition produce throughput.

---

## 2. Operating the Simulation

### 2.1 Message Production (Produce Intent)
* Use the Producer interface to select a topic, set payload values, and select an Acknowledgment level (`acks = 0`, `acks = 1`, or `acks = all`).
* Click **Produce** to schedule events. You will observe message particles leave the producer node and stream toward the partition's Leader Broker.

### 2.2 Replication Flows
* When `acks = all`, the leader broker broadcasts messages to follower replicas.
* Flowing replication arrows visualize follower fetches. The leader only increments the High-Watermark (HW) once minimum in-sync replicas (ISR) write the record, returning the ACK confirmation to the producer.

### 2.3 Consumption and Consumer Groups
* Create a Consumer Group and add members. The gateway triggers a rebalance event.
* Reassignment lines link consumers to assigned partitions.
* As consumers poll and commit offsets, yellow markers (Committed Offset) move forward behind blue markers (High Watermark) on the partition timeline.

---

## 3. Time-Travel Scrubber
The visualizer owns an authoritative history of state deltas:
* **Play / Pause / Step**: Use the media scrubbing buttons to freeze the simulation or step forward/backward frame-by-frame.
* **Scrubber Bar**: Drag the timeline slider backward. The engine reverses state transitions using reverse JSON patches, restoring previous offsets, active consumer assignments, and broker statuses.
* **Fidelity**: Replaying from any point maintains mathematical determinism, ensuring identical results during subsequent steps.

---

## 4. Injecting Chaos

### 4.1 Broker Crash
1. Open the Chaos Control Dock.
2. Select an active broker and click **Kill Broker** (`INTENT_CHAOS_KILL_BROKER`).
3. **Observe the chain reaction**:
   * The broker node flashes red and offline.
   * Affected partitions lose their leader, shrinking their In-Sync Replica (ISR) pools.
   * The Active Controller detects the crash, runs an election, and promotes a surviving replica from the ISR list.
   * Production traffic automatically redirects to the new leader node.
4. Click **Recover Broker** to see the broker rejoin, replicate missing segments, and catch up to the ISR.

### 4.2 Network Partition
* Select a group of brokers to isolate.
* The visualizer cuts connecting links, simulating a network split.
* Watch the cluster split into separate controller quorums, causing stale replica updates and fencing errors if split leaders receive writes.

---

## 5. Sharing Scenarios
1. Once you create a specific scenario sequence (e.g. broker crash during consumer rebalance), click **Share**.
2. The platform generates an unlisted `share_token` saved on the server.
3. Share the URL with colleagues. Anyone opening the link will load the identical topology layout and seed, replaying the exact chaos scenario in their browser.
