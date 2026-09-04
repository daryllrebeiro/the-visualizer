# TheVisualizer — Real-World Fidelity References & System Specifications

This document defines the authoritative references, formal specifications, RFCs, and source implementations underpinning each of the 8 simulated distributed systems domains in TheVisualizer platform. Every behavioral formula, configuration threshold, state transition, and naming convention in the simulation engine is cross-referenced against these sources.

---

## 1. Domain Specifications & Authoritative Sources

| Domain                                         | Simulated Technology             | Authoritative Specifications & Architecture References                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Primary Version / Standard                                     |
| :--------------------------------------------- | :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| **Kafka** (`/kafka`)                           | Apache Kafka                     | • [KIP-500: Replace ZooKeeper with KRaft Consensus](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum)<br>• [KIP-595: A Raft Protocol for the Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-595%3A+A+Raft+Protocol+for+the+Metadata+Quorum)<br>• [Kafka Replication Protocol & ISR Semantics](https://kafka.apache.org/documentation/#design_replicatedlog)<br>• [KIP-98: Exactly Once Delivery and Transactional Messaging](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging)                                                    | Apache Kafka 4.0 (KRaft mode)                                  |
| **Raft** (`/raft`)                             | Raft Consensus                   | • Ongaro & Ousterhout (2014): [In Search of an Understandable Consensus Algorithm (USENIX ATC '14)](https://raft.github.io/raft.pdf)<br>• [etcd/raft Production Implementation & PreVote Extension](https://github.com/etcd-io/raft)<br>• [HashiCorp Serf/Raft Protocol Guidelines](https://github.com/hashicorp/raft)                                                                                                                                                                                                                                                                                                                                                                  | Raft Consensus Specification (incl. PreVote & Joint Consensus) |
| **Database** (`/database`)                     | Distributed NoSQL                | • DeCandia et al. (2007): [Dynamo: Amazon's Highly Available Key-value Store (SOSP '07)](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)<br>• [Apache Cassandra Architecture & Storage Engine](https://cassandra.apache.org/_/architecture/index.html)<br>• [Cassandra Vnodes & Murmur3Partitioner Guidelines](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html)                                                                                                                                                                                                                                                                       | Apache Cassandra 5.0 / Dynamo model                            |
| **Redis** (`/redis`)                           | Redis Cluster                    | • [Redis Cluster Specification (CRC16-CCITT, Resharding, ASKing)](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)<br>• [Redis Keyspace and Eviction Policies (maxmemory-samples)](https://redis.io/docs/latest/develop/reference/eviction/)<br>• [Redis Cluster Bus Gossip Protocol Specification](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/#redis-cluster-bus)                                                                                                                                                                                                                                                                | Redis 7.2+ Cluster Protocol                                    |
| **Kubernetes** (`/kubernetes`)                 | Kubernetes Control Plane         | • [Kubernetes Scheduling Framework (kube-scheduler)](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/)<br>• [Pod Quality of Service (QoS) Classes](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/)<br>• [Disruptions & PodDisruptionBudgets (PDB)](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)<br>• [Deployment RollingUpdate: maxSurge and maxUnavailable](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-update-deployment)                                                                                                                                                                   | Kubernetes v1.31 API Specification                             |
| **RabbitMQ** (`/rabbitmq`)                     | AMQP 0-9-1 & Quorum Queues       | • [AMQP 0-9-1 Protocol Specification](https://www.rabbitmq.com/resources/specs/amqp0-9-1.pdf)<br>• [RabbitMQ Quorum Queues & Raft Integration](https://www.rabbitmq.com/docs/quorum-queues)<br>• [Consumer Acknowledgements and Flow Control (basic.qos)](https://www.rabbitmq.com/docs/confirms)<br>• [RabbitMQ Alternate Exchanges Specification](https://www.rabbitmq.com/docs/ae)                                                                                                                                                                                                                                                                                                   | RabbitMQ 3.13+ / AMQP 0-9-1                                    |
| **Storage Engine** (`/storage`)                | B+Tree vs. LSM-Tree              | • [SQLite B-Tree Design & File Format Specification](https://www.sqlite.org/fileformat2.html#btree)<br>• [RocksDB Leveled Compaction Architecture](https://github.com/facebook/rocksdb/wiki/Leveled-Compaction-Style)<br>• [Bloom Filters in LSM Systems: False-Positive Probability Math](https://en.wikipedia.org/wiki/Bloom_filter#Probability_of_false_positives)<br>• [Write Amplification Analysis in LSM Databases](https://www.cs.umb.edu/~poneil/lsmt.pdf)                                                                                                                                                                                                                     | SQLite 3 B+Tree & RocksDB 9.0 LSM                              |
| **Networking** (`/networking`)                 | TCP Transmission Control         | • [RFC 793: Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc793)<br>• [RFC 5681: TCP Congestion Control (Slow Start, Fast Recovery)](https://www.rfc-editor.org/rfc/rfc5681)<br>• [RFC 6298: Computing TCP's Retransmission Timer (SRTT, RTTVAR)](https://www.rfc-editor.org/rfc/rfc6298)<br>• [RFC 2018: TCP Selective Acknowledgment Options (SACK)](https://www.rfc-editor.org/rfc/rfc2018)<br>• [RFC 7323: TCP Extensions for High Performance (Window Scale)](https://www.rfc-editor.org/rfc/rfc7323)<br>• Ha, Rhee, & Xu (2008): [CUBIC: A New TCP-Friendly High-Speed TCP Variant](https://www.cs.princeton.edu/courses/archive/fall16/cos561/papers/cubic.pdf) | Linux Kernel 6.x TCP / RFC 793 / RFC 5681 / RFC 6298           |
| **Rate Limiter** (`/rate-limiter`)             | API Gateway & Edge Rate Limiting | • [RFC 2697: Single Rate Three Color Marker](https://www.rfc-editor.org/rfc/rfc2697)<br>• [RFC 2698: Two Rate Three Color Marker](https://www.rfc-editor.org/rfc/rfc2698)<br>• [Cloudflare: How we built rate limiting (Sliding Window Counter)](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)<br>• [Stripe: Rate limiters and shedding techniques](https://stripe.com/blog/rate-limiters)                                                                                                                                                                                                                                                                    | Production API Gateways (Envoy / Cloudflare / Redis)           |
| **Distributed Lock** (`/distributed-lock`)     | Distributed Lock Manager         | • [Redis: Distributed Locks with Redlock (Sanfilippo)](https://redis.io/docs/latest/develop/use/patterns/distributed-locks/)<br>• Kleppmann (2016): [How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)<br>• Burrows (2006): [The Chubby lock service for loosely-coupled distributed systems (OSDI '06)](https://research.google/pubs/pub27897/)                                                                                                                                                                                                                                                                               | Redlock Quorum & Raft-backed Lease Authority                   |
| **CDN Cache** (`/cdn-cache`)                   | Multi-Tier CDN & Edge Caching    | • [RFC 9111: HTTP Caching (stale-while-revalidate, max-age, conditional revalidation)](https://www.rfc-editor.org/rfc/rfc9111)<br>• [RFC 5861: HTTP Cache-Control Extensions for Stale Content](https://www.rfc-editor.org/rfc/rfc5861)<br>• [Fastly / Cloudflare Multi-Tiered Cache Architecture](https://www.cloudflare.com/learning/cdn/what-is-caching/)                                                                                                                                                                                                                                                                                                                            | RFC 9111 / Edge PoP Tiered Hierarchy                           |
| **ID Generator** (`/id-gen`)                   | Distributed 64-bit ID Generation | • [Twitter Snowflake Specification](https://github.com/twitter-archive/snowflake/tree/snowflake-2010)<br>• [RFC 9562: Universally Unique IDentifiers (UUIDv7 & UUIDv4)](https://www.rfc-editor.org/rfc/rfc9562)<br>• [Sonyflake Distributed ID Generator](https://github.com/sony/sonyflake)                                                                                                                                                                                                                                                                                                                                                                                            | Snowflake 64-bit / RFC 9562 UUIDv7                             |
| **Distributed Transactions** (`/transactions`) | 2PC & Saga Orchestration         | • Gray (1978): [Notes on Data Base Operating Systems (Two-Phase Commit Protocol)](https://www.microsoft.com/en-us/research/publication/notes-on-data-base-operating-systems/)<br>• Garcia-Molina & Salem (1987): [Sagas (ACM SIGMOD '87)](https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf)<br>• [Microservices Patterns: Saga Orchestration & Choreography](https://microservices.io/patterns/data/saga.html)                                                                                                                                                                                                                                                           | Two-Phase Commit (2PC) / Saga Pattern                          |

---

## 2. Configuration Knob Parity Table

Mapping of official system configuration parameters to TheVisualizer simulation state properties:

### A. Kafka (`/kafka`)

| Real System Config Name          | Simulation State Property      | Unit / Type                       | Tunable in UI? | Reference Spec          |
| :------------------------------- | :----------------------------- | :-------------------------------- | :------------: | :---------------------- |
| `replica.lag.time.max.ms`        | `replicaLagTimeMaxTicks`       | Ticks (integer)                   |  Yes (Slider)  | Kafka Broker Config     |
| `min.insync.replicas`            | `minInsyncReplicas`            | Integer ($\ge 1$)                 | Yes (Stepper)  | Topic / Broker Config   |
| `acks`                           | `producerAcks`                 | `0 \| 1 \| -1` (`all`)            |  Yes (Select)  | Kafka Producer Config   |
| `unclean.leader.election.enable` | `uncleanLeaderElectionEnabled` | Boolean                           |  Yes (Toggle)  | Topic / Broker Config   |
| `enable.idempotence`             | `idempotentProducer`           | Boolean                           |  Yes (Toggle)  | KIP-98 Producer Config  |
| `group.protocol`                 | `rebalanceProtocol`            | `'eager' \| 'cooperative-sticky'` |  Yes (Select)  | KIP-848 Consumer Config |
| `cleanup.policy`                 | `cleanupPolicy`                | `'delete' \| 'compact'`           |  Yes (Select)  | Topic Config            |

### B. Storage Engine (`/storage`)

| Real System Config Name          | Simulation State Property      | Unit / Type                         | Tunable in UI? | Reference Spec                     |
| :------------------------------- | :----------------------------- | :---------------------------------- | :------------: | :--------------------------------- |
| `page_size`                      | `pageSizeBytes` / `bTreeOrder` | Bytes (512–16384)                   |  Yes (Select)  | SQLite PRAGMA page_size            |
| `write_buffer_size`              | `memTableCapacity`             | Entries / Bytes                     |  Yes (Slider)  | RocksDB ColumnFamilyOptions        |
| `max_bytes_for_level_multiplier` | `levelSizeMultiplier`          | Ratio (default: 10)                 |  Yes (Slider)  | RocksDB Leveled Compaction         |
| `bloom_filter_bits_per_key`      | `bitsPerKey`                   | Bits/key (default: 10)              |  Yes (Slider)  | RocksDB BlockBasedTableOptions     |
| `wal_sync_policy`                | `walSyncPolicy`                | `'ALWAYS' \| 'PERIODIC' \| 'BATCH'` |  Yes (Select)  | RocksDB DBOptions::WAL_ttl_seconds |
| `fidelity_mode`                  | `fidelityMode`                 | `'TEXTBOOK' \| 'REALISTIC'`         |  Yes (Toggle)  | TheVisualizer Engine Extension     |

### C. TCP Networking (`/networking`)

| Real System Config Name  | Simulation State Property             | Unit / Type         | Tunable in UI? | Reference Spec                                    |
| :----------------------- | :------------------------------------ | :------------------ | :------------: | :------------------------------------------------ |
| `tcp_congestion_control` | `congestionAlgorithm`                 | `'CUBIC' \| 'RENO'` |  Yes (Select)  | Linux `/proc/sys/net/ipv4/tcp_congestion_control` |
| `tcp_sack`               | `sackEnabled`                         | Boolean             |  Yes (Toggle)  | RFC 2018 / Linux sysctl                           |
| `tcp_window_scaling`     | `windowScaleFactor`                   | Shift factor (0–14) |  Yes (Slider)  | RFC 7323 / Linux sysctl                           |
| `initial_rto`            | `rtoTicks` (derived from SRTT/RTTVAR) | Ticks (calculated)  |    Observed    | RFC 6298                                          |
| `tcp_nagle`              | `nagleEnabled`                        | Boolean             |  Yes (Toggle)  | RFC 896 / TCP_NODELAY socket option               |

### D. Redis Cluster (`/redis`)

| Real System Config Name | Simulation State Property | Unit / Type          | Tunable in UI? | Reference Spec                 |
| :---------------------- | :------------------------ | :------------------- | :------------: | :----------------------------- |
| `maxmemory-policy`      | `evictionPolicy`          | 8 policies           |  Yes (Select)  | Redis `redis.conf`             |
| `maxmemory-samples`     | `sampleCount`             | Integer (default: 5) |  Yes (Slider)  | Redis `redis.conf`             |
| `cluster-node-timeout`  | `clusterNodeTimeoutTicks` | Ticks                |  Yes (Slider)  | Redis Cluster Config           |
| `hash_tag`              | `extractHashTag()`        | String `{...}`       |   Automatic    | Redis Cluster Spec Section 4.1 |

### E. Raft Consensus (`/raft`)

| Real System Config Name  | Simulation State Property            | Unit / Type        |   Tunable in UI?   | Reference Spec                           |
| :----------------------- | :----------------------------------- | :----------------- | :----------------: | :--------------------------------------- |
| `ElectionTimeoutRange`   | `minTimeoutTicks`, `maxTimeoutTicks` | Ticks (randomized) | Yes (Range Slider) | Raft Paper §5.2                          |
| `PreVote`                | `preVoteEnabled`                     | Boolean            |    Yes (Toggle)    | etcd/raft / Ongaro Dissertation §9.6     |
| `SnapshotThreshold`      | `snapshotIntervalTicks`              | Ticks              |    Yes (Slider)    | Raft Paper §7                            |
| `LinearizableReadMethod` | `readIndexEnabled`                   | Boolean            |    Yes (Toggle)    | Raft Paper §8 (Leader Lease / ReadIndex) |

### F. Distributed DB (`/database`)

| Real System Config Name  | Simulation State Property | Unit / Type               | Tunable in UI? | Reference Spec                  |
| :----------------------- | :------------------------ | :------------------------ | :------------: | :------------------------------ |
| `num_tokens` (vnodes)    | `vnodesPerNode`           | Integer (8–256)           |  Yes (Slider)  | Cassandra `cassandra.yaml`      |
| `hinted_handoff_enabled` | `hintedHandoffEnabled`    | Boolean                   |  Yes (Toggle)  | Cassandra `cassandra.yaml`      |
| `read_repair_chance`     | `readRepairChance`        | Float (0.0–1.0)           |  Yes (Slider)  | Cassandra ColumnFamily metadata |
| `consistency_level`      | `consistencyLevel`        | Full set (`ONE` .. `ALL`) |  Yes (Select)  | CQL Consistency Level Spec      |

### G. Kubernetes (`/kubernetes`)

| Real System Config Name        | Simulation State Property    | Unit / Type                             |   Tunable in UI?   | Reference Spec             |
| :----------------------------- | :--------------------------- | :-------------------------------------- | :----------------: | :------------------------- |
| `scheduler.framework`          | `filterStage` + `scoreStage` | Pipeline                                |     Automatic      | kube-scheduler design      |
| `qosClass`                     | `qosClass`                   | `Guaranteed \| Burstable \| BestEffort` | Yes (Per pod spec) | Kubernetes Pod QoS Design  |
| `rollingUpdate.maxSurge`       | `maxSurge`                   | Integer / %                             |    Yes (Input)     | Kubernetes Deployment Spec |
| `rollingUpdate.maxUnavailable` | `maxUnavailable`             | Integer / %                             |    Yes (Input)     | Kubernetes Deployment Spec |
| `minAvailable` (PDB)           | `pdbMinAvailable`            | Integer                                 |    Yes (Input)     | PodDisruptionBudget Spec   |

### H. RabbitMQ (`/rabbitmq`)

| Real System Config Name     | Simulation State Property  | Unit / Type             | Tunable in UI? | Reference Spec                       |
| :-------------------------- | :------------------------- | :---------------------- | :------------: | :----------------------------------- |
| `basic.qos(prefetch_count)` | `prefetchCount`            | Integer (1–100)         |  Yes (Slider)  | AMQP 0-9-1 `basic.qos`               |
| `publisher_confirms`        | `publisherConfirmsEnabled` | Boolean                 |  Yes (Toggle)  | RabbitMQ Confirms Protocol Extension |
| `queue_type`                | `queueType`                | `'classic' \| 'quorum'` |  Yes (Select)  | RabbitMQ Quorum Queues (Raft)        |
| `alternate-exchange`        | `alternateExchange`        | String (Exchange ID)    |  Yes (Input)   | RabbitMQ AE Extension                |

### I. Rate Limiter (`/rate-limiter`)

| Real System Config Name | Simulation State Property | Unit / Type                        | Tunable in UI? | Reference Spec                                  |
| :---------------------- | :------------------------ | :--------------------------------- | :------------: | :---------------------------------------------- |
| `bucket_capacity`       | `capacity`                | Tokens (integer)                   |  Yes (Slider)  | RFC 2697 CBS / Token Bucket                     |
| `refill_rate`           | `refillRatePerSec`        | Tokens / sec                       |  Yes (Slider)  | RFC 2697 CIR                                    |
| `window_size`           | `windowDurationMs`        | Milliseconds (e.g. 1000)           |  Yes (Slider)  | Cloudflare Sliding Window Counter               |
| `algorithm`             | `algorithmMode`           | 5 algorithms                       |  Yes (Select)  | Token, Leaky, Fixed, SlidingLog, SlidingCounter |
| `backend_mode`          | `backendMode`             | `'LOCAL_MEMORY' \| 'SHARED_REDIS'` |  Yes (Toggle)  | Distributed Rate Limiter Pattern                |

### J. Distributed Lock Manager (`/distributed-lock`)

| Real System Config Name | Simulation State Property | Unit / Type                   | Tunable in UI? | Reference Spec                                |
| :---------------------- | :------------------------ | :---------------------------- | :------------: | :-------------------------------------------- |
| `lock_ttl_ms`           | `leaseTtlMs`              | Milliseconds (default: 10000) |  Yes (Slider)  | Redlock `validity_time`                       |
| `retry_count`           | `retryCount`              | Integer (3–10)                |  Yes (Slider)  | Redlock Spec §2                               |
| `clock_drift_factor`    | `clockDriftFactor`        | Ratio (default: 0.01)         |  Yes (Slider)  | Redlock drift formula ($TTL \times 0.01 + 2$) |
| `fencing_tokens`        | `fencingEnabled`          | Boolean                       |  Yes (Toggle)  | Kleppmann Fencing Tokens Check                |
| `backend`               | `lockBackend`             | `'REDLOCK' \| 'RAFT_LEASE'`   |  Yes (Toggle)  | Redis Quorum vs. Consensus Lease              |

### K. CDN & Multi-Tier Caching (`/cdn-cache`)

| Real System Config Name  | Simulation State Property   | Unit / Type                      |   Tunable in UI?    | Reference Spec                             |
| :----------------------- | :-------------------------- | :------------------------------- | :-----------------: | :----------------------------------------- |
| `Cache-Control: max-age` | `maxAgeTicks`               | Ticks (integer)                  |    Yes (Slider)     | RFC 9111 §5.2.2.1                          |
| `stale-while-revalidate` | `staleWhileRevalidateTicks` | Ticks (integer)                  |    Yes (Slider)     | RFC 5861 / RFC 9111 §5.2.2.16              |
| `ETag` / `If-None-Match` | `etag` / `lastModified`     | String hash                      | Yes (Input/Inspect) | RFC 9111 §3.2                              |
| `request_coalescing`     | `coalescingEnabled`         | Boolean                          |    Yes (Toggle)     | Single-flight Origin Fetch (RFC 9111 §3.1) |
| `tiered_cache`           | `tieredTopology`            | Edge $\to$ Regional $\to$ Origin | Yes (Topology view) | Multi-tier Architecture                    |

### L. Distributed ID Generation (`/id-gen`)

| Real System Config Name | Simulation State Property | Unit / Type                             | Tunable in UI? | Reference Spec                   |
| :---------------------- | :------------------------ | :-------------------------------------- | :------------: | :------------------------------- |
| `worker_id_bits`        | `workerIdBits`            | 10 bits (0–1023)                        |     Fixed      | Twitter Snowflake Specification  |
| `sequence_bits`         | `sequenceBits`            | 12 bits (0–4095/ms)                     |     Fixed      | Twitter Snowflake Specification  |
| `epoch_ms`              | `customEpochMs`           | Milliseconds (custom baseline)          |  Yes (Config)  | Snowflake Baseline Epoch         |
| `clock_skew_guard`      | `refuseOnBackwardClock`   | Boolean                                 |  Yes (Toggle)  | Snowflake NTP Regression Guard   |
| `generator_mode`        | `generatorType`           | `'SNOWFLAKE' \| 'UUID_V4' \| 'UUID_V7'` |  Yes (Select)  | RFC 9562 vs Snowflake comparison |

### M. Distributed Transactions (`/transactions`)

| Real System Config Name    | Simulation State Property | Unit / Type                                                         |   Tunable in UI?   | Reference Spec                        |
| :------------------------- | :------------------------ | :------------------------------------------------------------------ | :----------------: | :------------------------------------ |
| `transaction_protocol`     | `protocol`                | `'TWO_PHASE_COMMIT' \| 'SAGA_ORCHESTRATION' \| 'SAGA_CHOREOGRAPHY'` |    Yes (Select)    | Gray 1978 / Garcia-Molina 1987        |
| `participant_timeout_ms`   | `participantTimeoutTicks` | Ticks (integer)                                                     |    Yes (Slider)    | 2PC Prepare Timeout                   |
| `coordinator_crash_timing` | `coordinatorCrashPoint`   | `'NONE' \| 'AFTER_PREPARE' \| 'AFTER_COMMIT'`                       | Yes (Chaos Select) | 2PC Blocking Hazard Demonstration     |
| `compensation_strategy`    | `compensationOrder`       | Strict reverse (`LIFO`)                                             |      Enforced      | Saga Compensating Transaction Pattern |
