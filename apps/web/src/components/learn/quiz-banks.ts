import type { QuizQuestion } from '@the-visualizer/contracts';

/**
 * Hand-authored, curated quiz bank. Each question is tagged to the specific
 * invariant or algorithm it tests. No generative content — every item below
 * was written against the domain's actual reducer/invariant implementation.
 */
export const QUIZ_BANK: QuizQuestion[] = [
  // ─── Kafka ────────────────────────────────────────────────────────────────
  {
    id: 'kafka-q1',
    domainId: 'kafka',
    invariantId: 'ISR_SUBSET_OF_REPLICAS',
    kind: 'multiple-choice',
    prompt: 'Why must the ISR always be a subset of the assigned replicas for a partition?',
    choices: [
      'To keep ZooKeeper snapshots small',
      'A replica that was never assigned cannot be meaningfully "in sync" — admitting it would let an empty log vote on the high watermark',
      'To reduce the number of TCP connections per broker',
      'It is only a UI convention in this simulator',
    ],
    answerIndex: 1,
    answer: 'A replica that was never assigned cannot be meaningfully "in sync"',
    explanation:
      'ISR membership means "this replica has caught up to the leader end offset". A broker holding no replica of the partition has no log to compare, so admitting it would corrupt high-watermark advancement and committed-offset guarantees.',
    tags: ['replication', 'isr'],
  },
  {
    id: 'kafka-q2',
    domainId: 'kafka',
    invariantId: 'HIGH_WATERMARK_BOUND',
    kind: 'flashcard',
    prompt: 'State the high-watermark bound invariant.',
    answer: 'highWatermark ≤ min(logEndOffset) over all ISR members',
    explanation:
      'Consumers may only read up to the high watermark, and the watermark may never exceed the shortest in-sync log — otherwise a consumer could read records that later vanish on leader failover.',
    tags: ['replication', 'consumers'],
  },
  {
    id: 'kafka-q3',
    domainId: 'kafka',
    invariantId: 'LEADER_EXISTS',
    kind: 'multiple-choice',
    prompt: 'A partition reports no leader after a broker crash. What must happen before produces with acks=-1 can succeed again?',
    choices: [
      'Consumers must rejoin their group',
      'A new leader must be elected from the ISR (or unclean election explicitly enabled)',
      'The topic must be recreated',
      'Nothing — followers accept produces directly',
    ],
    answerIndex: 1,
    answer: 'A new leader must be elected from the ISR',
    explanation:
      'All produces go through the partition leader. With acks=-1 the write additionally waits for full ISR acknowledgement, so both leader election and ISR health gate availability.',
    tags: ['leader-election', 'availability'],
  },

  // ─── Raft ─────────────────────────────────────────────────────────────────
  {
    id: 'raft-q1',
    domainId: 'raft',
    kind: 'multiple-choice',
    prompt: 'In the raft-election-race scenario, why can two candidates both fail to win an election in the same term?',
    choices: [
      'Votes are split — neither reaches a quorum majority, so both time out and increment the term',
      'The leader vetoes both candidacies',
      'Terms are randomly skipped by followers',
      'It cannot happen; one candidate always wins',
    ],
    answerIndex: 0,
    answer: 'Votes are split — neither reaches a quorum majority',
    explanation:
      'With 5 nodes, a candidate needs 3 votes. If two candidates each secure 2 votes (self + one follower) and the fifth vote goes nowhere, the term ends leaderless and a new term begins with fresh randomized timeouts.',
    tags: ['elections', 'quorum'],
  },
  {
    id: 'raft-q2',
    domainId: 'raft',
    kind: 'flashcard',
    prompt: 'What is the minimum quorum size for a 5-node Raft cluster, and why that number?',
    answer: '3 — a majority, so any two quorums overlap in at least one node',
    explanation:
      'Overlapping majorities guarantee at most one leader per term: two different leaders would each need a majority, and any two majorities of 5 share a node that votes only once per term.',
    tags: ['quorum', 'safety'],
  },
  {
    id: 'raft-q3',
    domainId: 'raft',
    kind: 'multiple-choice',
    prompt: 'During raft-split-brain-partition, the minority partition keeps its old leader. Why can it not commit new entries?',
    choices: [
      'Its log is sealed automatically',
      'It cannot reach a majority to replicate entries, so nothing advances past the commit index',
      'Followers refuse all AppendEntries during a partition',
      'The old leader steps down immediately on partition',
    ],
    answerIndex: 1,
    answer: 'It cannot reach a majority to replicate entries',
    explanation:
      'Raft commits an entry only after a majority has stored it. A 2-of-5 minority can neither elect a new leader nor commit, which is exactly the safety property that prevents split-brain commits.',
    tags: ['partitions', 'safety'],
  },

  // ─── Database (Dynamo-style) ──────────────────────────────────────────────
  {
    id: 'database-q1',
    domainId: 'database',
    invariantId: 'DB-2',
    kind: 'multiple-choice',
    prompt: 'With replication factor N=3, write quorum W=2 and read quorum R=2, what consistency guarantee holds?',
    choices: [
      'Eventual consistency only',
      'Strong consistency, because R + W > N guarantees read/write quorum overlap',
      'No guarantee — quorums must be equal',
      'Strong consistency only during business hours',
    ],
    answerIndex: 1,
    answer: 'Strong consistency, because R + W > N guarantees overlap',
    explanation:
      'Any read quorum (2 nodes) and any write quorum (2 nodes) of a 3-node replica set share at least one node, which holds the latest write. Try the db-quorum-race scenario with W=1 to watch this break.',
    tags: ['quorums', 'consistency'],
  },
  {
    id: 'database-q2',
    domainId: 'database',
    kind: 'flashcard',
    prompt: 'What is hinted handoff, and which failure does it mask?',
    answer: 'A coordinator temporarily stores a write destined for a down replica and replays it on recovery — masks transient node outages without losing writes',
    explanation:
      'See the db-hinted-handoff scenario: the hint is held with a TTL and replayed when the replica returns, preserving availability during short failures at the cost of temporary staleness.',
    tags: ['availability', 'repair'],
  },
  {
    id: 'database-q3',
    domainId: 'database',
    kind: 'multiple-choice',
    prompt: 'When a new node joins the ring (db-node-join-rebalance), why does only a fraction of keys move?',
    choices: [
      'Keys are randomly reassigned to balance load',
      'Consistent hashing maps both nodes and keys to the ring, so the joiner inherits only the key ranges of its immediate neighbors',
      'The coordinator copies the entire dataset to the new node',
      'Keys never move; the new node starts empty forever',
    ],
    answerIndex: 1,
    answer: 'The joiner inherits only its neighbors’ key ranges',
    explanation:
      'Consistent hashing gives minimal disruption: only the ranges now owned by the joining node transfer, roughly 1/N of keys, instead of a full reshuffle.',
    tags: ['hashing', 'membership'],
  },

  // ─── Redis ────────────────────────────────────────────────────────────────
  {
    id: 'redis-q1',
    domainId: 'redis',
    kind: 'multiple-choice',
    prompt: 'In redis-master-failover, why can a promoted replica serve stale reads immediately after promotion?',
    choices: [
      'It deletes its dataset on promotion',
      'Asynchronous replication means the replica may lag the old master; the last acknowledged writes may not have arrived',
      'Clients cache the old master address forever',
      'Promotion always starts from an empty dataset',
    ],
    answerIndex: 1,
    answer: 'Async replication lag means the replica may be behind',
    explanation:
      'Redis Cluster replicates asynchronously for speed. Failover trades recency for availability — the WAIT command exists precisely to bound this lag when you need it.',
    tags: ['replication', 'failover'],
  },
  {
    id: 'redis-q2',
    domainId: 'redis',
    kind: 'flashcard',
    prompt: 'LRU vs LFU eviction: which survives a one-time scan over cold keys, and why?',
    answer: 'LFU — a single scan pollutes LRU recency (every scanned key looks "recent"), while LFU frequency counts barely move',
    explanation:
      'Run the redis-lru-lfu-shootout scenario: scan traffic evicts the hot working set under LRU but leaves LFU mostly intact. This is why Redis 4+ defaults to LFU-ish (volatile-lfu / allkeys-lfu) for mixed workloads.',
    tags: ['eviction', 'memory'],
  },
  {
    id: 'redis-q3',
    domainId: 'redis',
    kind: 'multiple-choice',
    prompt: 'During redis-resharding-ask-moved, what does a -MOVED redirection tell the client?',
    choices: [
      'The key expired',
      'The slot permanently lives on another node — update the slot map and retry there',
      'The cluster is down',
      'The value is too large',
    ],
    answerIndex: 1,
    answer: 'The slot permanently lives on another node',
    explanation:
      '-MOVED (vs -ASK, which is temporary mid-migration) means the client’s slot cache is stale and must be refreshed. Smart clients update their map instead of re-asking every time.',
    tags: ['sharding', 'protocol'],
  },

  // ─── Kubernetes ───────────────────────────────────────────────────────────
  {
    id: 'kubernetes-q1',
    domainId: 'kubernetes',
    invariantId: 'K8S_CPU_OVERCOMMIT',
    kind: 'multiple-choice',
    prompt: 'What does the K8S_CPU_OVERCOMMIT invariant forbid?',
    choices: [
      'Running more than one container per pod',
      'Scheduling pods whose summed CPU requests exceed node allocatable capacity',
      'Using CPU limits at all',
      'Vertical pod autoscaling',
    ],
    answerIndex: 1,
    answer: 'Scheduled CPU requests exceeding node capacity',
    explanation:
      'Requests are the scheduler’s contract: overcommitting them means the kubelet cannot honor reservations under pressure, causing throttling or evictions. Watch k8s-pod-pending-starvation for the flip side — honest requests with no fitting node.',
    tags: ['scheduling', 'capacity'],
  },
  {
    id: 'kubernetes-q2',
    domainId: 'kubernetes',
    kind: 'flashcard',
    prompt: 'Rolling update with maxUnavailable=0, maxSurge=1: what availability property holds during the rollout?',
    answer: 'Full capacity is always available — one extra pod runs before any old pod is terminated',
    explanation:
      'Try k8s-rolling-update: surge creates the replacement first, readiness gates the cutover, and only then is an old pod removed. maxUnavailable=0 is the "never degrade" setting, paid for with temporary extra capacity.',
    tags: ['deployments', 'availability'],
  },
  {
    id: 'kubernetes-q3',
    domainId: 'kubernetes',
    kind: 'multiple-choice',
    prompt: 'A node is drained (k8s-node-drain) but one pod refuses to move. What most likely blocks it?',
    choices: [
      'The pod image is too large',
      'A PodDisruptionBudget or local-storage / mirror-static constraints prevent eviction',
      'The node ran out of disk',
      'Drains never move pods',
    ],
    answerIndex: 1,
    answer: 'A PodDisruptionBudget or non-evictable pod constraints',
    explanation:
      'Drain respects PDBs (minAvailable) and cannot evict mirror/static pods or pods with local storage. The drain stalls — by design — rather than violating the budget.',
    tags: ['operations', 'safety'],
  },

  // ─── RabbitMQ ─────────────────────────────────────────────────────────────
  {
    id: 'rabbitmq-q1',
    domainId: 'rabbitmq',
    kind: 'multiple-choice',
    prompt: 'A topic exchange binding uses `orders.*.paid`. Which routing key matches?',
    choices: ['orders.paid', 'orders.eu.paid', 'orders.eu.paid.extra', 'orders'],
    answerIndex: 1,
    answer: 'orders.eu.paid',
    explanation:
      'In AMQP topic matching, `*` substitutes exactly one word and `#` zero or more. Try rabbit-topic-wildcards: `orders.*.paid` matches three-word keys with `paid` last.',
    tags: ['routing', 'amqp'],
  },
  {
    id: 'rabbitmq-q2',
    domainId: 'rabbitmq',
    kind: 'flashcard',
    prompt: 'What is a dead-letter exchange, and what failure pattern does it break?',
    answer: 'An exchange receiving rejected/expired messages — it breaks the poison-pill loop where one bad message is redelivered forever, blocking the queue',
    explanation:
      'See rabbit-dlx-poison-pill: without a DLX policy (max redeliveries → dead-letter), a single malformed message head-of-line-blocks every consumer.',
    tags: ['reliability', 'poison-pill'],
  },
  {
    id: 'rabbitmq-q3',
    domainId: 'rabbitmq',
    kind: 'multiple-choice',
    prompt: 'With competing consumers and prefetch=1, what ordering guarantee remains?',
    choices: [
      'Global FIFO across all consumers',
      'Per-consumer sequential processing, but no global order — use a single active consumer or sharding for order',
      'Random order',
      'LIFO order',
    ],
    answerIndex: 1,
    answer: 'Per-consumer order only; no global order',
    explanation:
      'Competing consumers parallelize at the cost of global ordering. prefetch=1 gives fair dispatch but messages still interleave across consumers — run rabbit-competing-consumers to watch it happen.',
    tags: ['consumers', 'ordering'],
  },

  // ─── Storage ──────────────────────────────────────────────────────────────
  {
    id: 'storage-q1',
    domainId: 'storage',
    kind: 'multiple-choice',
    prompt: 'In storage-btree-splits, why does a node split propagate upward instead of just growing the node?',
    choices: [
      'Disk sectors are fixed size',
      'B-tree nodes have a fixed max fan-out; overflow splits the node and pushes the median key to the parent, preserving logarithmic depth',
      'Splits are cosmetic in this simulator',
      'The root must always have exactly two children',
    ],
    answerIndex: 1,
    answer: 'Fixed fan-out forces a split that pushes the median key up',
    explanation:
      'Bounded node size is what keeps every operation O(log n). The median-key promotion keeps the tree balanced without rebalancing the whole structure.',
    tags: ['btree', 'indexing'],
  },
  {
    id: 'storage-q2',
    domainId: 'storage',
    kind: 'flashcard',
    prompt: 'LSM compaction: what fundamental tradeoff does it manage?',
    answer: 'Write throughput vs read amplification and space — batching writes into SSTables is fast, but overlapping levels force compaction work that competes with reads',
    explanation:
      'Watch storage-lsm-compaction: write stalls appear when L0 fills faster than compaction drains it. Size-tiered vs leveled strategies sit at different points on this curve.',
    tags: ['lsm', 'compaction'],
  },
  {
    id: 'storage-q3',
    domainId: 'storage',
    kind: 'multiple-choice',
    prompt: 'Why do LSM point reads check a Bloom filter before touching SSTables?',
    choices: [
      'To compress the key',
      'To skip disk I/O for keys that definitely are not in a table — a negative answer is certain, positives are verified on disk',
      'Bloom filters store the values',
      'It is required by the file format',
    ],
    answerIndex: 1,
    answer: 'To skip disk I/O on certain negatives',
    explanation:
      'Each SSTable carries a Bloom filter of its keys. A negative means "definitely absent" — skip the file. False positives only cost one extra lookup, which is why the probabilistic-structures domain pairs naturally with this one.',
    tags: ['lsm', 'bloom'],
  },

  // ─── Networking ───────────────────────────────────────────────────────────
  {
    id: 'networking-q1',
    domainId: 'networking',
    invariantId: 'NET-3',
    kind: 'multiple-choice',
    prompt: 'On packet loss, TCP Reno/CUBIC cuts the congestion window. What is the exact decrease factor modeled by NET-3?',
    choices: ['To 1 MSS (full reset)', 'Multiplicative decrease: cwnd × 0.5 (Reno) or × 0.7 (CUBIC)', 'Subtract exactly 1 MSS', 'Double it to probe faster'],
    answerIndex: 1,
    answer: 'Multiplicative decrease: cwnd × 0.5 (Reno) or × 0.7 (CUBIC)',
    explanation:
      'AIMD — additive increase, multiplicative decrease — is the stability core of TCP congestion control. Run tcp-congestion-aimd and check NET-3: the window must drop by exactly the configured beta on loss, never to zero.',
    tags: ['tcp', 'congestion'],
  },
  {
    id: 'networking-q2',
    domainId: 'networking',
    kind: 'flashcard',
    prompt: 'Why does TCP need a three-way handshake instead of two messages?',
    answer: 'Both sides must agree on initial sequence numbers — the third ACK confirms the responder’s SYN arrived, preventing stale duplicate SYNs from opening ghost connections',
    explanation:
      'Replay tcp-three-way-handshake: without the final ACK, an old delayed SYN could be mistaken for a fresh connection request. Sequence-number synchronization is the point, not politeness.',
    tags: ['tcp', 'handshake'],
  },
  {
    id: 'networking-q3',
    domainId: 'networking',
    kind: 'multiple-choice',
    prompt: 'Slow start doubles cwnd per RTT. When does it stop doubling?',
    choices: [
      'After exactly 10 RTTs',
      'At ssthresh (or on loss) — then congestion avoidance takes over with linear growth',
      'Never; it doubles forever',
      'When the receiver closes the window',
    ],
    answerIndex: 1,
    answer: 'At ssthresh (or on loss), switching to congestion avoidance',
    explanation:
      'Slow start is exponential only up to ssthresh. Crossing it (or losing a packet) switches to AIMD linear probing — the knee in every tcp-congestion-aimd graph.',
    tags: ['tcp', 'congestion'],
  },

  // ─── Rate limiter ─────────────────────────────────────────────────────────
  {
    id: 'rate-limiter-q1',
    domainId: 'rate-limiter',
    invariantId: 'RL-3',
    kind: 'multiple-choice',
    prompt: 'Fixed Window admits up to 2× the limit across a window boundary. Why is this disqualifying in interviews?',
    choices: [
      'It uses too much memory',
      'Back-to-back bursts at 11:59:59 and 12:00:00 each consume a full quota, so the enforced rate is double the advertised one exactly when traffic spikes',
      'It cannot be implemented in Redis',
      'Fixed Window is always slower',
    ],
    answerIndex: 1,
    answer: 'Boundary bursts double the effective rate under spike traffic',
    explanation:
      'RL-3 is intentionally violable: the flaw is structural, not a bug. The standard answer progression is Fixed Window → Sliding Window Log (exact, memory-heavy) → Sliding Window Counter or Token Bucket (approximate, bounded memory).',
    tags: ['algorithms', 'interview-favorite'],
  },
  {
    id: 'rate-limiter-q2',
    domainId: 'rate-limiter',
    invariantId: 'RL-1',
    kind: 'flashcard',
    prompt: 'State the token-bucket boundedness invariant RL-1.',
    answer: '0 ≤ tokens ≤ capacity at all times',
    explanation:
      'Refills clamp at capacity (no saving up infinite burst) and consumption never drives the count negative. Violation means the limiter is minting or destroying quota.',
    tags: ['token-bucket', 'invariants'],
  },
  {
    id: 'rate-limiter-q3',
    domainId: 'rate-limiter',
    invariantId: 'RL-4',
    kind: 'multiple-choice',
    prompt: 'Sliding Window Counter approximates Sliding Window Log. What bounds the RL-4 divergence?',
    choices: [
      'Zero — they are always identical',
      'At most ceil(globalLimit × 0.5) (min 5) under step traffic — the weighted previous-window estimate can only drift so far',
      'Unbounded; the approximation has no guarantees',
      'Exactly one request per window',
    ],
    answerIndex: 1,
    answer: 'Bounded by roughly half the limit',
    explanation:
      'The counter weights the previous window by overlap fraction. Under adversarial step traffic the estimate error is bounded — that bound is what makes the approximation production-safe where Fixed Window is not.',
    tags: ['algorithms', 'approximation'],
  },

  // ─── Distributed lock ─────────────────────────────────────────────────────
  {
    id: 'distributed-lock-q1',
    domainId: 'distributed-lock',
    invariantId: 'LOCK-4',
    kind: 'multiple-choice',
    prompt: 'Redlock with naive mutual exclusion fails the Kleppmann scenario (LOCK-4). What breaks?',
    choices: [
      'Redis runs out of memory',
      'A client paused past its lock TTL (GC pause, long STW) still believes it holds the lock while another client acquires it — mutual exclusion is violated without fencing',
      'Redlock requires exactly 3 nodes',
      'Locks can never be released',
    ],
    answerIndex: 1,
    answer: 'A stalled holder plus a new acquirer coexist — fencing tokens are missing',
    explanation:
      'Time-based locks cannot guarantee exclusion under arbitrary pauses. The fix is fencing: every lock grant carries a monotonically increasing token, and the storage layer rejects writes with stale tokens. Trigger it in the Kleppmann scenario and watch LOCK-4 fire.',
    tags: ['redlock', 'fencing'],
  },
  {
    id: 'distributed-lock-q2',
    domainId: 'distributed-lock',
    invariantId: 'LOCK-1',
    kind: 'flashcard',
    prompt: 'State the mutual-exclusion invariant LOCK-1.',
    answer: 'At most one client holds a given lock at any tick',
    explanation:
      'The foundational safety property. Every correct algorithm in this domain (Redlock with fencing, etcd leases, ZooKeeper ephemeral sequentials) exists to preserve exactly this under failures.',
    tags: ['safety', 'invariants'],
  },
  {
    id: 'distributed-lock-q3',
    domainId: 'distributed-lock',
    invariantId: 'LOCK-3',
    kind: 'multiple-choice',
    prompt: 'Why must lock TTLs be paired with heartbeats (LOCK-3) rather than set very long?',
    choices: [
      'Long TTLs waste Redis memory',
      'Crashed holders would block the resource until TTL expiry; heartbeats let live holders extend while dead ones release quickly',
      'Heartbeats are required by the Redis protocol',
      'Short TTLs are always safer with no downside',
    ],
    answerIndex: 1,
    answer: 'Heartbeats separate liveness from lease length',
    explanation:
      'A long static TTL turns every crash into a long outage; a short TTL without renewal kills live holders during pauses (see LOCK-4). Heartbeat renewal is the standard resolution.',
    tags: ['leases', 'liveness'],
  },

  // ─── CDN cache ────────────────────────────────────────────────────────────
  {
    id: 'cdn-cache-q1',
    domainId: 'cdn-cache',
    invariantId: 'CDN-1',
    kind: 'multiple-choice',
    prompt: 'A response carries `Cache-Control: no-store`. What must every tier do?',
    choices: [
      'Cache it for 60 seconds anyway',
      'Never store it — not at edge, browser, or origin shield',
      'Store it but revalidate every time',
      'Only the browser may store it',
    ],
    answerIndex: 1,
    answer: 'Never store it at any tier',
    explanation:
      'no-store is the strongest directive: it exists for sensitive responses. CDN-1 fires if any tier retains the object. Contrast with no-cache (store, but revalidate before reuse).',
    tags: ['http-caching', 'semantics'],
  },
  {
    id: 'cdn-cache-q2',
    domainId: 'cdn-cache',
    invariantId: 'CDN-2',
    kind: 'flashcard',
    prompt: 'Stale-while-revalidate: what user-visible property must hold?',
    answer: 'A stale response may be served instantly while a background revalidation refreshes it — staleness is bounded and the refresh must actually happen',
    explanation:
      'SWR trades freshness for latency. CDN-2 checks the bound: serving stale forever (revalidation never completing) is a violation, not a feature.',
    tags: ['http-caching', 'freshness'],
  },
  {
    id: 'cdn-cache-q3',
    domainId: 'cdn-cache',
    invariantId: 'CDN-3',
    kind: 'multiple-choice',
    prompt: 'Cache stampede (thundering herd) happens when?',
    choices: [
      'Too many edge nodes exist',
      'A hot key expires and hundreds of concurrent requests all miss and hit origin simultaneously',
      'TLS handshakes are slow',
      'The origin returns 304',
    ],
    answerIndex: 1,
    answer: 'Concurrent misses on a hot expired key flood origin',
    explanation:
      'CDN-3 watches origin concurrency collapse. Mitigations: request coalescing (single-flight), probabilistic early revalidation, or stale-while-revalidate to keep serving during refresh.',
    tags: ['stampede', 'origin-shield'],
  },

  // ─── ID gen ───────────────────────────────────────────────────────────────
  {
    id: 'id-gen-q1',
    domainId: 'id-gen',
    invariantId: 'ID-3',
    kind: 'multiple-choice',
    prompt: 'ID-3 is about clock skew refusal. Why must a Snowflake generator refuse rather than wait when the clock moves backward?',
    choices: [
      'Waiting is always fine and ID-3 is wrong',
      'Unbounded waiting stalls ID issuance; refusing surfaces the fault, and bounded wait + refuse is the standard compromise — but silent continuation would duplicate IDs',
      'Clocks never move backward',
      'NTP prevents all skew',
    ],
    answerIndex: 1,
    answer: 'Silent continuation duplicates IDs; refusal surfaces the fault',
    explanation:
      'Snowflake IDs embed timestamp bits — going backward reuses timestamp space and collides with already-issued IDs. ID-3 enforces the refusal; operators then fix NTP rather than debugging duplicate primary keys.',
    tags: ['snowflake', 'clocks'],
  },
  {
    id: 'id-gen-q2',
    domainId: 'id-gen',
    invariantId: 'ID-1',
    kind: 'flashcard',
    prompt: 'State the uniqueness invariant ID-1.',
    answer: 'No two issued IDs are ever equal, across workers and restarts',
    explanation:
      'Uniqueness composes worker-ID uniqueness, timestamp monotonicity, and sequence rollover handling. Violate any leg (duplicate worker IDs being the classic) and primary keys collide.',
    tags: ['uniqueness', 'invariants'],
  },
  {
    id: 'id-gen-q3',
    domainId: 'id-gen',
    invariantId: 'ID-2',
    kind: 'multiple-choice',
    prompt: 'Snowflake IDs are roughly time-ordered (ID-2). What breaks if sequence bits overflow within one millisecond?',
    choices: [
      'Nothing; overflow is impossible',
      'The generator must wait for the next millisecond — emitting anyway would break ordering and risk collision',
      'It borrows bits from the worker ID',
      'IDs become UUIDs automatically',
    ],
    answerIndex: 1,
    answer: 'It must stall to the next millisecond',
    explanation:
      '12 sequence bits = 4096 IDs/ms/worker. Past that, the only correct move is waiting out the millisecond — throughput-capped by design, which is why high-throughput systems shard across workers.',
    tags: ['snowflake', 'ordering'],
  },

  // ─── Transactions ─────────────────────────────────────────────────────────
  {
    id: 'transactions-q1',
    domainId: 'transactions',
    invariantId: 'TXN-2',
    kind: 'multiple-choice',
    prompt: '2PC coordinator crashes after sending PREPARE but before COMMIT (TXN-2). What is the system state?',
    choices: [
      'Participants safely abort on their own',
      'Participants block holding locks — they cannot unilaterally decide without risking divergence, which is 2PC’s fundamental availability hazard',
      'The transaction auto-commits',
      'Nothing happens; 2PC is non-blocking',
    ],
    answerIndex: 1,
    answer: 'Participants block holding locks — the 2PC blocking hazard',
    explanation:
      'TXN-2 is intentionally violable in the coordinator-crash scenario: a YES-voting participant that unilaterally aborts could diverge from one that commits. This blocking window is exactly why 3PC/Paxos-commit exist.',
    tags: ['2pc', 'blocking'],
  },
  {
    id: 'transactions-q2',
    domainId: 'transactions',
    invariantId: 'TXN-1',
    kind: 'flashcard',
    prompt: 'State the atomicity invariant TXN-1.',
    answer: 'A transaction’s effects are all-or-nothing: either every participant commits or every participant aborts — no mixed outcome is observable',
    explanation:
      'The defining property of a transaction. 2PC’s entire message dance (VOTE → DECISION → ACK) exists to make mixed outcomes impossible under crash failures.',
    tags: ['atomicity', 'invariants'],
  },
  {
    id: 'transactions-q3',
    domainId: 'transactions',
    invariantId: 'TXN-3',
    kind: 'multiple-choice',
    prompt: 'A saga compensates a failed booking flow. What correctness property must compensations preserve?',
    choices: [
      'Exactly-once execution of each step',
      'Semantic atomicity: either the whole saga completes or every completed step is compensated in reverse order',
      'Zero latency',
      'No logging',
    ],
    answerIndex: 1,
    answer: 'Semantic atomicity via reverse-order compensation',
    explanation:
      'Sagas trade isolation for availability: no locks held across services, but every forward step needs a compensating action, run in reverse, to unwind partial work. TXN-3 checks the unwind is complete.',
    tags: ['saga', 'compensation'],
  },

  // ─── RAG ──────────────────────────────────────────────────────────────────
  {
    id: 'rag-q1',
    domainId: 'rag',
    invariantId: 'RAG-1',
    kind: 'multiple-choice',
    prompt: 'RAG-1 guards retrieval recall. What fails when chunking is too coarse?',
    choices: [
      'Embeddings become faster',
      'Relevant passages get buried inside giant chunks, diluting similarity scores — recall drops even though the text is "in" the index',
      'The vector DB uses less memory, which is always good',
      'Nothing; chunk size does not matter',
    ],
    answerIndex: 1,
    answer: 'Diluted similarity buries the relevant passage',
    explanation:
      'An embedding averages its chunk’s meaning. A 4000-token chunk containing one relevant paragraph scores worse than a tight 300-token chunk — chunking strategy directly moves RAG-1.',
    tags: ['chunking', 'retrieval'],
  },
  {
    id: 'rag-q2',
    domainId: 'rag',
    invariantId: 'RAG-2',
    kind: 'flashcard',
    prompt: 'What does the "lost in the middle" phenomenon say about context ordering?',
    answer: 'LLMs attend best to the start and end of long contexts and worst to the middle — so retrieved passages must be ranked with the most relevant at the edges, not just appended',
    explanation:
      'RAG-2 checks context packing: dumping 50 chunks in retrieval order wastes the middle. RRF fusion plus edge-packing is the standard mitigation, modeled in the lost-in-middle scenario.',
    tags: ['context', 'ranking'],
  },
  {
    id: 'rag-q3',
    domainId: 'rag',
    invariantId: 'RAG-3',
    kind: 'multiple-choice',
    prompt: 'Hybrid retrieval (dense + BM25 with RRF) beats either alone when?',
    choices: [
      'Always, by a fixed 10%',
      'When queries mix semantic intent with rare exact terms (IDs, codes, names) — dense catches meaning, BM25 catches literals',
      'Never; hybrid is strictly worse',
      'Only for English text',
    ],
    answerIndex: 1,
    answer: 'Mixed semantic + exact-term queries',
    explanation:
      'Dense embeddings miss rare literals; BM25 misses paraphrase. Reciprocal Rank Fusion combines both rankings without score calibration — RAG-3 measures the fused recall lift.',
    tags: ['hybrid', 'rrf'],
  },

  // ─── Agents ───────────────────────────────────────────────────────────────
  {
    id: 'agents-q1',
    domainId: 'agents',
    invariantId: 'AGENT-1',
    kind: 'multiple-choice',
    prompt: 'AGENT-1 bounds tool-call loops. What failure does it catch?',
    choices: [
      'Slow tools',
      'An agent stuck in a plan-act loop that never terminates — e.g., retrying a failing tool with identical arguments',
      'Too many agents',
      'Large prompts',
    ],
    answerIndex: 1,
    answer: 'Non-terminating plan-act loops',
    explanation:
      'Without a step budget and progress detection, agents burn tokens forever on unachievable subgoals. AGENT-1 fires when iterations exceed the budget with no state progress.',
    tags: ['loops', 'safety'],
  },
  {
    id: 'agents-q2',
    domainId: 'agents',
    invariantId: 'AGENT-2',
    kind: 'flashcard',
    prompt: 'What does MCP tool-schema validation (AGENT-2) prevent?',
    answer: 'Malformed or hallucinated tool arguments reaching real systems — every call is checked against the tool’s declared schema before execution',
    explanation:
      'Agents invent plausible-but-wrong arguments constantly. Schema gating turns a hallucinated `delete_all: true` into a validation error instead of an incident.',
    tags: ['mcp', 'validation'],
  },
  {
    id: 'agents-q3',
    domainId: 'agents',
    invariantId: 'AGENT-3',
    kind: 'multiple-choice',
    prompt: 'Why does AGENT-3 require capability-scoped tool access per agent?',
    choices: [
      'To save memory',
      'Least privilege: a compromised or confused agent can only invoke the tools its role needs, bounding blast radius',
      'Tools are expensive to list',
      'It makes logs shorter',
    ],
    answerIndex: 1,
    answer: 'Least privilege bounds blast radius',
    explanation:
        'A research agent with drop-table access is a liability. Capability scoping is the multi-agent version of least-privilege service accounts — enforced by the harness, not by hoping.',
    tags: ['security', 'least-privilege'],
  },

  // ─── LLM serving ──────────────────────────────────────────────────────────
  {
    id: 'llm-serving-q1',
    domainId: 'llm-serving',
    invariantId: 'LLM-1',
    kind: 'multiple-choice',
    prompt: 'PagedAttention splits the KV cache into blocks. What fragmentation does LLM-1 police?',
    choices: [
      'Disk fragmentation',
      'Internal fragmentation: allocated-but-unused slots inside fixed pages must stay under budget, else VRAM is silently wasted',
      'Network packet fragmentation',
      'Prompt fragmentation',
    ],
    answerIndex: 1,
    answer: 'Internal fragmentation inside KV-cache pages',
    explanation:
      'Contiguous allocation wastes the tail of every sequence’s reservation. Paging bounds waste to a fraction of one block per sequence — LLM-1 fires when a scheduler lets waste accumulate.',
    tags: ['pagedattention', 'memory'],
  },
  {
    id: 'llm-serving-q2',
    domainId: 'llm-serving',
    invariantId: 'LLM-2',
    kind: 'flashcard',
    prompt: 'Continuous batching: what is the core scheduling insight?',
    answer: 'Requests join and leave the running batch at token boundaries instead of waiting for whole-batch completion — the batch is reassembled every iteration',
    explanation:
      'Static batching idles the GPU on stragglers. Continuous batching keeps utilization high by admitting new sequences the moment any slot frees — LLM-2 checks iteration-step correctness.',
    tags: ['batching', 'scheduling'],
  },
  {
    id: 'llm-serving-q3',
    domainId: 'llm-serving',
    invariantId: 'LLM-3',
    kind: 'multiple-choice',
    prompt: 'TTFT vs TPOT: which does prefill optimization target?',
    choices: [
      'TPOT — time per output token',
      'TTFT — time to first token, dominated by the prefill pass over the prompt',
      'Neither; prefill is free',
      'Both equally',
    ],
    answerIndex: 1,
    answer: 'TTFT, dominated by the prefill pass',
    explanation:
      'Prefill processes all prompt tokens in parallel (compute-bound); decode emits one token at a time (memory-bound). Chunked prefill and prefix caching attack TTFT without hurting TPOT.',
    tags: ['latency', 'prefill'],
  },

  // ─── Vector DB ────────────────────────────────────────────────────────────
  {
    id: 'vectordb-q1',
    domainId: 'vectordb',
    invariantId: 'VEC-1',
    kind: 'multiple-choice',
    prompt: 'HNSW search descends from the top layer to layer 0. What breaks if entry-point selection is wrong (VEC-1)?',
    choices: [
      'Nothing; any entry point works equally',
      'Recall collapses — greedy routing from a bad entry converges to a local minimum far from the true neighbors',
      'Search gets faster',
      'The graph becomes undirected',
    ],
    answerIndex: 1,
    answer: 'Greedy routing converges to the wrong neighborhood',
    explanation:
      'HNSW has no backtracking across layers; the entry point determines which basin you descend into. VEC-1 guards entry quality, and efSearch widens the descent to tolerate imperfection.',
    tags: ['hnsw', 'recall'],
  },
  {
    id: 'vectordb-q2',
    domainId: 'vectordb',
    invariantId: 'VEC-2',
    kind: 'flashcard',
    prompt: 'efSearch trades what against what?',
    answer: 'Recall against latency — a larger candidate list explores more of the graph (better recall) at the cost of more distance computations per query',
    explanation:
      'The single most-operated production knob in ANN serving. VEC-2 checks that raising efSearch monotonically improves (or holds) recall — if not, the graph itself is degraded.',
    tags: ['tuning', 'recall-latency'],
  },
  {
    id: 'vectordb-q3',
    domainId: 'vectordb',
    invariantId: 'VEC-3',
    kind: 'multiple-choice',
    prompt: 'Cosine vs dot-product vs Euclidean: when does the choice actually change rankings?',
    choices: [
      'Never; they always agree',
      'When vectors are unnormalized — cosine ignores magnitude while dot-product rewards it, so long documents outrank short relevant ones under dot-product',
      'Only for binary vectors',
      'Only above 1536 dimensions',
    ],
    answerIndex: 1,
    answer: 'Unnormalized vectors: magnitude leaks into dot-product rankings',
    explanation:
      'Normalize and the three mostly agree. Skip normalization and dot-product systematically prefers long chunks — a silent relevance bug VEC-3 is designed to catch.',
    tags: ['distance', 'normalization'],
  },

  // ─── GPU cluster ──────────────────────────────────────────────────────────
  {
    id: 'gpu-cluster-q1',
    domainId: 'gpu-cluster',
    invariantId: 'GPU-1',
    kind: 'multiple-choice',
    prompt: 'In 1F1B pipeline parallelism, what causes the pipeline "bubble" (GPU-1)?',
    choices: [
      'Faulty GPUs',
      'Fill/drain phases where some stages have no micro-batch yet (or anymore) — idle time proportional to (stages-1) × (forward+backward)',
      'Slow NVLink',
      'Too many micro-batches',
    ],
    answerIndex: 1,
    answer: 'Fill/drain idle time at pipeline boundaries',
    explanation:
      'GPU-1 measures bubble fraction. More micro-batches amortize it; interleaved schedules (1F1B-I) shrink it further. The bubble is the fundamental tax of pipeline parallelism.',
    tags: ['pipeline-parallel', 'bubble'],
  },
  {
    id: 'gpu-cluster-q2',
    domainId: 'gpu-cluster',
    invariantId: 'GPU-2',
    kind: 'flashcard',
    prompt: 'Tensor parallel vs pipeline parallel: what is sharded in each?',
    answer: 'Tensor parallel shards individual layers (matmuls) across GPUs needing fast interconnect every op; pipeline parallel shards whole layers into stages with only point-to-point activation transfer',
    explanation:
      'Tensor parallel = wide and chatty (NVLink required); pipeline = deep and quiet (tolerates slower links) but pays the bubble. GPU-2 checks the communication accounting matches the strategy.',
    tags: ['parallelism', 'strategy'],
  },
  {
    id: 'gpu-cluster-q3',
    domainId: 'gpu-cluster',
    invariantId: 'GPU-3',
    kind: 'multiple-choice',
    prompt: 'Data-parallel training with N workers and a fixed global batch: what happens to per-worker batch size?',
    choices: [
      'It grows with N',
      'It shrinks as global/N — and below a point, communication dominates and scaling efficiency (GPU-3) collapses',
      'It stays constant',
      'Data parallel has no batch concept',
    ],
    answerIndex: 1,
    answer: 'Shrinks as global/N; efficiency collapses past the scaling knee',
    explanation:
      'All-reduce cost is roughly constant per step while per-worker work shrinks — the scaling curve bends. GPU-3 fires when efficiency drops below the viable threshold.',
    tags: ['data-parallel', 'scaling'],
  },

  // ─── LLM pipeline ─────────────────────────────────────────────────────────
  {
    id: 'llm-pipeline-q1',
    domainId: 'llm-pipeline',
    invariantId: 'PIPE-1',
    kind: 'multiple-choice',
    prompt: 'PIPE-1 guards token-budget accounting. What breaks when a stage silently exceeds its budget?',
    choices: [
      'Nothing; budgets are advisory',
      'Downstream stages receive truncated context with no signal — retrieval quality and answer faithfulness degrade invisibly',
      'The pipeline runs faster',
      'Budgets auto-expand',
    ],
    answerIndex: 1,
    answer: 'Silent truncation degrades downstream quality',
    explanation:
      'U-shaped budget windows only work if every stage honestly reports usage. PIPE-1 fires on unaccounted overflow so truncation is explicit, never silent.',
    tags: ['budgets', 'context'],
  },
  {
    id: 'llm-pipeline-q2',
    domainId: 'llm-pipeline',
    invariantId: 'PIPE-3',
    kind: 'flashcard',
    prompt: 'RRF (Reciprocal Rank Fusion): why fuse ranks instead of raw scores?',
    answer: 'Dense and BM25 scores live on incomparable scales — ranks are scale-free, so 1/(k+rank) fusion needs no calibration and is robust to either retriever failing',
    explanation:
      'PIPE-3 checks the fused ordering. Rank fusion is the reason hybrid retrieval works without learning a score-calibration model per corpus.',
    tags: ['rrf', 'fusion'],
  },
  {
    id: 'llm-pipeline-q3',
    domainId: 'llm-pipeline',
    invariantId: 'PIPE-4',
    kind: 'multiple-choice',
    prompt: 'A pipeline stage caches aggressively but serves stale embeddings after an index rebuild. Which contract broke?',
    choices: [
      'Latency SLO',
      'Cache-invalidation contract: cached artifacts must be versioned against the index build that produced them (PIPE-4)',
      'The tokenizer',
      'Nothing — staleness is acceptable',
    ],
    answerIndex: 1,
    answer: 'Versioned cache-invalidation contract',
    explanation:
      'Embeddings are only valid against their index build. PIPE-4 requires cache keys to embed the build version, so a rebuild can never serve pre-rebuild vectors as current.',
    tags: ['caching', 'versioning'],
  },

  // ─── LLM gateway ──────────────────────────────────────────────────────────
  {
    id: 'llm-gateway-q1',
    domainId: 'llm-gateway',
    invariantId: 'GW-1',
    kind: 'multiple-choice',
    prompt: 'GW-1 polices per-tenant token budgets. What attack does it primarily stop?',
    choices: [
      'Prompt injection',
      'Noisy-neighbor cost/latency blowout: one tenant’s runaway requests starving or bankrupting shared capacity',
      'Model theft',
      'Data exfiltration',
    ],
    answerIndex: 1,
    answer: 'Noisy-neighbor starvation and cost blowout',
    explanation:
      'A gateway without tenant budgets is one bad client away from a five-figure bill or p99 collapse. GW-1 enforces admission against live budget counters.',
    tags: ['multitenancy', 'budgets'],
  },
  {
    id: 'llm-gateway-q2',
    domainId: 'llm-gateway',
    kind: 'flashcard',
    prompt: 'Why does an LLM gateway need request hedging, not just retries?',
    answer: 'LLM tail latency is extreme — a retry after full timeout doubles the wait, while a hedged duplicate sent at p95 usually returns first, collapsing the tail',
    explanation:
      'Retries fix failures; hedging fixes slowness. For interactive serving the p99 dominates UX, so the gateway races a backup request instead of waiting out the straggler.',
    tags: ['tail-latency', 'hedging'],
  },
  {
    id: 'llm-gateway-q3',
    domainId: 'llm-gateway',
    kind: 'multiple-choice',
    prompt: 'Semantic caching (exact + near-duplicate prompt matching) saves the most when?',
    choices: [
      'Every prompt is unique',
      'Traffic has heavy head queries — repeated system prompts, retries, popular questions — where embedding-similarity hits avoid full inference',
      'Models are small',
      'Caching never helps LLM traffic',
    ],
    answerIndex: 1,
    answer: 'Heavy-head traffic with repeated or near-duplicate prompts',
    explanation:
      'Real gateway traffic is Zipfian: a small set of prompts dominates. Similarity-thresholded cache hits turn repeat inference into a lookup, with the threshold trading savings against staleness risk.',
    tags: ['caching', 'cost'],
  },

  // ─── Load balancer ────────────────────────────────────────────────────────
  {
    id: 'load-balancer-q1',
    domainId: 'load-balancer',
    invariantId: 'LB-1',
    kind: 'multiple-choice',
    prompt: 'LB-1 requires backend sets to match the healthy set. What misconfiguration does it catch?',
    choices: [
      'Too many backends',
      'Traffic routed to a backend marked unhealthy (failed checks) — usually a stale config push or a checker pointing at the wrong port',
      'Round-robin instead of least-connections',
      'IPv6 backends',
    ],
    answerIndex: 1,
    answer: 'Routing to backends marked unhealthy',
    explanation:
      'Health checks are useless if the data plane ignores them. LB-1 fires the moment the active set and the healthy set diverge — the signature of a stale or miswired control plane.',
    tags: ['health-checks', 'control-plane'],
  },
  {
    id: 'load-balancer-q2',
    domainId: 'load-balancer',
    invariantId: 'LB-2',
    kind: 'flashcard',
    prompt: 'Least-connections vs round-robin: when does the choice matter most?',
    answer: 'Heterogeneous backends or variable-cost requests — round-robin deals evenly regardless of load, least-connections routes to the emptiest, preventing pile-up on slow nodes',
    explanation:
      'With identical backends and uniform requests they behave alike. Skew in either dimension makes round-robin systematically overload the slowest node — LB-2 tracks the imbalance.',
    tags: ['algorithms', 'skew'],
  },
  {
    id: 'load-balancer-q3',
    domainId: 'load-balancer',
    invariantId: 'LB-3',
    kind: 'multiple-choice',
    prompt: 'Consistent-hashing the client IP for session affinity breaks down when?',
    choices: [
      'Never; it is perfect',
      'Clients sit behind a shared NAT/proxy (one IP, thousands of users) or backends churn — both skew the affinity mapping and hot-spot nodes',
      'Only on IPv6',
      'Only with TLS',
    ],
    answerIndex: 1,
    answer: 'Shared NAT IPs and backend churn skew affinity',
    explanation:
      'IP-hash affinity assumes IPs ≈ users and stable rings. Carrier-grade NAT collapses thousands of users onto one hash point; LB-3 fires on the resulting hot-spot. Cookie-based affinity survives NAT.',
    tags: ['affinity', 'hotspots'],
  },

  // ─── Search index ─────────────────────────────────────────────────────────
  {
    id: 'search-index-q1',
    domainId: 'search-index',
    invariantId: 'SEARCH-1',
    kind: 'multiple-choice',
    prompt: 'SEARCH-1 checks BM25 term saturation. Why must TF gains saturate instead of growing linearly?',
    choices: [
      'To save CPU',
      'A document repeating a term 100× is not 100× more relevant — linear TF lets spam dominate; saturation (k1) bounds the payoff',
      'Linear TF is faster to compute',
      'Saturation is optional',
    ],
    answerIndex: 1,
    answer: 'Linear TF lets keyword stuffing dominate rankings',
    explanation:
      'BM25’s (k1+1)·tf/(k1·(…)+tf) curve is the anti-spam core of modern text ranking. SEARCH-1 fires if scoring ever rewards repetition linearly.',
    tags: ['bm25', 'ranking'],
  },
  {
    id: 'search-index-q2',
    domainId: 'search-index',
    invariantId: 'SEARCH-2',
    kind: 'flashcard',
    prompt: 'IDF: what does it down-weight, and why is that correct?',
    answer: 'Terms appearing in many documents ("the", "click here") — they carry almost no discriminating information, so their contribution to the score must shrink logarithmically',
    explanation:
      'SEARCH-2 guards the IDF table: a term in every document has ~zero IDF. Forgetting IDF turns search into a popularity contest for stopwords.',
    tags: ['bm25', 'idf'],
  },
  {
    id: 'search-index-q3',
    domainId: 'search-index',
    invariantId: 'SEARCH-3',
    kind: 'multiple-choice',
    prompt: 'Document-length normalization (b parameter) exists because?',
    choices: [
      'Long documents use more disk',
      'Without it, long documents win by sheer term count; normalization pivots around average length so verbosity alone never ranks',
      'Short documents are always better',
      'It speeds up indexing',
    ],
    answerIndex: 1,
    answer: 'Verbosity alone must not rank',
    explanation:
      'The b·(|d|/avgdl) pivot is BM25’s length fairness mechanism. SEARCH-3 fires when length bias leaks through — typically a sign the pivot constant was zeroed.',
    tags: ['bm25', 'normalization'],
  },

  // ─── Task scheduler ───────────────────────────────────────────────────────
  {
    id: 'task-scheduler-q1',
    domainId: 'task-scheduler',
    invariantId: 'SCHED-1',
    kind: 'multiple-choice',
    prompt: 'SCHED-1 enforces DAG topological order. What breaks if a task runs before its dependency completes?',
    choices: [
      'Nothing; tasks are independent',
      'It reads inputs that do not exist yet — the classic "phantom success" where downstream completes on stale or missing data',
      'It runs slower',
      'The scheduler crashes immediately',
    ],
    answerIndex: 1,
    answer: 'Downstream consumes missing or stale inputs',
    explanation:
      'Topological order is the entire contract of a DAG scheduler. SCHED-1 fires on any edge violation — usually caused by retry logic re-queueing a task while its dependency was still re-running.',
    tags: ['dag', 'ordering'],
  },
  {
    id: 'task-scheduler-q2',
    domainId: 'task-scheduler',
    invariantId: 'SCHED-2',
    kind: 'flashcard',
    prompt: 'At-least-once vs exactly-once task execution: what does the scheduler owe each?',
    answer: 'At-least-once: retry until acked (duplicates possible, tasks must be idempotent). Exactly-once: dedupe by task ID so retries never double-apply — the scheduler owns the dedup window',
    explanation:
      'SCHED-2 checks dedup accounting. Most "exactly-once" systems are really at-least-once + idempotence; claiming more without a dedup store is how double-billing happens.',
    tags: ['semantics', 'idempotence'],
  },
  {
    id: 'task-scheduler-q3',
    domainId: 'task-scheduler',
    invariantId: 'SCHED-3',
    kind: 'multiple-choice',
    prompt: 'Cron "every minute" tasks drift over days (SCHED-3). What is the usual cause?',
    choices: [
      'Leap seconds',
      'Scheduling next run as now+60s after completion (interval chaining) instead of anchoring to wall-clock boundaries — execution time accumulates as drift',
      'Timezones',
      'Cron cannot run minutely',
    ],
    answerIndex: 1,
    answer: 'Interval chaining accumulates execution time as drift',
    explanation:
      'Anchor to the clock (next minute boundary), don’t chain intervals. SCHED-3 measures drift from the wall-clock grid — chaining a 61s task on a 60s cadence drifts a minute per hour.',
    tags: ['cron', 'drift'],
  },

  // ─── Chat presence ────────────────────────────────────────────────────────
  {
    id: 'chat-presence-q1',
    domainId: 'chat-presence',
    invariantId: 'CHAT-1',
    kind: 'multiple-choice',
    prompt: 'CHAT-1 requires causal message ordering per room. Why do wall-clock timestamps fail here?',
    choices: [
      'Clocks are too precise',
      'Skewed client clocks reorder messages across writers — causal order needs sequence numbers or vector clocks, not arrival/creation time',
      'Timestamps are too large',
      'They work fine',
    ],
    answerIndex: 1,
    answer: 'Clock skew across writers reorders causally-related messages',
    explanation:
      'Two phones with 2s of skew produce interleavings that never happened. CHAT-1 enforces per-room sequence assignment at the server — the only order all clients can agree on.',
    tags: ['ordering', 'clocks'],
  },
  {
    id: 'chat-presence-q2',
    domainId: 'chat-presence',
    invariantId: 'CHAT-2',
    kind: 'flashcard',
    prompt: 'Presence "online" indicator: why is it fundamentally approximate?',
    answer: 'It is derived from heartbeats over an unreliable network — a dead client looks alive until the timeout, and a live client on a lossy link flaps; there is no instant failure detector',
    explanation:
      'CHAT-2 bounds the staleness window rather than promising accuracy. Every design choice (heartbeat interval, timeout multiplier, last-seen display) trades freshness against flap.',
    tags: ['presence', 'failure-detection'],
  },
  {
    id: 'chat-presence-q3',
    domainId: 'chat-presence',
    invariantId: 'CHAT-3',
    kind: 'multiple-choice',
    prompt: 'Fan-out to 10k room members on every message (CHAT-3). What is the scaling fix?',
    choices: [
      'Faster JSON',
      'Tiered fan-out: write once to per-shard inboxes (or edge pub/sub) instead of 10k individual writes per message',
      'Bigger servers',
      'Polling',
    ],
    answerIndex: 1,
    answer: 'Tiered fan-out through shard inboxes / edge pub-sub',
    explanation:
      'Naive fan-out is O(members) writes per message — the celebrity-tweet problem. CHAT-3 watches per-message write amplification; inbox sharding makes it O(shards).',
    tags: ['fanout', 'scaling'],
  },

  // ─── Feature store ────────────────────────────────────────────────────────
  {
    id: 'feature-store-q1',
    domainId: 'feature-store',
    invariantId: 'FS-1',
    kind: 'multiple-choice',
    prompt: 'FS-1 enforces point-in-time correctness. What is training-serving skew?',
    choices: [
      'Slow networks',
      'Training on features computed with knowledge from after the label timestamp — the model learns from the future and collapses in production',
      'Old GPUs',
      'Too many features',
    ],
    answerIndex: 1,
    answer: 'Training on future knowledge that production will never have',
    explanation:
      'Point-in-time joins reconstruct feature values as of the event time, never later. FS-1 fires on any as-of join that leaks post-label data — the single most common silent killer of ML models.',
    tags: ['pit-joins', 'correctness'],
  },
  {
    id: 'feature-store-q2',
    domainId: 'feature-store',
    invariantId: 'FS-2',
    kind: 'flashcard',
    prompt: 'Online vs offline store: what fundamentally differs?',
    answer: 'Latency and freshness contract — online serves single-row low-ms lookups for live inference; offline serves bulk point-in-time-correct scans for training',
    explanation:
      'Same logical features, two physical systems. FS-2 checks the sync invariant: online values must converge to what offline would have served for the same timestamp.',
    tags: ['architecture', 'sync'],
  },
  {
    id: 'feature-store-q3',
    domainId: 'feature-store',
    invariantId: 'FS-3',
    kind: 'multiple-choice',
    prompt: 'A feature pipeline backfills 6 months of history. What must hold for the backfill to be valid (FS-3)?',
    choices: [
      'It must run fast',
      'Deterministic recomputation: the same raw events and code version must reproduce identical values — otherwise training data is irreproducible',
      'It must use Spark',
      'Backfills are always valid',
    ],
    answerIndex: 1,
    answer: 'Deterministic recomputation pinned to code + data versions',
    explanation:
      'A backfill that silently uses new code on old events (or vice versa) trains on data production will never see. FS-3 requires version-pinned, replayable pipelines.',
    tags: ['backfill', 'reproducibility'],
  },

  // ─── Model rollout ────────────────────────────────────────────────────────
  {
    id: 'model-rollout-q1',
    domainId: 'model-rollout',
    invariantId: 'ROLL-1',
    kind: 'multiple-choice',
    prompt: 'ROLL-1 gates canary promotion on guardrail metrics. Why is error-rate alone insufficient?',
    choices: [
      'Error rate is hard to measure',
      'A canary can hold error rate flat while shifting the error distribution (new failure modes on previously-fine slices) — promotion needs slice-aware guardrails',
      'Canaries never fail',
      'Metrics are useless',
    ],
    answerIndex: 1,
    answer: 'Flat aggregate errors can hide new slice-specific failures',
    explanation:
      'Simpson’s paradox in production: overall rate steady, one cohort burning. ROLL-1 requires per-slice guardrails (latency, refusal rate, eval scores) before promotion.',
    tags: ['canary', 'guardrails'],
  },
  {
    id: 'model-rollout-q2',
    domainId: 'model-rollout',
    invariantId: 'ROLL-2',
    kind: 'flashcard',
    prompt: 'Blue-green vs canary: what reversibility property differs?',
    answer: 'Blue-green flips 100% at once with instant rollback to the intact old fleet; canary ramps gradually with automatic halt — blue-green risks blast radius, canary risks slow detection',
    explanation:
      'ROLL-2 checks rollback readiness: blue-green must keep the old fleet warm; canary must have halt thresholds that actually trigger. Pick your poison deliberately.',
    tags: ['deployment', 'rollback'],
  },
  {
    id: 'model-rollout-q3',
    domainId: 'model-rollout',
    invariantId: 'ROLL-3',
    kind: 'multiple-choice',
    prompt: 'Shadow deployment serves production traffic to the new model without returning its outputs. What does it validate (ROLL-3)?',
    choices: [
      'UI layout',
      'Behavioral parity and resource footprint under real load — divergence logging without user impact',
      'Marketing copy',
      'DNS config',
    ],
    answerIndex: 1,
    answer: 'Parity and footprint under real load, zero user impact',
    explanation:
      'Shadow mode is the safest pre-promotion signal: same inputs, discarded outputs, full divergence telemetry. ROLL-3 fires when shadow and live disagree beyond tolerance.',
    tags: ['shadow', 'validation'],
  },

  // ─── LLM eval ─────────────────────────────────────────────────────────────
  {
    id: 'llm-eval-q1',
    domainId: 'llm-eval',
    invariantId: 'EVAL-1',
    kind: 'multiple-choice',
    prompt: 'EVAL-1 requires eval-set isolation from training data. What happens on contamination?',
    choices: [
      'Scores drop slightly',
      'Memorization masquerades as capability — benchmark scores inflate while real generalization is unchanged, invalidating every gate decision',
      'Training gets slower',
      'Nothing measurable',
    ],
    answerIndex: 1,
    answer: 'Memorization inflates scores, invalidating gates',
    explanation:
      'Contaminated evals are worse than no evals: they certify broken models. EVAL-1 enforces hash-verified isolation between train and eval corpora, including near-duplicates.',
    tags: ['contamination', 'validity'],
  },
  {
    id: 'llm-eval-q2',
    domainId: 'llm-eval',
    invariantId: 'EVAL-2',
    kind: 'flashcard',
    prompt: 'LLM-as-judge: what is the single biggest validity threat?',
    answer: 'Self-preference and style bias — judges favor their own model family’s outputs and verbose, confident-sounding answers regardless of correctness',
    explanation:
      'EVAL-2 requires blinded, calibrated judging with human spot-checks. An uncalibrated judge mostly measures "sounds like me", not quality.',
    tags: ['judging', 'bias'],
  },
  {
    id: 'llm-eval-q3',
    domainId: 'llm-eval',
    invariantId: 'EVAL-3',
    kind: 'multiple-choice',
    prompt: 'A guardrail blocks 99% of attacks in testing but fails open on timeouts in production (EVAL-3). What is the flaw?',
    choices: [
      'The test set was too easy',
      'Fail-open design: any latency/error path bypasses the guardrail — security controls must fail closed, with timeouts treated as blocks or explicit degradations',
      '99% is too low',
      'Guardrails cannot have timeouts',
    ],
    answerIndex: 1,
    answer: 'Fail-open on the error path bypasses the control',
    explanation:
      'Attackers find the timeout first. EVAL-3 chaos-tests the guardrail’s own failure modes: timeouts, upstream 500s, and schema drift must all resolve to deny-or-degrade, never allow.',
    tags: ['guardrails', 'fail-closed'],
  },

  // ─── Consistent hashing ───────────────────────────────────────────────────
  {
    id: 'consistent-hashing-q1',
    domainId: 'consistent-hashing',
    invariantId: 'CHASH-1',
    kind: 'multiple-choice',
    prompt: 'CHASH-1 bounds key movement on node join. What is the expected fraction that moves?',
    choices: ['All keys', 'Roughly 1/N of keys — only ranges newly owned by the joiner', 'Half of all keys', 'No keys ever move'],
    answerIndex: 1,
    answer: 'Roughly 1/N — only newly-owned ranges transfer',
    explanation:
      'Minimal disruption is the entire point of consistent hashing versus mod-N hashing (which moves nearly everything). CHASH-1 fires if a join migrates beyond the bound.',
    tags: ['membership', 'bounds'],
  },
  {
    id: 'consistent-hashing-q2',
    domainId: 'consistent-hashing',
    invariantId: 'CHASH-2',
    kind: 'flashcard',
    prompt: 'Virtual nodes (vnodes): what problem do they solve?',
    answer: 'Load imbalance from random ring placement — many virtual replicas per physical node smooth the range distribution and make heterogeneous capacity expressible as vnode counts',
    explanation:
      'Without vnodes, random placement gives some nodes 2× the keys. CHASH-2 checks the imbalance ratio; adding vnodes drives it toward uniform.',
    tags: ['vnodes', 'balance'],
  },
  {
    id: 'consistent-hashing-q3',
    domainId: 'consistent-hashing',
    invariantId: 'CHASH-3',
    kind: 'multiple-choice',
    prompt: 'Ring vs JumpHash vs Rendezvous: when is Rendezvous (highest-random-weight) the right pick?',
    choices: [
      'Always — it is strictly best',
      'Small clusters needing minimal disruption with built-in load awareness (weights), where O(N) lookup cost per key is affordable',
      'Never — it is obsolete',
      'Only for geo-replication',
    ],
    answerIndex: 1,
    answer: 'Small clusters where O(N) lookup is affordable and weights matter',
    explanation:
      'Rendezvous computes a score per node (O(N)) but handles weighted capacity and removals elegantly. JumpHash is O(log N) but uniform-only. Ring is the general default — CHASH-3 compares their disruption profiles.',
    tags: ['algorithms', 'tradeoffs'],
  },

  // ─── Probabilistic structures ─────────────────────────────────────────────
  {
    id: 'probabilistic-structures-q1',
    domainId: 'probabilistic-structures',
    invariantId: 'PROB-1',
    kind: 'multiple-choice',
    prompt: 'PROB-1 asserts the Bloom filter has no false negatives. Why is this structurally guaranteed?',
    choices: [
      'Because hash functions never collide',
      'Insertion sets all k bits; a query returns negative only if some bit is unset — and set bits are never cleared, so a present item can never test negative',
      'Because the filter is large',
      'It is not guaranteed',
    ],
    answerIndex: 1,
    answer: 'Bits are only ever set, never cleared',
    explanation:
      'One-sided error is the Bloom filter’s contract: negatives are certain, positives are probable. Deletion breaks it — which is exactly why counting Bloom filters exist.',
    tags: ['bloom', 'guarantees'],
  },
  {
    id: 'probabilistic-structures-q2',
    domainId: 'probabilistic-structures',
    invariantId: 'PROB-2',
    kind: 'flashcard',
    prompt: 'Bloom filter sizing: what three quantities determine the false-positive rate?',
    answer: 'Bits per element (m/n), number of hash functions (k), and occupancy — optimal k ≈ (m/n)·ln2, and the rate degrades as the filter fills past design capacity',
    explanation:
      'PROB-2 checks the measured FPR against theory. The classic operational mistake is letting n grow past design: the filter silently degrades from 1% to 50% FPR.',
    tags: ['sizing', 'fpr'],
  },
  {
    id: 'probabilistic-structures-q3',
    domainId: 'probabilistic-structures',
    invariantId: 'PROB-3',
    kind: 'multiple-choice',
    prompt: 'HyperLogLog estimates 10M distinct users in ~12KB (PROB-3). What information is fundamentally discarded?',
    choices: [
      'Nothing; it is exact',
      'Identity — it keeps only the maximum leading-zero run per register, so it answers "how many" but never "which"',
      'The count itself',
      'Timestamps only',
    ],
    answerIndex: 1,
    answer: 'Identity — cardinality without membership',
    explanation:
      'HLL is a distinct-count sketch, not a set. That information loss is the price of the memory savings — and also why HLLs are privacy-friendlier than raw logs for cardinality analytics.',
    tags: ['hll', 'sketches'],
  },

  // ─── Merkle trees ─────────────────────────────────────────────────────────
  {
    id: 'merkle-trees-q1',
    domainId: 'merkle-trees',
    invariantId: 'MERKLE-1',
    kind: 'multiple-choice',
    prompt: 'MERKLE-1 requires root equality iff leaf sets are equal. What does a root mismatch prove?',
    choices: [
      'Which leaf differs',
      'That at least one leaf differs — nothing more; locating it requires descending the proof path',
      'The trees are corrupt',
      'Nothing; roots collide often',
    ],
    answerIndex: 1,
    answer: 'At least one leaf differs — location needs proof descent',
    explanation:
      'The root is a commitment, not a diagnostic. Anti-entropy (Dynamo-style replica sync) walks differing subtrees to find the minimal divergent set — that walk is the whole protocol.',
    tags: ['commitments', 'sync'],
  },
  {
    id: 'merkle-trees-q2',
    domainId: 'merkle-trees',
    invariantId: 'MERKLE-2',
    kind: 'flashcard',
    prompt: 'Merkle inclusion proof: what does the verifier recompute, and in what size?',
    answer: 'The root, from the leaf plus O(log n) sibling hashes — verifying membership without the full dataset',
    explanation:
      'MERKLE-2 checks proof validity. Log-sized proofs are why blockchains and CT logs can prove inclusion to light clients.',
    tags: ['proofs', 'verification'],
  },
  {
    id: 'merkle-trees-q3',
    domainId: 'merkle-trees',
    invariantId: 'MERKLE-3',
    kind: 'multiple-choice',
    prompt: 'Second-preimage resistance matters for Merkle trees because?',
    choices: [
      'It makes hashing faster',
      'If an attacker can craft a different leaf set with the same root, every sync/verification decision based on root comparison is forgeable',
      'It reduces tree height',
      'It is irrelevant with SHA-256',
    ],
    answerIndex: 1,
    answer: 'Root forgery breaks every comparison-based decision',
    explanation:
      'The security reduction runs root → leaves. A second preimage lets an attacker present divergent data as synchronized — MERKLE-3 guards the hash discipline (domain separation, no length-extension-prone constructions).',
    tags: ['security', 'hashing'],
  },
];

export function quizForDomain(domainId: string): QuizQuestion[] {
  return QUIZ_BANK.filter((q) => q.domainId === domainId);
}

export function quizById(id: string): QuizQuestion | undefined {
  return QUIZ_BANK.find((q) => q.id === id);
}
