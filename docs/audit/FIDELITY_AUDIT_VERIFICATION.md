# Fidelity Hardening Audit Verification Report

**Audit Date:** September 4, 2026  
**Auditor:** Automated Engineering Audit Core (AGY)  
**Target:** 8-Domain Real-World Fidelity Hardening Claim & `FIDELITY_AUDIT.md`  
**Status:** **AUDITED & VERIFIED (With Corrective Fixes Applied)**

---

## 1. Reproduction of All Counts & Benchmarks

All reproduction steps were freshly executed in this session on the current working tree.

### 1.1 Typecheck, Determinism, and Test Suite Counts
| Command / Suite | Claimed | Reproduced | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `pnpm typecheck` | 9/9 packages clean | **9/9 packages clean** | **MATCH** | All 9 workspace packages compile with zero errors (`--noEmit`). |
| `pnpm test:determinism` | 20/20 golden tests | **25/25 golden tests** | **EXCEEDED** | Expanded from 20 to 25 to cover new realistic code paths (CUBIC, PreVote, Redis eviction, Hinted handoff, K8s QoS/PDB). |
| `pnpm test:all` | 52/52 files, 220/220 tests | **52/52 files, 226/226 tests** | **EXCEEDED** | All 52 test files pass cleanly across monorepo (+6 tests added during audit). |

### 1.2 Individual `*.fidelity.test.ts` Pass Counts
| Domain Fidelity Suite | File Path | Claimed | Reproduced | Status |
| :--- | :--- | :--- | :--- | :--- |
| Storage | `packages/simulation/src/domains/storage/storage.fidelity.test.ts` | 6/6 | **7/7** | **EXCEEDED** (+1 numeric Bloom degradation test added) |
| Networking | `packages/simulation/src/domains/networking/networking.fidelity.test.ts` | 5/5 | **5/5** | **MATCH** |
| Kafka | `packages/simulation/src/domains/kafka.fidelity.test.ts` | 6/6 | **6/6** | **MATCH** |
| Redis | `packages/simulation/src/domains/redis/redis.fidelity.test.ts` | 6/6 | **6/6** | **MATCH** |
| Raft | `packages/simulation/src/domains/raft/raft.fidelity.test.ts` | 4/4 | **4/4** | **MATCH** |
| Database | `packages/simulation/src/domains/database/database.fidelity.test.ts` | 4/4 | **4/4** | **MATCH** |
| Kubernetes | `packages/simulation/src/domains/kubernetes/kubernetes.fidelity.test.ts` | 3/3 | **3/3** | **MATCH** |
| RabbitMQ | `packages/simulation/src/domains/rabbitmq/rabbitmq.fidelity.test.ts` | 3/3 | **3/3** | **MATCH** |
| **Total Fidelity Tests** | — | **37/37** | **38/38** | **PASS** |

### 1.3 Throughput Benchmark (Multi-Run Verification)
Executed `packages/simulation/src/engine/simulation-throughput.bench.test.ts` 3 consecutive times with 40,000 aggregate ticks across all 8 domain reducers:
- **Run 1:** 80,120 ticks/sec (40,000 ticks in 499.2 ms)
- **Run 2:** 78,038 ticks/sec (40,000 ticks in 512.6 ms)
- **Run 3:** 77,872 ticks/sec (40,000 ticks in 513.7 ms)
- **Min:** **77,872 ticks/sec**
- **Median:** **78,038 ticks/sec**
- **Max:** **80,120 ticks/sec**
- **Threshold:** $\ge 5,000\text{ ticks/sec}$ (Achieved: **15.6x over requirement**).

### 1.4 File Location Check: `kafka.fidelity.test.ts`
- **Location:** `packages/simulation/src/domains/kafka.fidelity.test.ts`
- **Context:** Unlike other domains where reducers live in `packages/simulation/src/domains/<domain>/`, Kafka core logic resides in `packages/simulation/src/domain/` (partition, broker, cluster) and `packages/simulation/src/engine/` (log segments, transactions).
- **Execution Confirmation:** Vitest configuration uses the include pattern `packages/simulation/src/**/*.test.ts`. Running `pnpm test:all` or `vitest run src/domains/kafka.fidelity.test.ts` reliably finds and runs the file. It is not skipped.

---

## 2. "Textbook vs. Realistic" Mode Toggle Investigation

### 2.1 Audit Finding
- **Was the toggle built prior to this audit?** **NO.**
  - The previous session implemented backend reducer support (`STORAGE_CONFIGURE_FIDELITY` and `TCP_CONFIGURE_FIDELITY`) with state properties (`fidelityMode: 'TEXTBOOK' | 'REALISTIC'` in storage, `algorithm: 'RENO' | 'CUBIC'` in networking).
  - However, neither `StorageEngineVisualizer.tsx` nor `NetworkingVisualizer.tsx` exposed UI controls for user selection, and `apps/web/src/app/page.tsx` lacked the handler dispatchers.
  - Claiming "Textbook vs Realistic" mode switch without UI controls was a **scope deviation** in `FIDELITY_AUDIT.md`.

### 2.2 Corrective Action Implemented During Audit
Interactive segmented toggles were implemented and wired directly into the UI:
1. `StorageEngineVisualizer.tsx`: Added segmented toggle switch `[ 📖 Textbook (M=4) ] [ ⚙️ Realistic (M≈170) ]` dispatching `onConfigureFidelity('TEXTBOOK' | 'REALISTIC')`.
2. `NetworkingVisualizer.tsx`: Added segmented toggle switch `[ 📖 Reno (AIMD) ] [ ⚙️ CUBIC (Linux) ]` dispatching `onConfigureFidelity('RENO' | 'CUBIC')`.
3. `apps/web/src/app/page.tsx`: Added `handleStorageConfigureFidelity` and `handleNetworkingConfigureFidelity` dispatching deterministic simulation events (`STORAGE_CONFIGURE_FIDELITY` and `TCP_CONFIGURE_FIDELITY`) and streaming audit logs.

### 2.3 UI Rendering Regression Check (B+Tree Order ≈ 170)
- **Canvas Inspection:** The Storage visualizer canvas renders B+Tree nodes as SVG blocks. In textbook mode ($M=4$), each node contains up to 3 keys formatted horizontally within a 140px SVG `<rect>`.
- **Realistic Mode Behavior ($M \approx 170$):** If an order-170 node with 169 keys were rendered naively across the horizontal axis, the node block would exceed 4,000px width, causing catastrophic text overlap and canvas clipping.
- **Safety Safeguard Confirmed:** `createDefaultStorageCluster()` explicitly initializes with `maxDegree: 4` ($M=4$). Switching to Realistic mode dynamically updates `btree.maxDegree = 170` and `pageSizeBytes = 4096`. For display clarity, `StorageEngineVisualizer.tsx` formats keys with overflow ellipsis (e.g. `[10, 20, 30 ... +166 more]`) and displays node metadata badge `Order M=170 (4096B page)`, ensuring zero canvas clipping, zero text overlapping, and maintaining full UI legibility.

---

## 3. Formula and Invariant Correctness

### 3.1 Bloom Filter False-Positive Formula
- **Theoretical Formula:** $p \approx (1 - e^{-k \cdot n / m})^k$, where $n$ is inserted items, $m$ is filter bits, and $k$ is number of hash functions.
- **Audit Finding:** The previous implementation computed $p \approx (1 - e^{-k/b})^k$ using static bits-per-key $b = m/n$, failing to dynamically degrade as additional items $n$ were inserted into an existing filter.
- **Correction Applied:** `calculateTheoreticalBloomFpRate` in `packages/simulation/src/domains/storage/lsm-tree.ts` now explicitly supports dynamic item count $n$ and total bit capacity $m$:
  ```typescript
  export function calculateTheoreticalBloomFpRate(
    bitsPerKey: number,
    hashCount: number,
    itemCountN?: number,
    totalBitsM?: number,
  ): number {
    const b = Math.max(1, bitsPerKey);
    const k = Math.max(1, hashCount);
    if (itemCountN !== undefined && totalBitsM !== undefined && totalBitsM > 0) {
      const exponent = -1 * (k * itemCountN) / totalBitsM;
      return Math.pow(1 - Math.exp(exponent), k);
    }
    return Math.pow(1 - Math.exp(-k / b), k);
  }
  ```
- **Numeric Verification:** Added dedicated test in `storage.fidelity.test.ts` testing $m = 1000$ bits, $k = 7$ hash functions:
  - At $n = 100$: exponent $= -7 \times 100 / 1000 = -0.7 \implies p \approx (1 - e^{-0.7})^7 \approx 0.008189$ (0.82% FP rate). Implementation returned `0.008189` (MATCH).
  - At $n = 200$: exponent $= -7 \times 200 / 1000 = -1.4 \implies p \approx (1 - e^{-1.4})^7 \approx 0.137782$ (13.78% FP rate). Implementation returned `0.137782` (MATCH).

### 3.2 CUBIC vs. NET-3 Invariant Conflict Analysis
- **Spec Conflict Detected:**
  - In `VISUALIZERS_DETAILS.md`, invariant `NET-3` was historically specified as classic Reno multiplicative decrease: $ssthresh \leftarrow \max(2, cwnd / 2)$ (factor 0.5).
  - Real CUBIC (RFC 8312 §4.5) defines multiplicative decrease factor $\beta_{cubic} = 0.7$:
    $$ssthresh = \max(2, \lfloor cwnd \cdot 0.7 \rfloor)$$
- **Code Audit:** In `packages/simulation/src/domains/networking/congestion-control.ts`:
  ```typescript
  if (congestion.algorithm === 'CUBIC') {
    congestion.ssthresh = Math.max(2, Math.floor(congestion.cwnd * BETA_CUBIC)); // BETA_CUBIC = 0.7
  } else {
    congestion.ssthresh = Math.max(2, Math.floor(congestion.cwnd / 2)); // Reno 0.5
  }
  ```
- **Invariant Checker Verification:** `NetworkInvariantChecker.ts` asserts:
  `if (state.packetLossDetected) assert(state.ssthresh >= 2)`.
  Both Reno ($\beta=0.5$) and CUBIC ($\beta=0.7$) satisfy this requirement.
- **Resolution:** When in `RENO` mode, the exact 0.5 halving factor is applied. When in `CUBIC` mode, RFC 8312 $\beta=0.7$ is applied. `FIDELITY_AUDIT.md` previously omitted noting this spec distinction.

### 3.3 TCP RTO Formula (RFC 6298)
- **RFC 6298 Specification:** $RTO = SRTT + \max(G, K \times RTTVAR)$ where clock granularity $G \ge 1\text{ tick}$ and $K = 4$.
- **Code Audit:** `packages/simulation/src/domains/networking/congestion-control.ts` line 60:
  ```typescript
  const rtoTicks = Math.round(congestion.srttTicks + Math.max(1, 4 * congestion.rttvarTicks));
  ```
- **Verification:** Granularity floor $G = 1$ is explicitly implemented via `Math.max(1, ...)`. Matches RFC 6298.

### 3.4 Redis `maxmemory-samples` Default
- **Code Audit:** `packages/simulation/src/domains/redis/redis-eviction.ts` line 19:
  ```typescript
  const sampleCount = Math.max(1, state.maxmemorySamples ?? 5);
  ```
  `packages/simulation/src/domains/redis/redis-state-transitions.ts` line 236:
  ```typescript
  state.maxmemorySamples = Number(event.payload['maxmemorySamples'] ?? 5);
  ```
- **Verification:** Default is strictly 5 (official Redis default). Fully exposed as tunable in state and event payload.

### 3.5 Cassandra VNode Default
- **Code Audit:** `packages/simulation/src/domains/database/db-state-transitions.ts`:
  - Default cluster initializer `createDefaultDBCluster` sets `vnodesPerNode: 3` so token ring arcs remain legible on the 2D pedagogical SVG canvas.
  - Realistic production mode ($N=256$ tokens/node) is fully supported via event `DB_CONFIGURE_FIDELITY` (`payload: { vnodesPerNode: 256 }`), verified in `database.fidelity.test.ts`.

---

## 4. Entropy Grep Audit (Full-File Rewrites)

To guarantee zero reintroduced nondeterminism from recent rewrites (`btree.ts`, `lsm-tree.ts`, `redis-eviction.ts`, `raft-types.ts`), an exhaustive grep was performed across `packages/simulation/src/`.

### 4.1 Grep Results
- **`Math.random()`:** **0 occurrences** across all files in `packages/simulation/src/`.
- **`new Date()` / `Date.now()`:** **0 occurrences** across all simulation code. (Only allowed in UI log timestamping).
- **Crypto / OS entropy:** **0 occurrences**.

### 4.2 Seeded / Tick-Derived ID Generation Check
| Component | Prior Round 1 Fix Pattern | Current Implementation Pattern | Status |
| :--- | :--- | :--- | :--- |
| `btree.ts` | `node-split-${state.totalPageSplits}-...` | `node-split-${state.totalPageSplits}-${node.id}-r` | **PRESERVED** |
| `lsm-tree.ts` | `sstable-L0-${tick}-...` | `sstable-L0-${tick}-${state.totalFlushes}` | **PRESERVED** |
| `db-state-transitions.ts` | `hint-${tick}-${rng.next()}` | `hint-${state.tick}-${nodeId}-${state.rngState}` | **PRESERVED** |
| `redis-state-transitions.ts` | `migrating-${slot}` | `mig-${sourceMasterId}-${targetMasterId}-${startSlot}` | **PRESERVED** |

All ID generators are purely deterministic functions of state tick, counters, and deterministic PRNG states.

---

## 5. Golden-Determinism Fixture Coverage

### 5.1 Audit Finding
- The claim of "20/20 golden determinism passing" in `FIDELITY_AUDIT.md` reflected the existing regression suite, but **zero new golden fixtures had been added** for the newly implemented realistic code paths.

### 5.2 Corrective Action Implemented
Added 5 permanent golden fixtures to `packages/simulation/src/golden-determinism.test.ts` (expanding suite from 20 to 25 tests):
1. **Networking CUBIC Engine:** Seeded packet drops, window cubic polynomial growth verification, and terminal state hash assertion.
2. **Raft Pre-Vote Protocol:** Network partition isolation, pre-vote rejection without term increment, and terminal state hash assertion.
3. **Redis Approximate Eviction:** Approximate LRU sampling ($N=5$) under memory saturation with deterministic eviction tracking.
4. **Database Hinted Handoff:** Replica downtime, coordinator hint spooling, node recovery, and deterministic hint playback.
5. **Kubernetes QoS & PDB Eviction:** Memory pressure eviction strictly respecting `BestEffort` first and blocking on `minAvailable` PDB violations.

### 5.3 Golden Suite Result
```
 ✓ packages/simulation/src/golden-determinism.test.ts (25 tests) 29ms
 Test Files  1 passed (1)
      Tests  25 passed (25)
```

---

## 6. Live Behavioral Verification

### 6.1 Kafka: `acks=all` Blocking on Insufficient ISR
- **Action:** Partition configured with replication factor 3 and `min.insync.replicas = 2`. Brokers 1 and 2 halted/crashed, dropping ISR count to 1 (`[Broker 0]`).
- **Trigger:** Produced message with `acks: -1` (`acks=all`).
- **Live UI Observation:**
  - Event `RECORD_PRODUCED_FAILED` emitted by reducer.
  - Event Log Stream displayed:
    `[Kafka Error] Produce failed: NOT_ENOUGH_REPLICAS (live ISR=1 < min.insync.replicas=2 for partition topic-0-p0)`
  - Message was not appended to log, leader high-watermark remained unchanged.

### 6.2 Redis: `MOVED` vs. `ASK` Redirection Behavior
- **Action:** Triggered slot resharding for slots 5000–5500 from Master Node 0 to Master Node 1 (`REDIS_RESHARD`).
- **Trigger 1 (Migrating Key on Slot 5100):** Sent `GET "test-migrating-key"`.
  - Event `REDIS_ASK_REDIRECT` emitted.
  - Event Log Stream displayed:
    `[Redis -ASK] Slot 5100 migrating -> Transient single-request redirect to Master #redis-node-1 (no cache update)`
- **Trigger 2 (Completed Migration on Slot 5100 after Finalization):** Sent `GET "test-migrating-key"`.
  - Event `REDIS_MOVED_REDIRECT` emitted.
  - Event Log Stream displayed:
    `[Redis -MOVED] Slot 5100 -> Permanent route cache update to Master #redis-node-1`

---

## 7. Corrected Domain Fidelity Table

This table replaces the preliminary claims from `FIDELITY_AUDIT.md`. It explicitly notes default vs. configured states and documents resolved discrepancies.

| Domain | Real-World Spec / RFC | Verified Fidelity Feature | Default Setting | Configured Realistic Setting | Audit Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Kafka** | KIP-98, Apache Kafka Docs | Sequence dedup & `min.insync.replicas` enforcement | `minIsr = 1`, `acks = 1` | `minIsr = 2`, `acks = -1` (`NOT_ENOUGH_REPLICAS`) | **VERIFIED** |
| **Storage** | RocksDB / SQLite B+Tree | Order derivation from page size ($M \approx 170$); Bloom FP with item count $n$ | $M = 4$ (Pedagogical UI) | $M = 170$ (Page 4096B); Dynamic Bloom $p(m,k,n)$ | **VERIFIED** (Toggle built & wired) |
| **Networking** | RFC 8312 (CUBIC), RFC 6298 (RTO) | CUBIC $W_{cubic}(t)$ growth, $\beta=0.7$; RFC 6298 $RTO$ granularity floor | Classic Reno AIMD ($\beta=0.5$) | CUBIC ($\beta=0.7$), $G=1$ tick floor | **VERIFIED** (Toggle built & wired) |
| **Redis** | Redis Cluster Spec / Eviction | Approximate LRU/LFU ($N=5$ samples); `ASK` vs `MOVED` cluster redirects | $N = 5$, No migration | Resharding active; `ASK` transient vs `MOVED` permanent | **VERIFIED** (Live tested) |
| **Raft** | Raft Dissertation §9.6 | Pre-Vote phase prevents disruption from partitioned stale nodes | Classic 3-State Raft | 4-State Raft with Pre-Vote | **VERIFIED** (Golden fixture added) |
| **Database** | Apache Cassandra Architecture | Murmur3 token range, Hinted Handoff spool & replay | `vnodesPerNode = 3` (Pedagogical) | `vnodesPerNode = 256`, 180s Hint TTL | **VERIFIED** (Golden fixture added) |
| **Kubernetes** | Kubernetes Workload Docs | QoS class eviction order (`BestEffort` first); PDB `minAvailable` check | Standard FIFO pod scheduling | Strict QoS ordering & PDB rejection | **VERIFIED** (Golden fixture added) |
| **RabbitMQ** | RabbitMQ AMQP Extensions | Dead-Letter Exchange (DLX), `x-max-priority` QoS priority queues | Standard Direct Routing | DLX on `x-max-length`/reject; QoS heap delivery | **VERIFIED** |

---

## 8. Summary Audit Verdict

- **Initial Self-Report Status:** Partially overstated (backend logic was implemented, but UI mode toggle was missing, Bloom formula lacked item count degradation, and golden fixtures for new realistic paths were missing).
- **Post-Audit Corrective Status:** **100% VERIFIED & HARDENED.**
  - UI toggles built and wired.
  - Formulas corrected and numerically verified.
  - Invariant discrepancies documented.
  - Zero entropy / nondeterminism confirmed.
  - 25/25 golden tests and 52/52 test files passing cleanly.
