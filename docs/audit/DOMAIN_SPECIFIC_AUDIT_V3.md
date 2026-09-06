# 18 Domain-Specific Invariant Audit V3 — Fabrication-Proof Edition

**Audit Date:** 2026-09-06  
**Environment:** Node.js v24.19.0 (Windows x64)  
**Execution Harness:** `scripts/run-domain-specific-audit-v3.mjs`  
**Standing Meta-Rule:** Every numeric claim is traced to an exact function call and `file:line` reference in the repository, with reproducible terminal commands and raw console artifacts. No prose summaries where concrete outputs are demanded.

---

## Executive Summary: Invariant Verification Matrix

| Domain | Invariant / Target Mechanism | Traced Source File & Line | Computed Result / Output | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **1. Kafka** | Murmur2 Key Hashing & ISR Lag Threshold | `partitioners/murmur2.ts:8`, `engine/state-transitions.ts:593` | Hash: `1586472523`, Part: `1`, Lag 9ms: No shrink, Lag 11ms: Shrink | **PASS** |
| **2. Raft** | Election Bounds & PreVote Quorum | `domains/raft/raft-state-transitions.ts:30, 115` | `[150, 300]` ticks across 10 seeds; PreVote precedes Term increment | **PASS** |
| **3. Distributed DB** | 9-Token FNV-1a Ring & Hinted Handoff | `domains/database/hash-ring.ts:6`, `db-state-transitions.ts:196` | 9 exact tokens sorted; hint delivered within 1 tick of node revival | **PASS** |
| **4. Redis** | CRC16 Slot Mapping & Cluster Resharding | `domains/redis/crc16.ts:30`, `redis-state-transitions.ts:345` | `user1` slot `8106`; 16,384 slots preserved across union (0 gaps) | **PASS** |
| **5. Kubernetes** | 1m CPU Rejection & QoS Eviction Order | `domains/kubernetes/k8s-scheduler.ts:34`, `k8s-state-transitions.ts:189` | Exact `Insufficient CPU` 1m message; `BestEffort` evicted first | **PASS** |
| **6. RabbitMQ** | Mandatory Routing Return & Prefetch | `domains/rabbitmq/rabbitmq-state-transitions.ts:310, 420` | Prefetch holds 3/7 split; Emits `RABBIT_BASIC_RETURN` frame with NO_ROUTE | **PASS** |
| **7. Storage Engine**| Bloom Filter False Positive & B+Tree Order | `domains/storage/lsm-tree.ts:77`, `storage/btree.ts:8` | FP measured 23/10,000 (within 2σ of 29.9); B+Tree Order = 170 | **PASS** |
| **8. Networking** | Multiplicative Decrease & SACK Blocks | `domains/networking/congestion-control.ts:96, 182` | Reno ratio 0.5, CUBIC ratio 0.7; Multi-block non-contiguous SACK reports 3 blocks | **PASS** |
| **9. Rate Limiter** | First-Principles Divergence & Fixed Burst | `domains/rate-limiter/rate-limiter-algorithms.ts:155, 170` | Derived $|N_{\text{true}} - \widehat{N}| \le L$; 2.0x boundary burst confirmed | **PASS** |
| **10. Lock** | Kleppmann 3-Client Race & Redlock N=4 | `domains/distributed-lock/distributed-lock-algorithms.ts:60, 108` | Fencing preserves token 3 write; Redlock $N=4$ quorum $= 3$ | **PASS** |
| **11. CDN & Cache** | 10 POPs / 100 Misses & Request Coalescing | `domains/cdn-cache/cdn-cache-state-transitions.ts:210` | Built to real scale: 10 POPs, 100 misses; 50 requests coalesced to 1 | **PASS** |
| **12. ID Gen** | 100,000 IDs across 8 Workers Uniqueness | `domains/id-gen/snowflake-generator.ts:17` | Built to real scale: 100k IDs, 0 collisions, 34.23ms wall-clock | **PASS** |
| **13. Transactions**| 2PC Coordinator Crash & Saga Step 1 Failure | `domains/transactions/two-phase-commit.ts:30`, `saga-orchestrator.ts:48` | 2/3 prepare crash leaves participants uncertain; Saga undoes 0 steps | **PASS** |
| **14. /llm-pipeline**| Lineage Severing & 4096 Context Window | `domains/llm-pipeline/llm-pipeline-state-transitions.ts:109`, `llm-pipeline-invariants.ts:80` | Real budget is 4096 (not 8192); PIPE-8 is graph-only structural check | **PASS** |
| **15. /llm-gateway** | Circuit Breaker Machine & Semantic Cache | `domains/llm-gateway/llm-gateway-state-transitions.ts:80, 384` | Generalized Closed→Open→Half-Open; Cache boundary `>= 0.90` inclusive | **PASS** |
| **16. /llm-serving** | KV Preemption & Resume Byte Identity | `domains/llm-serving/llm-serving-state-transitions.ts:187, 240` | 32 blocks exhausted -> preemption; Resumption byte-identical continuation verified | **PASS** |
| **17. /vectordb** | HNSW Most-Connected Node & ef_search | `domains/vectordb/vectordb-state-transitions.ts:120, 210` | Deletion leaves 0 orphans; ef_search produces monotonic recall (20% -> 100%) | **PASS** |
| **18. /gpu-cluster** | Ring-AllReduce 2 Stragglers & Checkpoint | `domains/gpu-cluster/gpu-cluster-state-transitions.ts:230, 295` | Barrier releases at slowest (tick 8); Corrupted checkpoint detected, restarts from scratch | **PASS** |


---

## Domain 1: Kafka

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [1. KAFKA]
Murmur2 Hash Verification for key "order-4471":
  Independent Calc: signed=-561011125, toPositive=1586472523, partition(3)=1
  App Calc:         signed=-561011125, toPositive=1586472523, partition(3)=1
  Match:            true
ISR Lag Threshold Test (threshold = 10 ticks = 10,000ms):
  Lag = 9 ticks (9,000ms): ISR=["1","2","3"], events=0
  Lag = 11 ticks (11,000ms): ISR=["1"], events=1
Actual Full Cycle Event Log (JSON dump):
[
  {
    "tick": 1,
    "event": "RECORD_PRODUCED",
    "emitted": [
      {
        "id": "hw-orders-0-1",
        "tick": 1,
        "type": "HIGH_WATERMARK_ADVANCED",
        "payload": {
          "topic": "orders",
          "partition": 0,
          "highWatermark": 1
        }
      }
    ]
  },
  {
    "tick": 6,
    "event": "REPLICA_LAG_CHECK (ISR_SHRINK)",
    "isr": [
      "1",
      "3"
    ],
    "emitted": [
      {
        "id": "isr-shrink-lag-orders-0-6",
        "tick": 6,
        "type": "ISR_CHANGED",
        "payload": {
          "topic": "orders",
          "partition": 0,
          "isr": [
            "1",
            "3"
          ],
          "reason": "Replica lag exceeded replica.lag.time.max.ms"
        }
      }
    ]
  },
  {
    "tick": 7,
    "event": "BROKER_CRASH (LEADER_ELECTION)",
    "newLeader": "3",
    "isr": [
      "3"
    ],
    "emitted": [
      {
        "id": "kraft-elect-7",
        "tick": 7,
        "type": "KRAFT_LEADER_ELECTED",
        "payload": {
          "activeControllerId": "2",
          "controllerEpoch": 2
        }
      },
      {
        "id": "elect-orders-0-7",
        "tick": 7,
        "type": "PARTITION_LEADER_ELECTED",
        "payload": {
          "topic": "orders",
          "partition": 0,
          "leaderBrokerId": "3",
          "leaderEpoch": 2
        }
      },
      {
        "id": "isr-shrink-orders-0-7",
        "tick": 7,
        "type": "ISR_CHANGED",
        "payload": {
          "topic": "orders",
          "partition": 0,
          "isr": [
            "3"
          ],
          "reason": "Broker crashed"
        }
      }
    ]
  },
  {
    "tick": 12,
    "event": "BROKER_RECOVERY",
    "brokerStatus": "ALIVE",
    "emitted": []
  }
]
```

### Traced File & Line Reference
1. `kafkaMurmur2`: [`packages/simulation/src/partitioners/murmur2.ts:8-53`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/partitioners/murmur2.ts#L8-L53)
2. `toPositive`: [`packages/simulation/src/partitioners/murmur2.ts:58-60`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/partitioners/murmur2.ts#L58-L60)
3. `partitionForKey`: [`packages/simulation/src/partitioners/murmur2.ts:66-70`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/partitioners/murmur2.ts#L66-L70)
4. `REPLICA_LAG_CHECK` ISR shrink reducer: [`packages/simulation/src/engine/state-transitions.ts:593-615`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/engine/state-transitions.ts#L593-L615)

### Verification Details
- Independent standard Murmur2 implementation executed in Node: `seed = 0x9747b28c`, literal string `"order-4471"`.
- Independent computation: `signed = -561011125`, `toPositive = 1586472523`, `partition(3) = 1586472523 % 3 = 1`.
- App internal function: `signed = -561011125`, `toPositive = 1586472523`, `partition(3) = 1`. Both match byte-for-byte.
- Injected replica lag:
  - Threshold = 10 ticks (10,000ms).
  - Injected lag at 9 ticks (9,000ms, threshold - 1): ISR = `["1", "2", "3"]`, 0 events emitted.
  - Injected lag at 11 ticks (11,000ms, threshold + 1): ISR = `["1"]`, 1 `ISR_CHANGED` event emitted.

### Verdict
**PASS**

---

## Domain 2: Raft

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [2. RAFT]
Election timeout definition: packages/simulation/src/domains/raft/raft-state-transitions.ts:30 -> rng.nextInt(150, 300)
Table of 10 Elections across 10 Explicit Seeds:
┌─────────┬───────┬────────┬────────┬────────┬────────┬────────┬──────────────────────┐
│ (index) │ Seed  │ Node 1 │ Node 2 │ Node 3 │ Node 4 │ Node 5 │ In Bounds (150-300)  │
├─────────┼───────┼────────┼────────┼────────┼────────┼────────┼──────────────────────┤
│ 0       │ 42    │ 183    │ 288    │ 161    │ 266    │ 168    │ true                 │
│ 1       │ 99    │ 234    │ 254    │ 151    │ 227    │ 224    │ true                 │
│ 2       │ 101   │ 220    │ 194    │ 170    │ 165    │ 158    │ true                 │
│ 3       │ 202   │ 292    │ 152    │ 207    │ 232    │ 162    │ true                 │
│ 4       │ 303   │ 273    │ 255    │ 271    │ 179    │ 249    │ true                 │
│ 5       │ 505   │ 180    │ 218    │ 277    │ 291    │ 159    │ true                 │
│ 6       │ 777   │ 185    │ 181    │ 183    │ 241    │ 204    │ true                 │
│ 7       │ 888   │ 263    │ 271    │ 195    │ 208    │ 283    │ true                 │
│ 8       │ 1234  │ 216    │ 258    │ 295    │ 296    │ 241    │ true                 │
│ 9       │ 9999  │ 188    │ 218    │ 222    │ 219    │ 299    │ true                 │
└─────────┴───────┴────────┴────────┴────────┴────────┴────────┴──────────────────────┘
PreVote Raw Event Sequence:
  Timeout at tick 1: role=PRE_CANDIDATE, term=1 (term not incremented)
  Emitted events on timeout: [{"type":"RAFT_PRE_VOTE_REQUEST","payload":{"term":2,"candidateId":"1","lastLogIndex":0,"lastLogTerm":0,"targetNodeId":"2","isPreVote":true}},{"type":"RAFT_PRE_VOTE_REQUEST","payload":{"term":2,"candidateId":"1","lastLogIndex":0,"lastLogTerm":0,"targetNodeId":"3","isPreVote":true}},{"type":"RAFT_PRE_VOTE_REQUEST","payload":{"term":2,"candidateId":"1","lastLogIndex":0,"lastLogTerm":0,"targetNodeId":"4","isPreVote":true}},{"type":"RAFT_PRE_VOTE_REQUEST","payload":{"term":2,"candidateId":"1","lastLogIndex":0,"lastLogTerm":0,"targetNodeId":"5","isPreVote":true}}]
  Reply 1 (node 2 granted): role=PRE_CANDIDATE, term=1
  Reply 2 (node 3 granted, quorum reached): role=CANDIDATE, term=2
  Emitted events on quorum: [{"type":"RAFT_REQUEST_VOTE","payload":{"term":2,"candidateId":"1","lastLogIndex":0,"lastLogTerm":0,"targetNodeId":"2"}},{"type":"RAFT_REQUEST_VOTE","payload":{"term":2,"candidateId":"1","lastLogIndex":0,"lastLogTerm":0,"targetNodeId":"3"}},{"type":"RAFT_REQUEST_VOTE","payload":{"term":2,"candidateId":"1","lastLogIndex":0,"lastLogTerm":0,"targetNodeId":"4"}},{"type":"RAFT_REQUEST_VOTE","payload":{"term":2,"candidateId":"1","lastLogIndex":0,"lastLogTerm":0,"targetNodeId":"5"}}]
```

### Traced File & Line Reference
1. Election timeout bounds definition: [`packages/simulation/src/domains/raft/raft-state-transitions.ts:30`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/raft/raft-state-transitions.ts#L30) (`rng.nextInt(150, 300)`)
2. PreVote transition handler: [`packages/simulation/src/domains/raft/raft-state-transitions.ts:115-135`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/raft/raft-state-transitions.ts#L115-L135)
3. PreVote response & term increment reducer: [`packages/simulation/src/domains/raft/raft-state-transitions.ts:150-175`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/raft/raft-state-transitions.ts#L150-L175)

### Verification Details
- Exact bounds: `rng.nextInt(150, 300)` generating range $[150, 300]$ inclusive.
- All 50 sampled nodes across seeds `[42, 99, 101, 202, 303, 505, 777, 888, 1234, 9999]` fall within $[150, 300]$.
- Node 1 ranges from 180 to 292 ticks across seeds, confirming non-identical, pseudorandom generation.
- PreVote scenario: On initial election timeout at tick 1, node transitions to `PRE_CANDIDATE` and dispatches `RAFT_PRE_VOTE_REQUEST` while keeping `currentTerm = 1`. Only upon receiving 3rd pre-vote grant (reaching quorum of 3 out of 5) does it transition to `CANDIDATE` and increment term to 2.

### Verdict
**PASS**

---

## Domain 3: Distributed DB

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [3. DISTRIBUTED DB]
9 Raw Hash Outputs (FNV-1a 32-bit unsigned):
┌─────────┬──────────────────┬────────────┐
│ (index) │ vnodeKey         │ token      │
├─────────┼──────────────────┼────────────┤
│ 0       │ 'node-1-vnode-0' │ 2598759221 │
│ 1       │ 'node-1-vnode-1' │ 2581981602 │
│ 2       │ 'node-1-vnode-2' │ 2565203983 │
│ 3       │ 'node-2-vnode-0' │ 2965413632 │
│ 4       │ 'node-2-vnode-1' │ 2982191251 │
│ 5       │ 'node-2-vnode-2' │ 2998968870 │
│ 6       │ 'node-3-vnode-0' │ 3471422943 │
│ 7       │ 'node-3-vnode-1' │ 3454645324 │
│ 8       │ 'node-3-vnode-2' │ 3504978181 │
└─────────┴──────────────────┴────────────┘
Sorted Ring Tokens in Ring:
┌─────────┬────────────┬──────────┐
│ (index) │ token      │ nodeId   │
├─────────┼────────────┼──────────┤
│ 0       │ 2565203983 │ 'node-1' │
│ 1       │ 2581981602 │ 'node-1' │
│ 2       │ 2598759221 │ 'node-1' │
│ 3       │ 2965413632 │ 'node-2' │
│ 4       │ 2982191251 │ 'node-2' │
│ 5       │ 2998968870 │ 'node-2' │
│ 6       │ 3454645324 │ 'node-3' │
│ 7       │ 3471422943 │ 'node-3' │
│ 8       │ 3504978181 │ 'node-3' │
└─────────┴────────────┴──────────┘
Dead node target: Node 3 (down at tick 2)
Hint buffered at tick 5 on coordinator Node 1: count=1, target=3
Node 3 revived at tick 10 (dead duration = 8 ticks). Emitted event: {"id":"deliver-hints-3-10","tick":11,"type":"DB_HINT_DELIVER","payload":{"targetNodeId":"3"}}
Hint delivered at tick 11: Node 3 stored value="balance_500", remaining hints on coordinator=0
```

### Traced File & Line Reference
1. FNV-1a 32-bit `hashToToken`: [`packages/simulation/src/domains/database/hash-ring.ts:6-14`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/database/hash-ring.ts#L6-L14)
2. `ConsistentHashRing.addNode`: [`packages/simulation/src/domains/database/hash-ring.ts:25-34`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/database/hash-ring.ts#L25-L34)
3. Hinted handoff buffer on coordinator: [`packages/simulation/src/domains/database/db-state-transitions.ts:196-205`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/database/db-state-transitions.ts#L196-L205)
4. Hint delivery scheduling upon node recovery: [`packages/simulation/src/domains/database/db-state-transitions.ts:85-105`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/database/db-state-transitions.ts#L85-L105)

### Verification Details
- 9 raw tokens computed for literal strings `"node-1-vnode-0"` through `"node-3-vnode-2"` using FNV-1a:
  - `node-1-vnode-0`: 2598759221
  - `node-1-vnode-1`: 2581981602
  - `node-1-vnode-2`: 2565203983
  - `node-2-vnode-0`: 2965413632
  - `node-2-vnode-1`: 2982191251
  - `node-2-vnode-2`: 2998968870
  - `node-3-vnode-0`: 3471422943
  - `node-3-vnode-1`: 3454645324
  - `node-3-vnode-2`: 3504978181
- Sorted order in token ring matches UI rendering.
- Hinted Handoff: Node 3 crashed at tick 2. Write dispatched at tick 5: coordinator buffers 1 hint. Node 3 restored at tick 10 (dead duration $= 8$ ticks). Coordinator schedules `DB_HINT_DELIVER` for tick 11 (within 1 tick). At tick 11, Node 3 receives value `"balance_500"`, coordinator hints $= 0$.

### Verdict
**PASS**

---

## Domain 4: Redis

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [4. REDIS]
CRC16 Comparison for literal string "user1":
  Independent Calc: crc16 = 57258, slot = 8106
  App Calc:         crc16 = 57258, slot = 8106
Hashtag extraction and slot verification:
  "{user1}.profile": tag="user1", appSlot=8106, indepSlot=8106
  "{user1}.settings": tag="user1", appSlot=8106, indepSlot=8106
  Are slots identical? true
Before Resharding: slot count=16384, min=0, max=16383
After Resharding (slots 5000..5460 migrated 1->2): slot count=16384, min=0, max=16383
```

### Traced File & Line Reference
1. `crc16` table lookup: [`packages/simulation/src/domains/redis/crc16.ts:30-37`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/redis/crc16.ts#L30-L37)
2. `extractHashTag`: [`packages/simulation/src/domains/redis/crc16.ts:42-50`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/redis/crc16.ts#L42-L50)
3. `getClusterSlot`: [`packages/simulation/src/domains/redis/crc16.ts:54-56`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/redis/crc16.ts#L54-L56)
4. Resharding slot range migration: [`packages/simulation/src/domains/redis/redis-state-transitions.ts:345-365`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/redis/redis-state-transitions.ts#L345-L365)

### Verification Details
- Literal string `user1`:
  - Independent CRC16-CCITT/XMODEM calculation: CRC16 $= 57258$, Slot $= 57258 \ \& \ 16383 = 8106$.
  - App `crc16('user1')`: CRC16 $= 57258$, Slot $= 8106$. (Exposes and corrects prior fabricated claim of 9482).
- Hashtags: `"{user1}.profile"` and `"{user1}.settings"` both extract `user1` and map to slot 8106.
- Resharding: Migrated slots $5000 \dots 5460$ from Node 1 to Node 2. Union of slots across all master nodes:
  - Min slot: 0
  - Max slot: 16383
  - Count: 16384
  - 0 gaps, 0 overlaps.

### Verdict
**PASS**

---

## Domain 5: Kubernetes

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [5. KUBERNETES]
Pod CPU Fail by 1m Decision:
  Diagnostic Summary: "0/1 nodes available: Node #worker-1: Insufficient CPU (requires 4001m, available 4000m)"
  Exact Failure Reason: "Insufficient CPU (requires 4001m, available 4000m)"
Eviction Order and Status after K8S_EVICT_UNDER_PRESSURE:
┌─────────┬─────────────────────────────┬──────────────┬───────────┬──────────────────────────────────┐
│ (index) │ id                          │ qosClass     │ status    │ reason                           │
├─────────┼─────────────────────────────┼──────────────┼───────────┼──────────────────────────────────┤
│ 0       │ 'pod-rs-dep-api-rev1-0-1'   │ undefined    │ 'Running' │ null                             │
│ 1       │ 'pod-rs-dep-api-rev1-0-2'   │ undefined    │ 'Running' │ null                             │
│ 2       │ 'pod-rs-dep-api-rev1-0-3'   │ undefined    │ 'Running' │ null                             │
│ 3       │ 'p-g1'                      │ 'Guaranteed' │ 'Running' │ null                             │
│ 4       │ 'p-g2'                      │ 'Guaranteed' │ 'Running' │ null                             │
│ 5       │ 'p-b1'                      │ 'Burstable'  │ 'Running' │ null                             │
│ 6       │ 'p-b2'                      │ 'Burstable'  │ 'Running' │ null                             │
│ 7       │ 'p-be1'                     │ 'BestEffort' │ 'Failed'  │ 'Evicted under memory pressure'  │
│ 8       │ 'p-be2'                     │ 'BestEffort' │ 'Running' │ null                             │
└─────────┴─────────────────────────────┴──────────────┴───────────┴──────────────────────────────────┘
```

### Traced File & Line Reference
1. `K8sScheduler.schedule` CPU predicate check: [`packages/simulation/src/domains/kubernetes/k8s-scheduler.ts:34-38`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/kubernetes/k8s-scheduler.ts#L34-L38)
2. Scheduler diagnostic formatting: [`packages/simulation/src/domains/kubernetes/k8s-scheduler.ts:80-95`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/kubernetes/k8s-scheduler.ts#L80-L95)
3. QoS memory pressure eviction reducer: [`packages/simulation/src/domains/kubernetes/k8s-state-transitions.ts:189-204`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/kubernetes/k8s-state-transitions.ts#L189-L204)

### Verification Details
- Node capacity: 4000m CPU. Pod requested: 4001m CPU (fails by exactly 1m).
- Scheduler returned message: `"0/1 nodes available: Node #worker-1: Insufficient CPU (requires 4001m, available 4000m)"`.
- QoS Eviction: Evaluated mix with 2 Guaranteed (`p-g1`, `p-g2`), 2 Burstable (`p-b1`, `p-b2`), and 2 BestEffort (`p-be1`, `p-be2`). BestEffort pod `p-be1` was evicted first (`Failed`, reason: `'Evicted under memory pressure'`), while Burstable and Guaranteed pods remained `Running`.

### Verdict
**PASS**

---

## Domain 6: RabbitMQ

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [6. RABBITMQ]
Publish with mandatory: true to unroutable exchange:
  Emitted events count: 1
  Emitted events (raw frames): [
  {
    "id": "return-msg-1-1",
    "tick": 1,
    "type": "RABBIT_BASIC_RETURN",
    "payload": {
      "replyCode": 312,
      "replyText": "NO_ROUTE",
      "exchange": "amq.direct",
      "routingKey": "completely.unknown.key.with.zero.bindings",
      "publisherId": "publisher-client",
      "messageId": "msg-1-1",
      "messagePayload": "critical_order_data"
    }
  }
]
Prefetch (limit = 3) with 10 published messages:
  Consumer active unacked messages: 3
  Queue remaining InQueue messages: 7
  Total accounted: 10 = 10
```

### Traced File & Line Reference
1. `RABBIT_BASIC_RETURN` frame emission: [`packages/simulation/src/domains/rabbitmq/rabbitmq-state-transitions.ts:310-327`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/rabbitmq/rabbitmq-state-transitions.ts#L310-L327)
2. `handlePublish` routing drop: [`packages/simulation/src/domains/rabbitmq/rabbitmq-state-transitions.ts:272-358`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/rabbitmq/rabbitmq-state-transitions.ts#L272-L358)
3. Consumer prefetch dispatch: [`packages/simulation/src/domains/rabbitmq/rabbitmq-state-transitions.ts:420-435`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/rabbitmq/rabbitmq-state-transitions.ts#L420-L435)
4. Fidelity test: [`packages/simulation/src/domains/rabbitmq/rabbitmq.fidelity.test.ts:118-160`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/rabbitmq/rabbitmq.fidelity.test.ts#L118-L160)

### Verification Details
- Mandatory unrouted message: Publishing with `mandatory: true` to `amq.direct` with zero matching bindings and no alternate exchange emits a discrete `RABBIT_BASIC_RETURN` event carrying AMQP replyCode `312`, replyText `'NO_ROUTE'`, exchange `'amq.direct'`, routingKey `'completely.unknown.key.with.zero.bindings'`, and publisher ID `'publisher-client'`. The message is dropped from queues and not requeued per `RABBIT-1`.
- Prefetch verification: Configured consumer prefetch limit $= 3$. Published 10 messages without acking. Active unacked messages delivered to consumer $= 3$. Messages remaining in queue $= 7$. Total accounted $= 10$.

### Verdict
**PASS**


---

## Domain 7: Storage Engine

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [7. STORAGE ENGINE]
Bloom Filter False Positive Rate Verification (seed=74291):
  Parameters: m=2000, k=5, n=150
  Theoretical FP rate: 0.00299 (0.2990%, ~29.9 / 10,000)
  Measured False Positives: 23 / 10,000 (0.2300%)
  Binomial StdDev: 5.46 -> 2-sigma range: [19.0, 40.8]
B+Tree Order in Realistic Mode:
  Hand calculation: floor(4096 / (16 + 8)) = floor(4096 / 24) = 170
  App deriveBTreeOrder output: 170
  Match: true
```

### Traced File & Line Reference
1. `testBloomFilter`: [`packages/simulation/src/domains/storage/lsm-tree.ts:77-116`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/storage/lsm-tree.ts#L77-L116)
2. `calculateTheoreticalBloomFpRate`: [`packages/simulation/src/domains/storage/lsm-tree.ts:121-125`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/storage/lsm-tree.ts#L121-L125)
3. `deriveBTreeOrder`: [`packages/simulation/src/domains/storage/btree.ts:8-10`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/storage/btree.ts#L8-L10)

### Verification Details
- Bloom filter test executed with seed 74291, $m=2000, k=5, n=150$ across 10,000 independent negative probe trials.
- Theoretical FP: $p = (1 - e^{-kn/m})^k = (1 - e^{-5 \times 150 / 2000})^5 = 0.002990$ (29.9 per 10,000).
- Measured FP: 23 out of 10,000 (0.2300%).
- Binomial variance: $\sigma = \sqrt{N p (1 - p)} = \sqrt{10000 \times 0.00299 \times 0.99701} = 5.46$.
- $2\sigma$ statistical window: $[19.0, 40.8]$. The empirical count of 23 falls squarely within this range.
- B+Tree Order: Hand derivation $\lfloor 4096 / (16 + 8) \rfloor = \lfloor 4096 / 24 \rfloor = 170$. App function `deriveBTreeOrder(4096, 16, 8)` returns 170.

### Verdict
**PASS**

---

## Domain 8: Networking

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [8. NETWORKING]
NET-3 Multiplicative Decrease Ratios:
  Reno:  before=10, ssthresh=5, computed ratio = 0.5
  CUBIC: before=10, ssthresh=7, computed ratio = 0.7
SACK Block Inspection:
  Reported SACK blocks count: 3
  Reported SACK blocks (raw): 
[{"leftEdge":1800,"rightEdge":2000},{"leftEdge":1400,"rightEdge":1500},{"leftEdge":1100,"rightEdge":1200}]
```

### Traced File & Line Reference
1. `computeSackBlocks` multi-block coalescing: [`packages/simulation/src/domains/networking/congestion-control.ts:182-220`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/networking/congestion-control.ts#L182-L220)
2. Dup ACK SACK attachment: [`packages/simulation/src/domains/networking/networking-state-transitions.ts:245-270`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/networking/networking-state-transitions.ts#L245-L270)
3. `advanceCongestionWindow` decrease: [`packages/simulation/src/domains/networking/congestion-control.ts:96-106`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/networking/congestion-control.ts#L96-L106)
4. Fidelity test: [`packages/simulation/src/domains/networking/networking.fidelity.test.ts:267-357`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/networking/networking.fidelity.test.ts#L267-L357)

### Verification Details
- Congestion control: Injected packet loss with `cwnd = 10`.
  - Reno: `ssthresh` dropped to 5. Derived ratio: $5 / 10 = 0.5$.
  - CUBIC: `ssthresh` dropped to 7. Derived ratio: $7 / 10 = 0.7$.
- Multi-block non-contiguous SACK reporting: Configured receiver buffer with 3 distinct non-contiguous segment runs ([1100..1200], [1400..1500], [1800..2000]) separated by gaps ([1000..1100], [1200..1400], [1500..1800]).
  - Evaluated RFC 2018 SACK option emitted on duplicate ACK.
  - SACK option reports exactly 3 distinct blocks: `[{leftEdge: 1800, rightEdge: 2000}, {leftEdge: 1400, rightEdge: 1500}, {leftEdge: 1100, rightEdge: 1200}]`.
  - Triggering block is placed first per RFC 2018 §3, with older blocks ordered descending, capped at 4 blocks (TCP options limit).
- **End-to-End Event Pipeline Wiring (`NET_PACKET_TRANSMIT`)**:
  - Tested through the actual `pureNetworkingTransition` reducer under tick-driven out-of-order delivery with two gaps.
  - Test snippet ([`packages/simulation/src/domains/networking/networking.fidelity.test.ts:309-317`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/networking/networking.fidelity.test.ts#L309-L317)):
    ```ts
    const transmitEvent = resT2.emittedEvents.find(
      (e) => e.type === 'NET_PACKET_TRANSMIT' && (e.payload?.flags as string[])?.includes('ACK'),
    );
    expect(transmitEvent).toBeDefined();
    expect((transmitEvent?.payload?.sackBlocks as any[])?.length).toBe(2);
    expect((transmitEvent?.payload?.sackBlocks as any[])?.[0]).toEqual({ leftEdge: 1700, rightEdge: 1900 });
    expect((transmitEvent?.payload?.sackBlocks as any[])?.[1]).toEqual({ leftEdge: 1200, rightEdge: 1400 });
    ```
  - **Before Fix (Unwired Event Pipeline)**:
    ```text
    FAIL src/domains/networking/networking.fidelity.test.ts
    AssertionError: expected undefined to be defined
    ❯ src/domains/networking/networking.fidelity.test.ts:313:28
        expect(transmitEvent).toBeDefined()
    ```
  - **After Fix (Wired into `handlePacketDeliveryTick` emitting `NET_PACKET_TRANSMIT` with `sackBlocks`)**:
    - Emitted event contains RFC 2018 SACK options on the real simulation event stream.
    - 8 of 8 tests pass in `networking.fidelity.test.ts`.

### Verdict
**PASS**


---

## Domain 9: Rate Limiter

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [9. RATE LIMITER]
Derivation of Sliding Window Counter Divergence Bound:
  Approximation formula: N_approx(t) = N_curr + N_prev * (1 - (t % W) / W)
  Under worst-case boundary step traffic: requests cluster at t = W - eps (end of prev window)
  and t = W + delta (start of curr window). The error |N_true - N_approx| reaches limit L.
  Therefore, theoretical max divergence is bounded by limit L (100% burst error / 2.0x limit).
Fixed Window Boundary Burst (Window = 20 ticks, Limit = 25 reqs):
  Admitted at tick 19: 25
  Total Admitted in 2-tick window (tick 19-20) [Fixed Window]: 50
  Total Admitted in 2-tick window [Sliding Window Log]:      25
  Burst Ratio over Limit: 2.00x
```

### Traced File & Line Reference
1. Sliding window counter linear approximation: [`packages/simulation/src/domains/rate-limiter/rate-limiter-algorithms.ts:160-205`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/rate-limiter/rate-limiter-algorithms.ts#L160-L205)
2. Fixed window step: [`packages/simulation/src/domains/rate-limiter/rate-limiter-algorithms.ts:70-98`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/rate-limiter/rate-limiter-algorithms.ts#L70-L98)
3. Sliding log step: [`packages/simulation/src/domains/rate-limiter/rate-limiter-algorithms.ts:120-150`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/rate-limiter/rate-limiter-algorithms.ts#L120-L150)

### First-Principles Derivation of Worst-Case Bound
The sliding window counter estimates requests in window $[t - W, t]$ as:
$$\widehat{N}(t) = N_{\text{curr}} + N_{\text{prev}} \times \left(1 - \frac{t - t_{\text{start}}}{W}\right)$$
Under worst-case boundary step traffic where $L$ requests arrive at $t = W - \epsilon$ (charged to previous window) and $L$ requests arrive at $t = W + \delta$ (beginning of current window):
- True count in $[t - W, t]$ is $N_{\text{prev}} + N_{\text{curr}} = 2L$.
- Estimated count is $\widehat{N}(W + \delta) \approx 0 \times (1) + L = L \le L$.
- Maximum divergence is $|N_{\text{true}} - \widehat{N}| \le L$. The approximation admits up to $2.0\times$ the configured limit across the window boundary.
- Tested: Window $= 20$, Limit $= 25$. 25 requests admitted at tick 19, 25 at tick 20. Total admitted in 2 ticks $= 50$ (burst ratio $= 2.00\times$). Sliding Window Log correctly admitted only 25.

### Verdict
**PASS**

---

## Domain 10: Distributed Lock

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [10. DISTRIBUTED LOCK]
Kleppmann 3-Client Race:
  Fencing DISABLED final value: "WRITE_1" (CORRUPTED: Client 1 overwrote newer Client 3 write)
  Fencing ENABLED final value:  "WRITE_3" (PROTECTED: Client 3 write preserved, rejections=2)
Redlock Quorum for N = 4:
  Formula: floor(4 / 2) + 1 = 3
  Acquired nodes: 4 -> Quorum reached: true
```

### Traced File & Line Reference
1. Redlock quorum calculation: [`packages/simulation/src/domains/distributed-lock/distributed-lock-algorithms.ts:60-98`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/distributed-lock/distributed-lock-algorithms.ts#L60-L98)
2. Fencing token validation on storage: [`packages/simulation/src/domains/distributed-lock/distributed-lock-algorithms.ts:108-142`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/distributed-lock/distributed-lock-algorithms.ts#L108-L142)

### Verification Details
- Kleppmann 3-Client Race Scenario:
  - Client 3 (token 3) writes at tick 5.
  - Client 2 (token 2) delayed, writes at tick 6.
  - Client 1 (token 1) paused by GC pause, writes at tick 7.
  - Fencing DISABLED: Storage overwritten in reverse order, terminating with corrupted `"WRITE_1"`.
  - Fencing ENABLED: Storage rejects Client 2 and Client 1 (`REJECTED_STALE_FENCING_TOKEN`, 2 rejections total); storage correctly preserves `"WRITE_3"`.
- Redlock Quorum for Even $N=4$:
  - Quorum formula $\lfloor 4 / 2 \rfloor + 1 = 3$. App evaluates quorum reached when 4 nodes respond.

### Verdict
**PASS**

---

## Domain 11: CDN & Caching

### Remediation Path Taken
**Path (a): Actually built out the test to the specified scale (10 distinct edge POPs, 100 real cache misses).**

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [11. CDN & CACHING]
Remediation Path (a): Configured 10 distinct Edge POPs.
Scale Execution (10 POPs x 10 requests = 100 requests):
  Total Edge Misses: 100
  Origin Requests Received: 100
Single-Flight Coalescing (50 concurrent requests):
  Origin Requests Received: 1 (Expected: exactly 1)
```

### Traced File & Line Reference
1. Multi-tier edge routing & single-flight coalescing: [`packages/simulation/src/domains/cdn-cache/cdn-cache-state-transitions.ts:210-245`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/cdn-cache/cdn-cache-state-transitions.ts#L210-L245)

### Verification Details
- Constructed cluster topology containing 10 distinct edge POPs: `pop-us-east`, `pop-us-west`, `pop-eu-west`, `pop-ap-south`, `pop-edge-5`, `pop-edge-6`, `pop-edge-7`, `pop-edge-8`, `pop-edge-9`, `pop-edge-10`.
- Dispatched 10 cold unique requests per POP (100 total requests).
- Observed metrics: Edge Cache Misses $= 100$, Origin Requests Received $= 100$.
- Single-Flight Coalescing: Dispatched 50 concurrent requests for cold asset `"/cold-large-asset.tar.gz"`. In-flight lock collapsed all 50 down to exactly 1 origin fetch.

### Verdict
**PASS**

---

## Domain 12: ID Generation

### Remediation Path Taken
**Path (a): Built and ran the full 100,000 IDs across 8 workers scale test.**

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [12. ID GENERATION]
Generating real scale: 100000 Snowflake IDs across 8 workers...
ID Generation Real Scale Results:
  Total IDs Generated: 100000
  Unique IDs in Set:   100000
  Collisions:          0
  Generation Time:     34.23 ms
  Set Uniqueness Check: 35.15 ms
```

### Traced File & Line Reference
1. `generateSnowflakeBigInt`: [`packages/simulation/src/domains/id-gen/snowflake-generator.ts:17-48`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/id-gen/snowflake-generator.ts#L17-L48)
2. `decomposeSnowflake`: [`packages/simulation/src/domains/id-gen/snowflake-generator.ts:54-75`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/id-gen/snowflake-generator.ts#L54-L75)

### Verification Details
- Generated 100,000 64-bit Twitter Snowflake IDs distributed across 8 worker IDs (12,500 IDs generated per worker).
- Total IDs Generated: 100,000.
- `new Set(allIds).size`: 100,000.
- Collisions: 0.
- Generation wall-clock time: 34.23 ms.
- Set insertion and uniqueness evaluation time: 35.15 ms.

### Verdict
**PASS**

---

## Domain 13: Distributed Transactions

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [13. DISTRIBUTED TRANSACTIONS]
2PC Coordinator Crash after 2 of 3 PREPARE messages:
┌─────────┬─────────────────────┬─────────────────────┐
│ (index) │ Participant         │ State               │
├─────────┼─────────────────────┼─────────────────────┤
│ 0       │ 'Order Service'     │ 'BLOCKED_UNCERTAIN' │
│ 1       │ 'Payment Service'   │ 'BLOCKED_UNCERTAIN' │
│ 2       │ 'Inventory Service' │ 'IDLE'              │
└─────────┴─────────────────────┴─────────────────────┘
  Final outcome: BLOCKED_UNCERTAIN
Saga Failure at Step 1 of 4 (earliest possible step):
  Status: COMPENSATED
  Forward completed steps: []
  Compensating steps executed: []
Saga Failure at Step 2 of 4 (exactly 1 step to undo):
  Status: COMPENSATED
  Forward completed steps: ["step-1-order"]
  Compensating steps executed: ["step-1-order"]
```

### Traced File & Line Reference
1. `step2PCCoordinator` prepare dispatch: [`packages/simulation/src/domains/transactions/two-phase-commit.ts:30-80`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/transactions/two-phase-commit.ts#L30-L80)
2. Saga orchestrator forward & compensating step execution: [`packages/simulation/src/domains/transactions/saga-orchestrator.ts:48-95`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/transactions/saga-orchestrator.ts#L48-L95)

### Verification Details
- 2PC Incomplete Prepare Coordinator Crash:
  - Coordinator dispatches PREPARE to participants 1 (`Order Service`) and 2 (`Payment Service`), then crashes before sending to participant 3 (`Inventory Service`).
  - Participants 1 and 2 transition to `BLOCKED_UNCERTAIN`. Participant 3 remains `IDLE`.
- Saga Boundary Steps:
  - Failure at Step 1 of 4: 0 forward steps completed, 0 compensating steps executed, saga transitions cleanly to `COMPENSATED`.
  - Failure at Step 2 of 4: Exactly 1 forward step (`"step-1-order"`) completed, exactly 1 compensating step executed.

### Verdict
**PASS**

---

## Domain 14: `/llm-pipeline`

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [14. /LLM-PIPELINE]
PIPE-8 Partial-attribution drift check:
  Violation detected? NONE (Structural check only: chunk and edge exist)
Context Budget Cap in code: maxContextTokens = 4096 (file:line packages/simulation/src/domains/llm-pipeline/llm-pipeline-state-transitions.ts:109)
Context Budget Overflow check (+1 token):
  Violation: PIPE-1 -> "Context window overflow: current 4097 tokens exceed maximum budget of 4096 tokens."
```

### Traced File & Line Reference
1. Context budget limit definition: [`packages/simulation/src/domains/llm-pipeline/llm-pipeline-state-transitions.ts:109`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/llm-pipeline/llm-pipeline-state-transitions.ts#L109) (`maxContextTokens: 4096`)
2. Context window overflow invariant `PIPE-1`: [`packages/simulation/src/domains/llm-pipeline/llm-pipeline-invariants.ts:30-42`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/llm-pipeline/llm-pipeline-invariants.ts#L30-L42)
3. Provenance lineage invariant `PIPE-8`: [`packages/simulation/src/domains/llm-pipeline/llm-pipeline-invariants.ts:80-125`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/llm-pipeline/llm-pipeline-invariants.ts#L80-L125)

### Verification Details
- **Prefabrication Correction:** Prior reports claimed a context budget cap of 8,192 tokens. The actual codebase at `llm-pipeline-state-transitions.ts:109` configures `maxContextTokens = 4096`. Injecting 4,097 tokens ($4096 + 1$) triggers `PIPE-1`: `"Context window overflow: current 4097 tokens exceed maximum budget of 4096 tokens."`
- `PIPE-8` Lineage Check: When a claim quotes beyond the citation chunk but still points to a valid chunk ID with an active DAG edge, `PIPE-8` returns `undefined` (no violation). `PIPE-8` is strictly a graph-structural check, not a semantic string-comparison verifier.

### Verdict
**PASS**

---

## Domain 15: `/llm-gateway`

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [15. /LLM-GATEWAY]
Configured Circuit Breaker on openai-gpt4o: threshold=4 failures, cooldown=8 ticks
State Machine Transitions with threshold=4, cooldown=8:
┌─────────┬──────┬─────────────┬─────────────────────────────────────────────────────┬───────────┐
│ (index) │ tick │ state       │ note                                                │ successes │
├─────────┼──────┼─────────────┼─────────────────────────────────────────────────────┼───────────┤
│ 0       │ 0    │ 'CLOSED'    │ 'Initial state'                                     │           │
│ 1       │ 4    │ 'OPEN'      │ '4 consecutive failures triggered'                  │           │
│ 2       │ 12   │ 'HALF_OPEN' │ '8 cooldown ticks elapsed'                          │           │
│ 3       │ 13   │ 'HALF_OPEN' │ 'Probe 1: status=ROUTED, selected=openai-gpt4o'     │ 1         │
│ 4       │ 14   │ 'CLOSED'    │ 'Probe 2: status=ROUTED, selected=openai-gpt4o'     │ 0         │
└─────────┴──────┴─────────────┴─────────────────────────────────────────────────────┴───────────┘
Semantic Cache Boundary Check against threshold 0.9:
  Similarity 0.8999: CACHE_MISS (< 0.90)
  Similarity 0.9000: CACHE_HIT (>= 0.90)
  Similarity 0.9001: CACHE_HIT (>= 0.90)
```

### Traced File & Line Reference
1. Circuit breaker state transitions: [`packages/simulation/src/domains/llm-gateway/llm-gateway-state-transitions.ts:80-240`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/llm-gateway/llm-gateway-state-transitions.ts#L80-L240)
2. Semantic cache cosine similarity comparison: [`packages/simulation/src/domains/llm-gateway/llm-gateway-state-transitions.ts:384`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/llm-gateway/llm-gateway-state-transitions.ts#L384) (`similarity >= state.semanticCacheThreshold`)

### Verification Details
- Circuit breaker parameterized with non-default values: `consecutiveFailuresThreshold = 4`, `cooldownTicks = 8`.
  - Tick 0: `CLOSED`
  - Tick 4: 4 failures -> `OPEN`
  - Tick 12: 8 cooldown ticks elapsed -> `HALF_OPEN`
  - Ticks 13-14: 2 consecutive probe successes return state to `CLOSED`.
- Semantic cache boundary against threshold 0.90:
  - Similarity 0.8999: `CACHE_MISS`
  - Similarity 0.9000: `CACHE_HIT` (proves inclusive `>= 0.90` boundary)
  - Similarity 0.9001: `CACHE_HIT`

### Verdict
**PASS**

---

## Domain 16: `/llm-serving`

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [16. /LLM-SERVING]
Hand calculation: req1 (256 tok = 16 blocks) + req2 (256 tok = 16 blocks) = 32 blocks.
Free blocks after prefill: 0 / 32
Preemption triggered on block exhaustion:
  req-1 state: PREEMPTED
  Preempted request IDs: ["req-1"]
  Preemption count metric: 1
Checkpoint-Resume Token Byte Inspection:
  Control output tokens (8): [1568075328,2413008101,2219800163,2881930527,1629658238,3322579794,3556165562,4228907135]
  Resumed output tokens (8): [1568075328,2413008101,2219800163,2881930527,1629658238,3322579794,3556165562,4228907135]
  Checkpoint captured: position=4, savedTokens=4
  Byte-identical continuation verified: true
```

### Traced File & Line Reference
1. Stateful token generator with KV context hash: [`packages/simulation/src/domains/llm-serving/llm-serving-state-transitions.ts:13-42`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/llm-serving/llm-serving-state-transitions.ts#L13-L42)
2. KV block allocation & OOM preemption: [`packages/simulation/src/domains/llm-serving/llm-serving-state-transitions.ts:236-265`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/llm-serving/llm-serving-state-transitions.ts#L236-L265)
3. Priority swap-in resumption & checkpoint restoration: [`packages/simulation/src/domains/llm-serving/llm-serving-state-transitions.ts:275-295`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/llm-serving/llm-serving-state-transitions.ts#L275-L295)
4. Fidelity tests (SERVE-3a byte-identical resume & SERVE-3b mutation proof): [`packages/simulation/src/domains/llm-serving/llm-serving.fidelity.test.ts:100-285`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/llm-serving/llm-serving.fidelity.test.ts#L100-L285)

### Verification Details
- **KV Cache Preemption Hand Calculation**: Pool has 32 blocks (512 tokens capacity). Two 256-token requests require 16 blocks each ($16 + 16 = 32$ blocks). During decode, step requires 1 additional block; pool has 0 free blocks. Code triggers preemption of `req-1` (`metrics.preemptionCount = 1`, `req-1.state = PREEMPTED`). Working state (`outputTokens`, `generatedTokens`) is cleared upon preemption to simulate swap-out / memory liberation.
- **Stateful Token Generation Across Accumulated State**:
  - `generateTokenForPosition(requestId, promptTokens, tokenIndex, seed, previousTokens)` folds an FNV-1a running hash over all prior tokens in `0..N-1` with position weighting `((idx + 1) * 31)`.
  - Token generation is non-memoryless: losing prior tokens causes token generation at position $N$ to diverge fundamentally.
- **Mutation Testing Proof (Sensitivity Verification)**:
  - Deliberately mutated checkpoint implementation to save `position` but omit tokens (`tokens: []`).
  - **Mutation Test Failure Log (Before Fix Reversion)**:
    ```text
    FAIL src/domains/llm-serving/llm-serving.fidelity.test.ts > Domain 11: LLM Inference Serving & PagedAttention Fidelity > SERVE-3: ensures byte-identical output token sequence upon checkpoint-then-resume post preemption
    AssertionError: expected 7 to be 12 // Object.is equality
    - Expected: 12
    + Received: 7
    ❯ src/domains/llm-serving/llm-serving.fidelity.test.ts:191:34
       190|     expect(resumedTokens).toBeDefined();
       191|     expect(resumedTokens.length).toBe(12);
    ```
  - Also added permanent companion test `SERVE-3b` verifying that if a checkpoint loses accumulated token context, resumed tokens diverge: `expect(brokenResumedTokens).not.toEqual(controlTokens)`.
  - **With Real Fix**: Preempted run restores full token context from checkpoint; continuation tokens match control run byte-for-byte across all 12 generated tokens: `expect(resumedTokens).toEqual(controlTokens)`. All 5 tests pass.

### Verdict
**PASS**

---

## Domain 17: `/vectordb`

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [17. /VECTORDB]
HNSW Node Connections:
┌─────────┬─────────┬────────────┬──────────┐
│ (index) │ id      │ totalEdges │ topLayer │
├─────────┼─────────┼────────────┼──────────┤
│ 0       │ 'vec-1' │ 5          │ 2        │
│ 1       │ 'vec-2' │ 5          │ 1        │
│ 2       │ 'vec-4' │ 5          │ 2        │
│ 3       │ 'vec-3' │ 3          │ 0        │
│ 4       │ 'vec-5' │ 1          │ 0        │
└─────────┴─────────┴────────────┴──────────┘
Deleted most connected node "vec-1".
Adjacency list before:
{
  "vec-1": {
    "0": [
      "vec-2",
      "vec-3"
    ],
    "1": [
      "vec-2",
      "vec-4"
    ],
    "2": [
      "vec-4"
    ]
  },
  "vec-2": {
    "0": [
      "vec-1",
      "vec-3",
      "vec-4"
    ],
    "1": [
      "vec-1",
      "vec-4"
    ]
  },
  "vec-3": {
    "0": [
      "vec-1",
      "vec-2",
      "vec-5"
    ]
  },
  "vec-4": {
    "0": [
      "vec-1",
      "vec-2"
    ],
    "1": [
      "vec-1",
      "vec-2"
    ],
    "2": [
      "vec-1"
    ]
  },
  "vec-5": {
    "0": [
      "vec-3"
    ]
  }
}
Adjacency list after:
{
  "vec-2": {
    "0": [
      "vec-3",
      "vec-4"
    ],
    "1": [
      "vec-4"
    ]
  },
  "vec-3": {
    "0": [
      "vec-2",
      "vec-5"
    ]
  },
  "vec-4": {
    "0": [
      "vec-2"
    ],
    "1": [
      "vec-2"
    ],
    "2": []
  },
  "vec-5": {
    "0": [
      "vec-3"
    ]
  }
}
Orphaned nodes count: 0
ef_search Recall Variation (VEC-5):
  ef_search = 1:  Recall = 20.0%, Dist Computations = 24
  ef_search = 5:  Recall = 100.0%, Dist Computations = 25
  ef_search = 25: Recall = 100.0%, Dist Computations = 30
  Monotonic recall progression: true
```

### Traced File & Line Reference
1. HNSW node deletion: [`packages/simulation/src/domains/vectordb/vectordb-state-transitions.ts:120-145`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/vectordb/vectordb-state-transitions.ts#L120-L145)
2. Layer 0 `ef_search` bounded candidate beam search: [`packages/simulation/src/domains/vectordb/vectordb-state-transitions.ts:210-285`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/vectordb/vectordb-state-transitions.ts#L210-L285)
3. Bidirectional graph pruning: [`packages/simulation/src/domains/vectordb/vectordb-state-transitions.ts:156-175`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/vectordb/vectordb-state-transitions.ts#L156-L175)
4. Fidelity test: [`packages/simulation/src/domains/vectordb/vectordb.fidelity.test.ts:106-188`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/vectordb/vectordb.fidelity.test.ts#L106-L188)

### Verification Details
- Node deletion: Identified `vec-1` with 5 connections across layers 0, 1, 2. Deleted `vec-1`. Walking the remaining graph proves zero orphaned nodes in layer 0 (`vec-2`, `vec-3`, `vec-4`, `vec-5` remain mutually reachable).
- `ef_search` recall variation: Built 25-vector clustered dataset and queried top-$k=5$ with varying beam parameters:
  - `efSearch = 1`: Greedy search explores 24 distances, recall $= 20.0\%$.
  - `efSearch = 5`: Beam search explores 25 distances, recall $= 100.0\%$.
  - `efSearch = 25`: Full candidate search explores 30 distances, recall $= 100.0\%$.
  - Monotonic non-decreasing progression verified across all 3 values, demonstrating real search breadth control.

### Verdict
**PASS**

---

## Domain 18: `/gpu-cluster`

### Command Run
```powershell
node scripts/run-domain-specific-audit-v3.mjs
```

### Raw Terminal Output
```text
>>> [18. /GPU-CLUSTER]
Ring-AllReduce Barrier with 2 Simultaneous Stragglers:
  Straggler 1 (gpu-2): delay = 3 ticks
  Straggler 2 (gpu-5): delay = 7 ticks
  Tick 1: Both stragglers active. stepTimeMs = 285ms
  Tick 4: Straggler 1 reports ready. Barrier STILL HOLDS due to Straggler 2!
  Tick 8: Slower straggler reports ready. Barrier RELEASED! stepTimeMs = 142.5ms
GPU Checkpoint Corruption & Restart-from-Scratch (GPU-3 / GPU-5):
  Valid checkpoint saved at step 150: checksum=0x621a63f4
  Happy-path resume: status=TRAINING, resumedAtStep=150, event=GPU_RESUME_FROM_CHECKPOINT
  Organically corrupted resume attempt (parameterHash bit flip):
    Emitted event: GPU_CHECKPOINT_CORRUPT_RESTART (reason: "Checksum mismatch: expected 0xdeef9e07, got 0x621a63f4")
    Status: TRAINING, Step reset: 0 (RESTARTED FROM SCRATCH)
```

### Traced File & Line Reference
1. Ring-AllReduce straggler penalty calculation: [`packages/simulation/src/domains/gpu-cluster/gpu-cluster-state-transitions.ts:285-300`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/gpu-cluster/gpu-cluster-state-transitions.ts#L285-L300)
2. Checkpoint state generation & stateful checksum computation: [`packages/simulation/src/domains/gpu-cluster/gpu-cluster-state-transitions.ts:15-77`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/gpu-cluster/gpu-cluster-state-transitions.ts#L15-L77)
3. Preemption capture with ModelWeightShards & OptimizerState: [`packages/simulation/src/domains/gpu-cluster/gpu-cluster-state-transitions.ts:320-345`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/gpu-cluster/gpu-cluster-state-transitions.ts#L320-L345)
4. Resume checksum verification & restart-from-scratch: [`packages/simulation/src/domains/gpu-cluster/gpu-cluster-state-transitions.ts:360-410`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/gpu-cluster/gpu-cluster-state-transitions.ts#L360-L410)
5. Fidelity tests (GPU-5a positive validation & GPU-5b organic corruption): [`packages/simulation/src/domains/gpu-cluster/gpu-cluster.fidelity.test.ts:113-195`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/gpu-cluster/gpu-cluster.fidelity.test.ts#L113-L195)

### Verification Details
- **Ring-AllReduce with 2 simultaneous stragglers**: `gpu-2` throttled by 3 ticks, `gpu-5` throttled by 7 ticks.
  - At tick 1: Both stragglers active. `stepTimeMs = 285ms`.
  - At tick 4: Faster straggler (`gpu-2`) finishes; barrier continues to hold at `stepTimeMs = 285ms`.
  - At tick 8: Slower straggler (`gpu-5`) finishes; barrier releases, and step time drops to nominal `142.5ms`.
- **Stateful Checkpoint Representation & State-Based Checksum**:
  - `GPUCheckpoint` holds real simulated model state: `weightShards: ModelWeightShard[]` (with `parameterHash`, `fp32MasterWeightSum`, `layerRange`) and `optimizerState: OptimizerState` (`step`, `learningRate`, `beta1`, `beta2`, `weightDecay`).
  - `computeCheckpointChecksum` hashes all weight shards and optimizer state fields.
- **Organic Corruption Detection (No Manual Flag)**:
  - In `GPU-5b`, the test corrupts underlying data directly (`corruptState.trainingJob.lastCheckpoint.weightShards[0].parameterHash ^= 0x1337`) *without* setting `corrupted = true` and *without* hand-crafting a bad checksum string.
  - The resumption path computes `expectedChecksum` over the modified shard parameter hash, detects the organic mismatch (`expected 0xdeef9e07, got 0x621a63f4`), resets training to step 0, and emits `GPU_CHECKPOINT_CORRUPT_RESTART`.
- **Before / After Failure Evidence**:
  - **Before Fix (unpopulated weightShards / identifier-only checksum)**:
    ```text
    FAIL src/domains/gpu-cluster/gpu-cluster.fidelity.test.ts > Domain 13: GPU Cluster & 3D Parallelism Fidelity > GPU-5: detects corrupted checkpoint upon spot-resume and enforces restart-from-scratch
    AssertionError: expected undefined to be defined
    ❯ src/domains/gpu-cluster/gpu-cluster.fidelity.test.ts:145:66
       144|     const corruptState: any = JSON.parse(JSON.stringify(state));
       145|     expect(corruptState.trainingJob.lastCheckpoint.weightShards).toBeDefined();
    ```
  - **After Fix**:
    - `GPU-5a` (positive companion test): Unmodified checkpoint validates cleanly; resumes at step 150 with `GPU_RESUME_FROM_CHECKPOINT`.
    - `GPU-5b` (organic corruption test): Checksum mismatch detected; resets step to 0 with `GPU_CHECKPOINT_CORRUPT_RESTART`.
    - All 6 tests in `gpu-cluster.fidelity.test.ts` pass.

### Verdict
**PASS**

