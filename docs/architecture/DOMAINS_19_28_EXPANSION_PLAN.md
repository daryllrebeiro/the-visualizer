# TheVisualizer — Domains 19–28 Expansion Plan: System Design, AI Infra & Classic DSA (v2)

**Document Version:** 2.0.0 (improved from draft v1)
**Target Architectural Milestone:** TheVisualizer v3.0 — 28-domain platform
**Domains Covered (19–28):**

- System Design (4): `19: Load Balancer`, `20: Distributed Search & Inverted Index`, `21: Distributed Task Scheduler & Cron`, `22: Real-Time Chat & Presence`
- AI Infra (3): `23: ML Feature Store`, `24: Model Deployment & Canary Rollout`, `25: LLM Evaluation & Guardrails Pipeline`
- Classic DSA (3): `26: Consistent Hashing Deep-Dive`, `27: Bloom Filters & Probabilistic Structures`, `28: Merkle Trees & Distributed Verification`

---

## 0. Delta vs. draft v1 (what this revision fixes)

| # | Draft defect | Correction |
|---|---|---|
| 1 | `CHASH-3` claimed Jump Hash keeps bucket assignments stable "when unrelated buckets are removed" | Jump hash is **growth-only** (Lamping & Veach): it has no native removal. Correct property: growing `n → n+1` moves *only* keys whose new target is bucket `n`. Removal is modeled explicitly as shrink+remap (which is itself the teaching point vs. ring hashing). |
| 2 | `CHASH-4` claimed Rendezvous produces "the same key→node mapping as ring-based hashing" | False — the two algorithms produce different mappings; they share only the minimal-disruption property. Replaced with HRW's actual invariants: per-key determinism from node identity alone, and disruption minimality on node removal. |
| 3 | `PROB-3` treated `1.04/√m` as a hard per-estimate bound | It is the **standard error**, a distributional property. A single estimate outside 1 SE happens ~32% of the time. Fixed with a z=4 margin plus multi-seed empirical-SE convergence check. |
| 4 | Missing foundational citations | Added: Karger et al. (STOC '97) for the ring; Thaler & Ravishankar (1996) for HRW; Fan et al. (2000) counting Bloom; Fan et al. (CoNEXT '14) cuckoo filter; Cormode & Muthukrishnan (2005) CMS; Merkle (1979/1987); Robertson & Zaragoza (2009) practical BM25. |
| 5 | Referenced nonexistent artifacts (`CanvasShell`, `GlossaryTooltip.tsx`) | Grounded in real files: `DomainCanvasAdapter.tsx`, `apps/web/src/components/domains/design-system/`, `CommandPaletteModal.tsx` (glossary section), `DomainDirectoryModal.tsx` + `domain-options.ts`. |
| 6 | 10 domains as one undifferentiated batch | Split into 3 gated sub-batches with explicit build order (algorithms first, so compositions in Phase Q.5 consume real implementations) and a per-domain Definition of Done. |
| 7 | Statistical invariants left as "statistically justified tolerance" | Concretized: seeded RNG makes distributions reproducible → assert **exact counts** in golden fixtures; chi-square GOF (α=0.01) for behavioral tests; two-proportion z-test (α=0.05, min-N per arm) for `ROLL-4`. |
| 8 | No float-determinism rule for golden hashes | New hard rule: floats entering hashed state are quantized (see §4) — BM25/HLL scores must not break golden hashes across Node versions (`Math.log` is implementation-approximated per ES spec). |
| 9 | Composition planned but no contracts | Contracts-first: each consumer domain ships a typed seam for its Phase Q.5 dependency in its *standalone* PR, so Q.5 wiring is an implementation swap, not a redesign. |
| 10 | Missing platform-integration steps | Added: `verify-all-18-domains.mjs` has a hardcoded 18-domain list (must become 28-aware), Playwright e2e per route, lighthouse script route lists, `packages/contracts` Zod schemas, RBAC/topology registration, README/`package.json`/`VISUALIZERS_DETAILS.md`/`features_and_functionalities.md` updates, new `ALGORITHMS` category in `registry.ts`. |
| 11 | Overlap with existing domains unanalyzed | `/rag` already implements BM25; `/database` already has a token ring; `/storage` already has a Bloom FP-rate formula. §2 defines shared-core extraction rules so the new deep-dives don't fork logic. |
| 12 | No resource caps specified | §5 gives per-domain numeric caps, day one, not retrofitted. |

---

## 1. Batch composition, build order, sub-batch gates

4/3/3 split retained. Build order within the batch is now explicit and dependency-driven:

```
Sub-batch A (algorithms, first):   26 consistent-hashing → 27 probabilistic-structures → 28 merkle-trees
Sub-batch B (system design):       19 load-balancer → 20 search-index → 21 task-scheduler → 22 chat-presence
Sub-batch C (AI infra):            23 feature-store → 25 llm-eval* → 24 model-rollout
```

Rationale:

1. **Algorithms first.** LB's sticky sessions compose with 26; `/search-index`'s Bloom/term-dict instincts compose with 27; `/merkle-trees` composes with `/database`. Building the algorithm domains first means Q.5 compositions consume real, tested implementations instead of being designed against imagined APIs.
2. **`/llm-eval` before `/model-rollout`** (order within C): `EVAL-4`'s deployment gate needs a concrete eval-result shape to define model-rollout's gate input against, even though model-rollout's standalone gate logic ships first (contract-first, §6).
3. **Gate between each sub-batch:** full `pnpm typecheck && pnpm test:all && pnpm verify:all` green + mutation round for every domain in the sub-batch recorded before the next sub-batch scaffolds. Batches of 3–4 domains match the proven cadence (8 → 5+5 → now 3+4+3, never 10-at-once).

### Overlap analysis (reuse, don't fork)

| Existing implementation | Overlapping new domain | Rule |
|---|---|---|
| `/rag` BM25 sparse scoring | 20 BM25 arithmetic | Extract `bm25-score.ts` as a shared module under `packages/simulation/src/domains/search-index/` (exported, unit-tested) and migrate `/rag` to import it during Q.2 of sub-batch B — a same-phase refactor with `/rag` golden hashes asserted unchanged, *not* a Phase Q.5 composition. |
| `/database` vnode token ring | 26 ring implementation | Domain 26 owns the canonical ring; `/database` keeps its embedded ring untouched (its golden hashes must not move). Cross-reference in docs; actual sharing of code happens only if Q.5 shows a clean seam. |
| `/storage` Bloom FP formula | 27 Bloom math | Domain 27 owns `bloom-math.ts` (optimal-k, FP-rate formula). `/storage` keeps its inline constants; add a parity test asserting both compute identical FP rates for identical (m,k) — catches silent divergence. |
| `/llm-gateway` GW-1 breaker FSM | 24 rollback FSM | Standalone first: 24 ships its own canary-health FSM (health → OPEN → snap-back). Q.5 swaps it to reuse the GW-1 state machine. |

---

## 2. Domain specifications (19–28)

Each spec: references, state model, invariants in **testable form** (exact assertion where determinism permits), canvas, chaos, mode matrix, caps.

---

### Domain 19: Load Balancer (`/load-balancer`)

**References**
- HAProxy configuration manual — `balance` directive algorithms (roundrobin, leastconn, source/consistent-hash, weight).
- nginx `ngx_http_upstream_module` docs (weighted round-robin, `max_fails`/`fail_timeout` passive checks, `drain` state in nginx Plus).
- Karger et al. (1997): Consistent Hashing and Random Trees (STOC '97) — sticky-session ring.
- AWS ALB docs — L7 target groups, health checks, deregistration delay.
- Optional stretch mode: Mitzenmacher (2001), The Power of Two Choices in Randomized Load Balancing.

**State model**
`backends` (id, weight, health: HEALTHY|UNHEALTHY|DRAINING, consecutiveFailures, inFlightCount, responseTimeEwma), `routingPolicy` (`'ROUND_ROBIN'|'WEIGHTED_RR'|'LEAST_CONNECTIONS'|'LEAST_RESPONSE_TIME'|'CONSISTENT_HASH'`, config), `healthChecker` (interval, failureThreshold, successThreshold), `connections` (in-flight, assignedBackend, startTick), `draining` (per-backend drain start tick, timeout).

**Invariants (mode-aware — each asserted per active algorithm, never a shared floor)**

- `LB-1` Health-Gated Routing: for every dispatch event, `assignedBackend.health === HEALTHY`. Test: construct pool with one UNHEALTHY and one DRAINING backend; 1,000 seeded requests; assert neither ever selected; assert selection universe is exactly the healthy set.
- `LB-2` Weighted Distribution Accuracy: over a stable-weight window of N=10,000 seeded requests with weights `w_i`, per-backend count `c_i` satisfies `|c_i − N·w_i/W| ≤ 4·sqrt(N·p_i·(1−p_i)) + 1` (p_i = w_i/W) **and** chi-square GOF across backends has p > 0.01. Golden fixture pins **exact counts** for a fixed seed. Live weight changes reset the window (assertion applies to post-change window only — partial windows are exempt, documented).
- `LB-3` Sticky Session Consistency: under `CONSISTENT_HASH`, for fixed key set K, same session key → same backend while backend healthy. Test: 5,000 requests over seeded key stream; assert zero reassignments absent health changes; on backend failure, reassign only keys previously mapped to the failed backend (ties to `CHASH-1`).
- `LB-4` Graceful Drain: while `DRAINING`: new-connection delta = 0 (exact, every tick); existing connections complete; backend not removed until `inFlightCount === 0` or `drainTimeout` expires, then force-closed with count. Test: rolling deploy scenario asserts zero downtime (requests either routed to healthy or queued pre-drain, never dropped, never to draining backend).

**Mode-aware test matrix (mandatory, NET-3 lesson):** each of the 5 routing modes gets its own exact-behavior test — RR asserts strict round-robin order; WRR asserts interleaving ratio per nginx smooth-weighted algorithm; LC asserts argmin(connections) with deterministic tie-break; LRT asserts argmin(ewma); CH asserts LB-3. One shared "some backend got picked" test is prohibited.

**Canvas:** backend pool cards with health/weight/EWMA/in-flight badges; per-request routing animation with algorithm reasoning line ("least connections: b2=3 < b4=7 → b2"); heartbeat pulse ticks; draining backend visually distinct with in-flight countdown. **Chaos:** kill backend mid-traffic (health-check failover), live weight adjustment, rolling deploy (sequential drain+replace), live algorithm switch on identical replayed traffic.

**Caps:** ≤8 backends, ≤500 concurrent connections, ≤10k requests per distribution window, health-check history ring ≤200.

---

### Domain 20: Distributed Search & Inverted Index (`/search-index`)

**References**
- Robertson & Zaragoza (2009): The Probabilistic Relevance Framework: BM25 and Beyond — canonical practical BM25.
- Sparck Jones (1972): IDF foundation.
- Lucene `BM25Similarity` (practical scoring implementation) and Elasticsearch similarity module docs.
- Elasticsearch docs: shard/replica architecture, scatter-gather `query_then_fetch`.

**State model**
`documents` (id, rawText, tokens, lengthNorm), `invertedIndex` (term → posting list: docId, tf, positions), `shards` (primary + replicas, assigned docIds), `analyzerConfig` (tokenizer: standard/simple/keyword; stopwords), `bm25Params` (k1 default 1.2, b default 0.75), `queries` (terms, per-shard top-k, merged ranked results with score breakdown).

**Invariants**

- `SEARCH-1` Posting List Completeness: bidirectional exact equality — `doc contains term ⟺ docId ∈ postings(term)`. Test: ingest corpus; property-check over all (doc, term) pairs; then delete a document and re-assert (deletion removes docId from every posting list containing it, positions reclaimed).
- `SEARCH-2` BM25 Monotonicity: for fixed query, fixed doc length, fixed corpus stats: score strictly increases with tf for two distinct tf values (catches tf-ignored and tf-capped bugs both: assert non-decreasing AND at least one strict increase below the k1 asymptote). Also assert full-formula parity: score equals the reference implementation computed from k1/b/df/avgdl with all quantities taken from state (quantized per §4).
- `SEARCH-3` Shard Coverage: query result reflects scatter across all shards (including replica-promoted primaries after failover). Test: kill a primary; re-query; assert result set identical (from replicas) and gather log shows every shard participated; construct a dropped-shard bug state → invariant fires.
- `SEARCH-4` Replica Consistency: after indexing event at tick t, replicas of that shard reflect the document by tick `t + propagationBound` (default: ≤3 ticks). Test: assert bounded convergence; assert reads before bound may serve stale (documented, allowed) but never *missing-after-bound*.

**Canvas:** live inverted-index table (term → posting list with tf) as documents ingest; BM25 score breakdown panel per result (per-term TF-saturation term + IDF + length-normalization contributions, actual arithmetic — flagship); scatter-gather fan-out animation with per-shard top-k then merge. **Chaos:** ingest burst + shard rebalance; kill primary → replica promotion; live k1/b sliders re-scoring a fixed query; delete document → posting cleanup (SEARCH-1).

**Mode-aware matrix:** analyzer modes (standard/keyword/stopwords) each assert exact tokenization; k1/b variants assert ranking direction (higher b → length normalization stronger, ordering of a long-vs-short doc pair flips on constructed example).

**Caps:** ≤500 documents, ≤256 tokens/doc, ≤32 shards+replicas, posting list ≤ 64/term displayed (full list stored), query top-k ≤ 20.

---

### Domain 21: Distributed Task Scheduler & Cron (`/task-scheduler`)

**References**
- Apache Airflow scheduler docs (DAG scheduling, max_active_runs, retry policy) and Chronos-style fault-tolerant cron.
- Vixie cron expression semantics (5-field parsing, `*`/step/range).
- Brooker (2015, AWS Architecture Blog): Exponential Backoff and Jitter — the canonical jitter citation (`full jitter` vs `equal jitter` vs `no jitter`).
- Borg, Omega, and Kubernetes (ACM Queue '16) — scheduler architecture context.
- Kleppmann, DDIA ch. 8 — idempotency/exactly-once framing.

**State model**
`jobs` (cron expr or DAG node, idempotency key = jobId+scheduledFireTick, retry policy: base, multiplier, maxAttempts, jitter mode), `schedulerLeader` (holder, leaseExpireTick — semantics mirroring `/distributed-lock`'s lease), `dispatchLog` (Map idempotencyKey → dispatch record, dedup window), `dagRuns` (per-task status: PENDING|RUNNING|SUCCESS|FAILED|RETRYING|SKIPPED_UPSTREAM_FAILED, attempt count, nextRetryTick).

**Invariants**

- `SCHED-1` Single Active Scheduler: at any tick, ≤1 scheduler holds unexpired lease. Test: split-brain scenario — two schedulers both attempt dispatch in the same tick window; second is rejected with lease error; dispatch count unchanged. (Standalone lease logic here; Q.5 swaps in `/distributed-lock`.)
- `SCHED-2` Exactly-Once Dispatch: dispatchLog keyed by idempotency key; duplicate dispatch attempt (constructed by leader failover replaying the fire window) → rejected, exactly one record. Test: fire → kill leader → new leader re-scans window → dedup hit, assert dispatched count still 1.
- `SCHED-3` DAG Ordering: task start requires all upstream SUCCESS. Test: inject mid-DAG failure; assert downstream all transition to SKIPPED_UPSTREAM_FAILED, none ever RUNNING; partial success (upstream still RUNNING) does not unblock.
- `SCHED-4` Bounded Retry with Backoff: attempt n+1 delay = `min(cap, base·2^n)` ± jitter per mode; attempts ≤ maxAttempts; terminal FAILED after. Test: assert actual recorded intervals match the mode's formula exactly (full jitter: uniform in [0, backoff]; equal jitter: backoff/2 + uniform[0, backoff/2]; no jitter: exact); assert interval sequence non-decreasing under no-jitter and stochastically bounded under jitter (exact values pinned in golden fixture).

**Canvas:** DAG graph with per-task status + dependency edges; leadership badge with lease countdown; retry timeline showing intervals growing with jitter scatter. **Chaos:** kill scheduler mid-dispatch; inject task failure mid-DAG; simultaneous cron trigger burst (assert dispatch ordering by fire tick, dedup window shown).

**Mode-aware matrix:** jitter modes (none/equal/full) each assert their exact delay formula — the NET-3-style exactness requirement.

**Caps:** ≤100 jobs, DAG nodes ≤ 20/run, dag depth ≤ 8, dispatchLog ≤ 5,000 entries (LRU beyond), retries ≤ 5.

---

### Domain 22: Real-Time Chat & Presence (`/chat-presence`)

**References**
- RFC 6455 (WebSocket) — connection lifecycle, close codes.
- Kleppmann, DDIA ch. 8 — delivery semantics (at-least-once + idempotent consumer = effectively-once).
- Fanout-on-write vs fanout-on-read: standard messaging architecture literature (Slack/WhatsApp engineering write-ups as secondary references).

**State model**
`users` (presence: ONLINE|AWAY|OFFLINE, lastHeartbeatTick, typingUntil), `conversations` (members, fanout strategy, per-conversation sequence counter), `messages` (seq, sender, per-recipient delivery status: SENT|DELIVERED|READ), `recvBuffers` (per-recipient out-of-order hold queue), `offlineQueue` (per-user queued messages), `typing` (TTL-based).

**Invariants**

- `CHAT-1` Message Ordering: delivered sequence per recipient strictly increasing; out-of-order arrival held in recvBuffer and released in seq order. Test: inject reordered delivery for a 50-message seeded stream; assert final delivered order is exactly 1..50 for every recipient; assert buffer drains to empty.
- `CHAT-2` Presence Staleness Bound: ONLINE→AWAY within 2×heartbeatInterval + 1 tick of last heartbeat; AWAY→OFFLINE within offlineTtl (default 60 ticks). Test: stop heartbeats at tick t; assert no tick > bound with stale ONLINE; assert transition exists (not merely "eventually").
- `CHAT-3` Fanout Completeness: every member has terminal disposition = DELIVERED or QUEUED (offline). Test: group of N=16, 3 offline; send; assert delivered=13, queued=3, none dropped; construct dropped-recipient bug state → invariant fires.
- `CHAT-4` At-Least-Once with Dedup: simulated redelivery (reconnect before ack) — client dedup via (conversationId, seq). Test: duplicate delivery of 5 messages; assert display count unchanged; assert dedup hit count = 5.

**Canvas:** conversation view with per-recipient status ticks; presence grid across simulated users; fanout animation to N member connections (parallel, not serial — visual point); typing bubbles with TTL countdown. **Chaos:** disconnect user mid-conversation (presence transition + offline queue); force out-of-order delivery; force redelivery; per-user send throttling (Q.5: `/rate-limiter` reuse; standalone: local token-bucket placeholder behind same interface).

**Caps:** ≤32 users, ≤8 conversations, message ring buffer ≤ 200/conversation (older compacted to counts), recvBuffer ≤ 50, typing TTL ≤ 10 ticks.

---

### Domain 23: ML Feature Store (`/feature-store`)

**References**
- Feast docs — point-in-time joins, feature freshness, offline/online store architecture.
- Uber Michelangelo (engineering write-up) — training/serving skew origin story.
- Tecton docs — feature freshness/staleness semantics (secondary).

**State model**
`featureDefinitions` (name, version, computation logic, TTL, materializedIn: trainingSetIds[]), `offlineStore` (entity, feature, value, eventTime per version), `onlineStore` (entity → latest value + writeTick), `syncWatermark` (per feature: last offline→online sync tick), `trainingSets` (label entity, labelTimestamp, joined rows with source feature versions), `servingRequests` (lookups + freshness evaluation).

**Invariants**

- `FS-1` Point-in-Time Correctness: joined row for entity e at label timestamp T uses, per feature, the latest offline value with `eventTime ≤ T`. Test: construct timeline where feature changes at T−10, T−5, T+3, T+8; join at T; assert value is the T−5 one; construct leaky-join bug state (value from T+3) → invariant fires.
- `FS-2` Online/Offline Consistency: at sync watermark W, online value == offline latest value with eventTime ≤ W, for every feature. Test: assert exact match at watermark; inject sync lag; assert divergence flagged (not silently served) once past `FS-3` TTL.
- `FS-3` Freshness Bound: online lookup where `now − writeTick > TTL` returns `stale: true` flag, never silently current. Test: advance ticks past TTL; assert flag on every subsequent lookup; assert TTL-boundary tick exactness (TTL → fresh, TTL+1 → stale).
- `FS-4` Feature Definition Immutability: materialized training set pins `definitionVersion`; later definition edits create `version+1`; existing training sets still resolve to old version; recomputation of historical data under old sets uses old logic. Test: materialize set; edit definition; re-validate set → rows unchanged, version ref unchanged; assert new version exists and only new joins use it.

**Canvas:** per-entity feature timeline with draggable "as-of" marker (live point-in-time join readout — flagship); online/offline side-by-side with sync-lag highlight; row-by-row training-set construction animation. **Chaos:** leaky as-of timestamp; sync-lag injection; stale-feature serve.

**Caps:** ≤50 entities, ≤10 features, ≤100 versions/feature, offline rows ≤ 5,000, training sets ≤ 20.

---

### Domain 24: Model Deployment & Canary Rollout (`/model-rollout`)

**References**
- Argo Rollouts / Flagger docs — canary steps, analysis templates, automated rollback.
- Kohavi, Tang, Xu (2020): Trustworthy Online Controlled Experiments — statistical gating method.
- Model registry semantics: MLflow Model Registry docs (stage transitions, versioning).
- Shadow/dark-launch traffic mirroring — standard progressive-delivery literature.

**State model**
`modelRegistry` (versioned models, stage: NONE|SHADOW|CANARY|STABLE|ARCHIVED), `deployment` (traffic split by version), `shadowTraffic` (mirrored requests scored, discarded), `metrics` (per-version: request count, error count, latency p50/p95 ring, business-metric conversions), `rolloutPolicy` (canary schedule, error-rate threshold, significance config: α, minN), `gateInputs` (**contract-first seam**: `evalGate: { sourceRunId, policyVersion, criticalPassed, blocked } | null` — wired to `/llm-eval` in Q.5).

**Invariants**

- `ROLL-1` Shadow Non-Impact: shadow-scored requests never affect client responses or live metrics. Test: shadow model configured to 100% error + max latency; assert every client response byte-identical to baseline lane, live error-rate/latency metrics unchanged; assert shadow metrics tracked separately.
- `ROLL-2` Canary Percentage Bound: same statistical form as LB-2 (exact counts in golden fixture; chi-square GOF p > 0.01 over N=10,000 per stable-split window; live percentage changes reset window).
- `ROLL-3` Automatic Rollback: error rate past threshold for `evaluationWindow` ticks → split snaps to 100% prior stable without manual event; recorded as rollback event with triggering metric. Standalone FSM (health → OPEN → snap-back); Q.5 swaps to GW-1 state machine reuse. Test: inject error rate 15% vs threshold 5%; assert rollback within window+1 tick; assert no manual dispatch required.
- `ROLL-4` Significance Gate: promotion to 100% requires (a) `n ≥ minN` (default 1,000) per arm and (b) two-proportion z-test on business metric at α=0.05 significant in canary's favor. Test small-sample block: 70% vs 60% conversion at n=50/arm → promotion blocked despite raw uplift. Test large-sample pass: same proportions at n=2,000 → z ≈ 4.5 > 1.96 → allowed. Deterministic given seed (fixed counts, no resampling).
- `ROLL-5` Eval Gate Blocking (standalone form of EVAL-4): if `gateInputs.evalGate.blocked === true`, promotion events are rejected regardless of metrics. Q.5 wires real eval runs in; the standalone test drives the seam with a constructed blocked gate. (This makes the cross-domain invariant testable *inside* domain 24's own suite from day one.)

**Canvas:** traffic-split visualization with live per-version metric charts; shadow lane visually separated; rollback event animated as snap-back with triggering metric highlighted; significance panel showing n, z, p per arm. **Chaos:** inject canary error rate (watch ROLL-3); small-sample promotion attempt (ROLL-4); shadow model crash (ROLL-1); blocked eval gate promotion attempt (ROLL-5).

**Caps:** ≤6 versions live, metrics ring ≤ 5,000/version, shadow requests ≤ 2,000, evaluation window ≤ 50 ticks.

---

### Domain 25: LLM Evaluation & Guardrails Pipeline (`/llm-eval`)

**References**
- Liang et al. (2022): HELM (arXiv:2211.09110) — holistic offline eval methodology.
- Perez et al. (2022): Red Teaming Language Models with Language Models (arXiv:2202.05285).
- OpenAI Evals framework docs — eval-case structure.
- NeMo Guardrails (already cited platform-wide for `/llm-gateway`) — the *online* complement; this domain models the *offline* gate.

**Determinism note (critical):** the "model under test" is a **simulated deterministic responder** — scripted response profiles parameterized by (modelVersion, prompt, seed) with configurable violation rates per risk area. No real inference, ever. Red-team success is a property of the scripted profile, which is exactly what makes regressions constructible and golden-reproducible.

**State model**
`evalSuite` (test cases: prompt, expected behavior, risk area, severity: CRITICAL|HIGH|MEDIUM), `modelProfiles` (per version: scripted violation rates, response latency), `evalRuns` (modelVersion, per-case results, completion flag, guardrail policy version), `redTeamAttempts` (adversarial prompt, per-version elicitation outcome), `guardrailPolicies` (versioned rule sets), `rescoreRecords` (runId × policyVersion → distinct result).

**Invariants**

- `EVAL-1` Full Suite Coverage: run marked complete iff result count == active suite size; no skipped category. Test: construct partial run (one category missing) → completion flag false, report shows gap; full run → true.
- `EVAL-2` Red-Team Regression Detection: cross-version comparison of red-team outcomes; an attempt that elicited no violation on version A but succeeds on B is flagged as regression entry (not absorbed into aggregate pass rate). Test: version B's profile flips one scripted attempt to violation; assert regression list contains exactly that attempt; assert aggregate pass rate alone would have hidden it (pass rate delta < 1%).
- `EVAL-3` Policy Version Pinning: eval run result is bound to (run, policyVersion); re-scoring under a newer policy creates a new rescore record; original immutable. Test: score run under policy v1 (pass), v2 (fail — new rule); assert both records coexist and are distinguishable; assert original run unchanged after rescore.
- `EVAL-4` Deployment Gate: a run with any CRITICAL category failure produces `blocked: true` gate output (the shape domain 24's `ROLL-5` consumes). Test: critical-failing version → gate blocked; all-pass version → gate clear. The full cross-domain path (gate actually rejecting a real promotion dispatch in `/model-rollout`) is the Q.5 integration test.

**Canvas:** results grid (case × pass/fail, grouped by risk area); red-team lane across model versions (regression = newly-red cell in previously-green row — flagship); deployment-gate indicator per version; policy-version comparison view. **Chaos:** introduce scripted regression (EVAL-2); promote critical-failing version (EVAL-4 → see 24 block); rescore under new policy (EVAL-3).

**Caps:** suite ≤ 200 cases, ≤ 6 model versions, red-team attempts ≤ 50, policies ≤ 10 versions, rescore records ≤ 50.

---

### Domain 26: Consistent Hashing Deep-Dive (`/consistent-hashing`)

**References**
- Karger, Lehman, Leighton, Panigrahy, Levine, Lewin (1997): Consistent Hashing and Random Trees (STOC '97) — the ring (this citation was missing from the draft).
- Lamping & Veach (2014): A Fast, Minimal Memory, Consistent Hashing Algorithm (arXiv:1406.2294) — Jump hash.
- Thaler & Ravishankar (1996): Using Name-Based Mappings to Increase Hit Rates — Rendezvous/HRW original.
- Virtual nodes: Dynamo (DeCandia et al., SOSP '07 — already cited platform-wide for `/database`).

**State model**
`ring` (physical nodes → virtual node positions on 64-bit ring, vnode count per node), `jumpConfig` (bucket count n), `hrwNodes` (node set, optional weights), `keys` (test key set mapped under all 3 algorithms simultaneously + naive `hash % N` baseline), `rebalanceEvents` (add/remove, key-movement counts per algorithm).

**Invariants (corrected from draft — see §0)**

- `CHASH-1` Minimal Disruption: adding one node moves ~K/N keys. Test (exact, seeded): K=10,000 keys, N=5→6: ring-with-vnodes movement within `3·sqrt(K·(1/6)·(5/6)) + K/6·0.1` of K/6... concretized: `|moved − K/6| ≤ 4·sqrt(K·(1/6)·(5/6))` and `moved ≤ 2·K/6`; jump: exactly the keys with `jump(k, 6) == 5` move (assert set equality — jump is exact, not statistical); naive baseline for comparison: `hash % 5 → hash % 6` moves ≈ 5/6·K (assert > 4·K/6, i.e., the anti-goal, for the teaching visual). Removal (ring): only keys of removed node move — assert exact subset property. Removal (jump): modeled as shrink+remap (relabel buckets, count remap) — the visible tradeoff vs ring, displayed not asserted as minimal.
- `CHASH-2` Virtual Node Load Balance: with ≥100 vnodes/node and K=10,000, chi-square uniformity across physical nodes p > 0.01; max/min node load ratio ≤ 1.5. Contrast case (not an invariant): vnode count = 1 → show skew in distribution histogram.
- `CHASH-3` Jump Hash Growth Consistency (corrected): for all k and all n: `jump(k, n+1) == n` **or** `jump(k, n+1) == jump(k, n)` — a key's bucket changes on growth only by becoming bucket n, never between old buckets. Property-checked exhaustively over the key set for n ∈ [2, 64]. Also assert reference-formula parity: implementation matches the paper's recurrence `j = (i < 0) ? n : b; while (j < n) { b = j; key = key*2862933555777941757 + 1; j = int64(b + (j - b + 1) * (double(1 << 31) / double((key >> 33) + 1))) }` bit-for-bit (64-bit integer ops, no float in state).
- `CHASH-4` Rendezvous Determinism & Minimal Disruption (corrected — the draft's "same mapping as ring" claim is false; HRW and ring hash produce different mappings): (a) determinism: `argmax_{node} h(key, node)` recomputed at any time yields identical assignment — property-checked; (b) removal of node x only changes keys whose argmax was x — assert exact set equality; (c) complexity note asserted operationally: per-key lookup computes N hashes (count instrumented and displayed vs ring's O(log(vN)) binary search — the tradeoff is shown numerically, not just claimed).

**Canvas:** classic ring with virtual nodes as colored ticks (flagship); live 3-algorithm (+naive baseline) key-movement counter on identical add/remove event; load histogram per algorithm; per-key inspector showing hash positions and winning node under each scheme. **Chaos:** add/remove node with live movement comparison; vnode-count slider (CHASH-2 quality); large-scale key/node mode comparing instrumented lookup op counts.

**Caps:** keys ≤ 50,000, nodes ≤ 32, vnodes ≤ 512/node, ring positions ≤ 16,384 total.

---

### Domain 27: Bloom Filters & Probabilistic Structures (`/probabilistic-structures`)

**References**
- Bloom (1970) — original.
- Fan, Cao, Almeida, Broder (2000): Summary Cache — counting Bloom filters.
- Fan, Andersen, Kaminsky (CoNEXT '14): Cuckoo Filter: Practically Better Than Bloom.
- Flajolet, Fusy, Gandouet, Meunier (2007): HyperLogLog (with exact `1.04/√m` standard error).
- Cormode & Muthukrishnan (2005): An Improved Data Stream Summary: The Count-Min Sketch.
- Parity anchor: `/storage`'s existing Bloom FP-rate formula (see §1 overlap table).

**State model**
`bloom` (bit array m, k hashes), `countingBloom` (4-bit counters), `cuckoo` (buckets × slots, fingerprint, occupancy, kick path log), `hll` (m registers, each storing max leading-zero count + 1), `cms` (d rows × w counters), all fed identical seeded streams; `memUsage` per structure; `fpEvents` log.

**Invariants (PROB-3 corrected — see §0)**

- `PROB-1` No False Negatives (Bloom family: bloom, counting, cuckoo): every inserted element tests positive. Property-checked over full stream + adversarial post-deletion subset for counting/cuckoo. False positives are *expected* and separately measured against the `(1 − e^{−kn/m})^k` formula (parity with `/storage`'s implementation).
- `PROB-2` Counting Bloom Deletion Safety: insert X, Y sharing ≥1 bit (constructed collision); delete X; Y must still test positive; no counter ever below 0 (underflow = invariant failure). Test includes the constructed-shared-bits case and a mass-delete/stream case.
- `PROB-3` HyperLogLog Error Bound (corrected): `1.04/√m` is the **standard error**, not a per-estimate hard bound. Two-part assertion: (a) single estimate: `|estimate − true| ≤ 4·(1.04/√m)·true` (z=4 margin — with fixed seeds this is deterministic and safe); (b) across ≥5 independent seeds, empirical relative error's standard deviation converges within ±25% of the formula. Both computed against the actual Flajolet estimate: `α_m·m²·(Σ2^{−M_j})^{−1}` with bias correction near the small/large cardinality regimes (or documented explicit omission with citation).
- `PROB-4` Count-Min Sketch Overestimation-Only: estimate(k) = `min_d cms[d][h_d(k)] ≥ trueCount(k)` always. Adversarial test: construct hash collisions (two keys landing in same cells) to inflate; assert overestimate only; property-check over full stream that no key ever underestimates; construct underestimate bug state (a decremented counter) → invariant fires.

**Canvas:** side-by-side bit/bucket/register arrays updating live on identical stream; comparison table (memory, measured FP/error, supports deletion, use case); HLL register view showing actual leading-zero mechanism (flagship: register heat + the estimate arithmetic); CMS cell-collision highlight. **Chaos:** high-volume identical stream across 5 structures with live memory-vs-accuracy; delete with colliding neighbor (PROB-2); adversarial CMS probe (PROB-4).

**Mode-aware matrix:** 5 structures each assert their specific guarantees above; the shared test is a fed-stream identity only.

**Caps:** m ≤ 16,384 bits (bloom), counters 4-bit, cuckoo ≤ 512 buckets × 4 slots (with max-kick eviction failure surfaced, not silent), HLL m ∈ {64…16,384} powers of 2, CMS ≤ 5×4,096, stream ≤ 20,000 elements.

---

### Domain 28: Merkle Trees & Distributed Verification (`/merkle-trees`)

**References**
- Merkle (1979): Secrecy, Authentication, and Public Key Systems (thesis); Merkle (1987): A Digital Signature Based on a Conventional Encryption Function (CRYPTO '87) — tree construction.
- DeCandia et al. (SOSP '07): Dynamo — anti-entropy Merkle comparison (already cited for `/database`).
- Git object model docs — content-addressed tree hashing.
- Ethereum Merkle-Patricia trie docs — prefix trie + Merkle hashing, proof of (non-)membership.

**State model**
`merkleTree` (leaves = data-block hashes, internal nodes built bottom-up, padded to power of 2), `merkleProofs` (sibling-hash path per leaf), `replicas` (two trees + divergence walk log), `patriciaTrie` (key-value with branch/extension/leaf nodes, root hash, membership and non-membership proofs), `hashLog` (every hash computation instrumented — powers the MERKLE-3 comparison count).

**Invariants**

- `MERKLE-1` Root Sensitivity: single-bit flip in any leaf's data → root hash differs (hash inequality, not just "should differ"). Property-tested over every leaf of a 64-leaf tree; collision would be a real bug (hash function is SHA-like deterministic stub — fixed-output-width, seeded, but never identity).
- `MERKLE-2` Proof Soundness: valid proof for leaf L verifies against root R; tampered leaf data → verification fails; tampered sibling in proof → fails; both directions explicitly tested (also tampered root → fails).
- `MERKLE-3` Anti-Entropy Localization: comparing two replicas differing in D of L leaves performs ≤ `2·ceil(log2 L) + 4·D` node-hash comparisons, and strictly fewer than full linear scan `2L` for D ≤ L/8. Test: L=256, D=1: comparisons ≤ 20 (vs 512 full-scan); D=8: ≤ 44. Comparison count taken from the instrumented hashLog, not estimated.
- `MERKLE-4` Patricia Non-Membership Proof: for absent key k, trie produces a proof whose terminal node shows the boundary prefix — no key in that subtree shares k's remaining path; verification accepts for genuinely absent keys and **rejects** when the key was actually inserted (constructed attack: proof-of-absence presented for present key must fail). Both directions tested.

**Canvas:** bottom-up tree-hash construction animation (flagship — matches the whiteboard); proof-path highlight (exact sibling hashes needed); two-replica side-by-side with divergence walk and comparison counter vs full-scan counter (MERKLE-3 made numeric); Patricia trie with prefix-sharing visualization. **Chaos:** bit flip (MERKLE-1 + proof path highlight); proof tamper (MERKLE-2); replica divergence (MERKLE-3); non-membership proof forgery attempt (MERKLE-4).

**Caps:** ≤ 1,024 leaves (padded), proofs ≤ 10 active, Patricia keys ≤ 256, replicas = 2.

---

## 3. Platform integration checklist (grounded in real files)

Per domain, beyond simulation core:

| Step | File(s) | Note |
|---|---|---|
| Scaffold | `pnpm create:domain <id> "<Name>"` | Generates 4 stub files (types, state-transitions, invariants, Visualizer.tsx). Stub state (generic ALIVE/CRASHED nodes) must be fully replaced; scaffolder does **not** create the scenarios/fidelity-test files. |
| Register plugin | `packages/simulation/src/domains/registry.ts` | Add to category union: `'ALGORITHMS'` (new — needed for 26/27/28). Prefer `DomainPluginBuilder` (`src/sdk/domain-builder.ts`) for new registrations — supports scenarios array, invariant validators, metadata. |
| Scenario library | `<domain>-scenarios.ts` via builder's scenario array | Guided scenarios incl. one per named chaos case. |
| Fidelity tests | `packages/simulation/src/domains/<id>/<id>.fidelity.test.ts` | All invariants + chaos fixtures + mode-aware matrix. |
| Golden determinism | `packages/simulation/src/golden-determinism.test.ts` | Exactly 2 per domain: initial-state hash + seeded multi-step chaos hash (per ADDING_A_DOMAIN.md). |
| Directory matrix | `apps/web/src/components/domain-options.ts` + `DomainDirectoryModal.tsx` | 10 new entries, correct categories. |
| Command palette + glossary | `apps/web/src/components/palette/CommandPaletteModal.tsx` | Route entries + glossary terms per domain (there is no separate GlossaryTooltip component — glossary lives in the palette). |
| Visualizer | `apps/web/src/components/<id>/<Pascal>Visualizer.tsx`, mounted via `DomainCanvasAdapter.tsx`, primitives from `apps/web/src/components/domains/design-system/` | Full common UX checklist (legend, guided scenarios, inspector drawer, invariant panel, timeline scrubber, accessible table view, keyboard, mobile). |
| Contracts | `packages/contracts/src/domain/` + polymorphic `topology.ts` | Zod schemas for new domain intents + topology entries; RBAC single-query path stays intact. |
| WS hardening | `apps/ws-gateway` behavioral tests | Message-size caps + rate caps for the new intent types, day one (existing 20 msg/sec cap reused). |
| E2E | Playwright spec per new route (`scripts/run-playwright-e2e.mjs` suite) | Route loads, chaos control works, invariant panel renders. |
| Verification scripts | `scripts/verify-all-18-domains.mjs` | `EXPECTED_DOMAINS` hardcoded to 18 → parameterize/extend to 28 (rename `verify:all` target accordingly); lighthouse script route lists extended to 28 routes. |
| Fidelity references | `docs/architecture/FIDELITY_REFERENCES.md` | Domain spec row + config-knob parity table per domain (exact format of existing 18). |
| Platform docs | `README.md`, root `package.json` description, `VISUALIZERS_DETAILS.md`, `features_and_functionalities.md` | 18 → 28 everywhere; `package.json` description literally says "18 distributed systems..." — must change. |

---

## 4. Determinism & statistical-testing rules (batch-wide, hard)

1. **Entropy-grep gate** (CI-blocking per domain PR): no `Math.random`, `Date.now`, `performance.now`, `crypto.*` inside `packages/simulation/src/domains/<id>/` — only `DeterministicRNG`.
2. **All TTLs/timeouts in simulation ticks.** No wall-clock anywhere in state or transitions (CHAT-2, FS-3, SCHED-4, LB drain, ROLL windows are tick-based).
3. **Float quantization for hashed state:** any float entering persisted/hashed state (BM25 scores, HLL estimates, EWMA, z-scores) is stored quantized (`round(x·1e6)/1e6`) at the reducer boundary. Rationale: `Math.log`/`Math.pow` are implementation-approximated per ES spec; unquantized floats in golden hashes risk cross-Node-version drift. Integer-first formulations preferred where the algorithm permits (jump hash, Bloom, CMS are pure integer paths; HLL estimate uses one log — quantize).
4. **Statistical invariants:** golden fixtures pin exact counts (seeded → deterministic). Behavioral tests use chi-square GOF (α=0.01) for distributions and exact subset/equality assertions where the algorithm is exact (jump growth, HRW removal, ring removal subset). Two-proportion z-test (α=0.05) for ROLL-4. No "looks reasonable" tolerances.
5. **Statistical-invariant failure = bug, not flake:** any test that intermittently fails on a fixed seed is a determinism violation, treated as P0.

---

## 5. Resource caps & WS hardening (day one)

- Per-domain numeric caps as listed in §2 (hard-clamped in reducers, surfaced in UI when hit — never silent truncation).
- New WS intent types: Zod schema with literal caps (arrays ≤ 1,000, strings ≤ 10 KB), rate-capped under existing free-tier limiter, gap-recovery replay verified for new domain state shapes.
- `ScenarioStudio` time-travel replay for every new domain must not exceed existing scrub budgets (reuse `benchmark-canvas-fps.mjs` thresholds).

---

## 6. Phase plan (Q.0–Q.7, revised)

### Phase Q.0 — Baseline green
- [ ] `pnpm typecheck && pnpm test:all && pnpm verify:all && pnpm build` green on `main` before any scaffold. Record baseline in `docs/audit/BASELINE.md` addendum.

### Phase Q.1 — Spec lock & scaffolding
- [ ] `FIDELITY_REFERENCES.md`: add 10 domain rows + knob-parity tables with the citations in §2 (incl. the previously missing Karger, Thaler & Ravishankar, Fan ×2, Cormode & Muthukrishnan, Merkle, Robertson & Zaragoza).
- [ ] Extend `registry.ts` category union with `'ALGORITHMS'`.
- [ ] Scaffold 3 sub-batch A domains only (26/27/28) — sub-batches B and C scaffold at their own gates, not upfront.
- [ ] Extend `domain-options.ts` + `CommandPaletteModal` + `DomainDirectoryModal` (batch-wide, additive).

### Phase Q.2 — Deterministic simulation core (per sub-batch, gated)
- [ ] Sub-batch A (26, 27, 28): reducers, all 12 invariants, fidelity tests, 6 golden fixtures, scenarios. Then gate check.
- [ ] Sub-batch B (19, 20, 21, 22): same for 16 invariants. Includes the `/rag` BM25 shared-core extraction with `/rag` golden hashes asserted unchanged. Gate check.
- [ ] Sub-batch C (23, 25, 24): same for 13 invariants; llm-eval before model-rollout so the gate contract (§2.24 `gateInputs`) is defined by the producer.
- [ ] Mutation round per domain, in-batch (not deferred): introduce a real semantic bug in the flagship invariant + one mode-aware invariant for multi-mode domains (LB, 26, 27, 21-jitter, 20-BM25-params), confirm test failure, revert, confirm green — recorded in `docs/audit/ADVERSARIAL_ROUND_Q_MUTATION_COVERAGE.md` in the established bug-diff/failing-output/revert format.
- [ ] Contracts-first seams shipped inside standalone PRs: LB `ringProvider` (typed against 26's ring API), scheduler lease (typed against `/distributed-lock` semantics), chat `throttleProvider` (against `/rate-limiter` API), rollout `rollbackFsm` (against GW-1 semantics), rollout `gateInputs.evalGate`.

### Phase Q.3 — Visual canvas & shell integration
- [ ] All 10 visualizers on `DomainCanvasAdapter` + design-system primitives; full common UX checklist from first commit (no retrofit round).
- [ ] Flagships: routing-decision reasoning line (19), BM25 arithmetic breakdown (20), DAG execution graph (21), fanout animation (22), as-of join timeline (23), traffic-split + rollback snap (24), red-team regression grid (25), 3-algorithm ring comparison (26), 5-structure comparison (27), bottom-up tree-hash construction (28).

### Phase Q.4 — Hardening day one
- [ ] Caps + WS behavioral tests for new intents (§5).
- [ ] axe-core ≥ 95 per new route, from first implementation.
- [ ] Mode-aware invariant matrices (§2) — exact per-mode assertions; the NET-3 mistake (shared loose floor across modes) must not appear. Explicit review item: grep each multi-mode domain's tests for assertions that hold across all modes without distinguishing them.
- [ ] Playwright e2e spec per new route; lighthouse route lists extended.

### Phase Q.5 — Cross-domain composition (last, as always)
- [ ] LB sticky mode ← 26's real ring (swap `ringProvider` seam).
- [ ] Scheduler leader election ← `/distributed-lock` lease mechanism.
- [ ] Chat per-user send throttling ← `/rate-limiter`.
- [ ] Rollout automatic rollback ← `/llm-gateway` GW-1 breaker FSM.
- [ ] **`EVAL-4` full path: `/llm-eval` gate output actually rejecting a promotion dispatch in `/model-rollout`** — dedicated integration test (attempt `ROLLOUT_PROMOTE` with blocked gate → dispatch rejected, state unchanged, event logged) + its own golden-determinism fixture covering the shared-state path, written before any composition UI.
- [ ] Each composition: golden fixture + integration test + e2e before composition UI work.

### Phase Q.6 — Launch readiness audit
- [ ] `verify:all` extended to 28 domains; full existing audit protocol run against the 10: file-existence, quality-gate reproduction, per-domain mutation re-check, live behavioral spot-checks, forensic scorecard, dependency/pentest pass on new WS intents.
- [ ] 28-route lighthouse run (extend the 54-run scripts' route lists).

### Phase Q.7 — Docs & release rollup
- [ ] README, `package.json` description, `VISUALIZERS_DETAILS.md`, `features_and_functionalities.md`, architecture docs → 28-domain platform.
- [ ] Final scorecard appended to `docs/audit/PRODUCTION_READINESS_SCORECARD_V6.md`.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Float drift breaks golden hashes (BM25, HLL) | Med | High (CI red) | §4.3 quantization rule; integer-first paths for jump/Bloom/CMS |
| 10-domain batch loses discipline mid-way | Med | High | 3 gated sub-batches, per-domain DoD, mutation round per batch |
| BM25 logic forks between `/rag` and `/search-index` | High if ignored | Med | §1 shared-core extraction with `/rag` golden-hash-unchanged assertion |
| Jump-hash removal mis-modeled as native | Med | Med (educational correctness) | §2.26: removal modeled as explicit shrink+remap, labeled as jump's limitation |
| `EVAL-4` cross-domain state plumbing forces retrofit | Med | Med | `gateInputs.evalGate` contract ships in 24's standalone PR (ROLL-5) |
| Statistical invariants flake | Low (seeded) | High if perceived flaky | §4.4/§4.5: exact counts in goldens; any seed-dependent failure = P0 determinism bug |
| LLM eval domain drifts toward nondeterministic "AI" behavior | Med | High | §2.25: scripted deterministic responder profiles only |
| `verify-all-18-domains.mjs` silently skips new domains | High if unrenamed | High | Q.6 first item: extend + rename; `EXPECTED_DOMAINS` count assertion fails loudly if registry ≠ expected |
| A11y/perf retrofits (the historical pattern) | Med | Med | Q.3/Q.4 gates from first commit; e2e + lighthouse per route in-batch |

---

## 8. Definition of Done — per domain

1. Types + reducer + invariants + scenarios, registered via `DomainPluginBuilder`, entropy-grep clean.
2. `<id>.fidelity.test.ts`: every invariant has a passing nominal test **and** a constructed-violation test (must be provably capable of failing).
3. 2 golden-determinism fixtures green.
4. Mutation round recorded (flagship + one mode-aware where applicable).
5. `domain-options` + palette + directory entries; visualizer on adapter; UX checklist complete; axe ≥ 95; e2e spec green.
6. Contracts + WS behavioral tests for its intents; caps enforced.
7. `FIDELITY_REFERENCES.md` row + knob-parity table written.

Batch DoD: all of Q.0–Q.7 checked, 28-domain verify green, scorecard published, zero regressions in the existing 18 (all pre-existing golden hashes unchanged except the one sanctioned `/rag` BM25-core refactor, whose before/after hashes are pinned equal).
