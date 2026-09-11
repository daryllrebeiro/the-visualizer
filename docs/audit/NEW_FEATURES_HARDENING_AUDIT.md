# New Features (Batch 1 + Phase 2/3 Extensions) — Hardening Audit, Round 2

> Audit date: 2026-09-11 (second round). Method: every claim below was
> reproduced fresh in this session against the live working tree. Raw command
> output is quoted inline. Nothing is carried over from the prior round without
> re-execution; where code is unchanged, that is stated explicitly with the
> verification performed.
>
> Scope delta since round 1: registry 28 → 30 domains (`rag`, `agents`
> registered); Buffer-free base64 in the permalink codec; new surfaces —
> `/analytics`, `/classroom`, `POST/GET /replays`, `/classroom/*` API,
> executable scenario scripts + Scenario Studio rewrite, Plugin SDK GA
> (`PLUGIN_API_VERSION`), per-domain topology `definition` bounds, canonical
> gateway egress contract, Redis Streams intents, worker tick pool, WASM-ready
> edge kernel. Uncommitted Phase 2/3 work was in the tree during this audit.

---

## 0. Final verification (fresh, this session)

```
pnpm typecheck        → 0 errors (recursive, all workspaces)
pnpm test:determinism → 93 passed (93)
pnpm test:unit        → 507 passed | 1 skipped (508), 74 files
pnpm test:integration → 94 passed (94), 18 files
pnpm build            → Tasks: 9 successful, 9 total
axe (real Chromium)   → 11 routes; all 10 new surfaces 0 violations
```

---

## Part 1 — Zero-Token Constraint Enforcement → **HELD**

| Probe | Command | Result |
|---|---|---|
| LLM SDK imports in all new dirs | `grep -E 'openai\|anthropic\|generative-ai\|BEDROCK\|vertexai\|cohere\|mistral\|huggingface'` over learn/compare/composer/progress/quizzes/interview/badges/compare/composer/challenges/analytics/classroom, `simulation/src/{learn,wasm}`, `contracts/src/learn`, `ws-gateway/src/workers`, `api/src/routes/{learn,replay,classroom}.ts` | **0 matches in every directory** |
| Outbound network in new UI | `grep 'fetch('` over learn components + all new app routes | 11 call sites, **all** `${API_URL}/learn/...` or `${API_URL}/classroom/...` (`NEXT_PUBLIC_API_URL`, localhost default) |
| Outbound network in engine | `grep 'fetch(\|axios\|WebSocket(' packages/simulation/src/learn; same for wasm/, workers/` | **0 matches** |
| LLM hosts in new API routes | `grep 'openai\|anthropic\|axios\|https://' learn|replay|classroom routes + replay.repository` | **0 matches** |
| Scheduler implementation | `session-timeline.ts` | Hand-coded Leitner (`LEITNER_INTERVALS_MS`, pure `reviewCard()`); no service call |
| Diff implementation | `structural-diff.ts` | Hand-coded recursive structural diff; no service call |

**Dependency graph of every new route:** `POST/GET /learn/short-links` → Redis;
`PUT/GET /learn/progress` → Redis; `POST /learn/badges/issue` + `GET
/learn/badges/verify` → local `createHmac`; `POST/GET /replays` → Redis +
Postgres; `/classroom/*` → Redis. Classroom/verify/badges pages and the learn
store call only the own-stack `API_URL`. The WASM edge kernel and tick worker
make zero network calls by construction. No route reaches a third-party API.

**Verdict: the zero-token / no-LLM / no-paid-API constraint held without
exception**, including all Phase 2/3 additions. No new dependency capable of
exfiltration was added (only an internal workspace link and store-bundled
esbuild for the edge-bundle script).

---

## Part 2 — Determinism Dependency Stress Test

### 2.1 Permalink round-trip — 7 domains × 3 fresh decode+replay cycles

Domains: `kafka` (original-8), `raft` (+ election-timeout randomness),
`llm-serving` (AI/LLM), `search-index` (newest batch), `merkle-trees`,
plus `rag` and `agents` (newly registered — extended beyond the spec's five).

```
ROUNDTRIP-OK kafka        hash={"brokers":{"1": len=1145
ROUNDTRIP-OK raft         hash={"activeLeaderId len=1725
ROUNDTRIP-OK llm-serving  hash={"batchScheduler len=2618
ROUNDTRIP-OK search-index hash={"analyzer":{"st len=1067
ROUNDTRIP-OK merkle-trees hash={"antiEntropy":n len=1025
ROUNDTRIP-OK rag          hash={"activeQuery":n len=2667
ROUNDTRIP-OK agents       hash={"agents":{"agen len=2062
```

All three hashes per domain byte-identical, **including the two new domains**.
**PASS.**

### 2.2 Diff false-negative — single subtle config bit

```
DIFF-FN-OK flagged=["$.config.capacity"]
```
**PASS.**

### 2.3 Diff false-positive — genuinely identical runs

```
DIFF-FP-OK zero-divergence
```
**PASS**, with the L3 caveat carried over (no explicit non-semantic-field
exclusion list; safe today because all 30 domains are deterministic).

### 2.4 Long-session frame validity — 12 domains × 5 actions

```
TIMELINE-OK 60 entries all resolve
```
**PASS.**

### Fidelity guard (from round 1, re-verified)
The committed fidelity test (`learn-determinism.test.ts`) asserting the last
tick is consumed and that dropping it changes the final state passes as part of
the 93/93 determinism suite. The Part 2 round-trip remains a self-consistency
check; fidelity is enforced by the committed test. Both were re-exercised by
the mutation cycle in Part 8 below.

---

## Part 3 — Permalink Security → **PASS** (one Low carried, one new Medium)

### 3.1 Fuzz decode — committed suite re-run fresh: 12/12 pass
No throws, all malformed inputs rejected. The codec has since been rewritten to
a pure `TextEncoder` + lookup-table base64 (no `Buffer`/`btoa`), and all 12
cases still pass — the rewrite is byte-identical on the tested vectors.

### 3.2 Wrong-domain / cross-domain events
Unchanged code path; behavior re-confirmed via the passing committed suite:
unknown `domainId` throws cleanly; foreign event types neither crash nor
pollute `Object.prototype`.

### 3.3 Short-link enumeration
```
ENUM ids=25 distinct=25 alphabet=63 space~=9.85e+17
ENUM sample=yfXbLXhby_,seKBa8JVlK,wPOPcSpjqC,SchAikrTEo,on5oeefFp5
```
`nanoid(10)`, 25/25 distinct, no sequential pattern. Traversal/injection ids
(`../../etc/passwd`, `learn:progress:someone`, 9- and 11-char strings) → 400.
Capability read returns only `{success, payload}` with `payload` =
`{v, domainId, seed, events}`. **Non-enumerable.**

### 3.4 Size caps
```
OVERSIZE-501  status=400   (schema: events ≤ 500)
OVERSIZE-BODY status=413   (global bodyLimit 512KB)
```
**PASS.**

### 3.5 Untrusted-link blast radius
Decode + replay remain pure local compute (re-verified: zero network/session
imports in the codec; the Buffer-free rewrite reduced host dependencies
further). A crafted permalink cannot reach an authenticated action. **PASS.**

### ⚠ Finding M5 (new, Medium) — short-link creation is unauthenticated
`POST /learn/short-links` carries no `requireAuth`: any anonymous client can
persist schema-valid payloads to Redis (`learn:shortlink:*`, 30-day TTL). The
blast radius is bounded — 500-event schema cap, 512 KB body limit, and the
global per-IP token bucket (60 burst + 1/s refill) — but a single IP can still
accumulate ~4 GB/day of junk keys at the refill rate. Recommend `requireAuth`
or a dedicated stricter quota for anonymous mints.

### Finding L2 — event payload has no per-value cap (carried over)
Code unchanged since round 1; backstops verified still in place (200 000-char
decode cap, 512 KB body). **Low**, still open.

---

## Part 4 — Badge & Certification Anti-Forgery

### 4.1 Cryptographic guarantee → **PASS** (reproduced)
```
FORGE-guessed-secret status=400
FORGE-tampered-track status=400
FORGE-tampered-date status=400
FORGE-badsig ""/"zzzz"/000…/aaa…/"!!!" → all 400
```
HMAC-SHA256 over canonical JSON, server-side recompute with length-guarded
`timingSafeEqual`; the `/badges/verify` page calls the server endpoint rather
than trusting the URL. **Real guarantee, unchanged.**

### 4.2 ⚠ Finding B2 (still OPEN) — requirements are client-asserted
```
ENFORCE-progress-before=null
ENFORCE-fabricated-issue status=201
```
Reproduced exactly: a fresh user with no progress record receives a signed
badge for fabricated `met:true` evidence. The server never reads the stored
progress. **High** relative to certification claims; unchanged.

### 4.3 Finding L1 (still OPEN) — badge key falls back to the JWT key
`KEYS badge_signing_explicit=no`. Unchanged. **Low.**

---

## Part 5 — Composer: Verify Underlying Compositions

### 5.1 ⚠ Finding B3 (still OPEN) — the compositions do not exist
```
COMPOSER presentational: calls_engine=false uses_timers=true
COMPOSER-SCENARIOS total=5 dangling=5 -> (same five pairs as round 1)
TRACK-SCENARIOS dangling=1 -> ai-infra-foundations/llm-pipeline:lost-in-middle
CHALLENGE-SCENARIOS dangling=1 -> kafka:kafka-broker-crash
```
Re-verified against the 30-domain registry: identical result. Note
`CHALLENGE no-chaos-ref=22` — 22 of 30 challenges reference no chaos scenario
at all, so the challenge UX cannot deep-link them into a runnable scenario.

### 5.2 Composition-contract schema fuzz → **PASS** (re-verified via suite)
`ComposedPipelineSchema` accept/reject behavior is covered by the passing
committed contracts tests (executed in the 507-test unit run). The round-1
caveat stands: a fuzzed schema with no runtime consumer is necessary but not
sufficient.

### 5.3 Composed-trace determinism → **still not testable as specified**
Unchanged: no state hand-off exists. The new `ScenarioRunner`
(`runScenarioScript`) is single-domain; it does not compose domains.

---

## Part 6 — Challenge Mode Integrity

### 6.1 ⚠ Finding M1 (still OPEN) — answers and hints are client-side plaintext
Re-verified: `ChallengeMode.tsx` keeps `hintsShown` in local `useState` with no
`fetch`/API gate; `/challenges/page.tsx` remains `'use client'` importing the
full `challenge-bank` (hints, `invariantId`, explanations).

### 6.2 ⚠ Finding M2 (still OPEN, with one correction) — fabricated answer keys
Re-harvested against all 30 domains: `RAFT_LEADER`, `REDIS_STALENESS`,
`RABBIT_DLQ`, `LSM_STALL` still match no emitted `invariantName`/`ruleId`
(near-misses only: `RAFT_LEADER_COMPLETENESS`, `KRAFT_LEADER_ELECTED`). The new
rag/agents checkers emit real `RAG-1..4`/`AGENT-1..4` ruleIds. **Correction to
round 1:** the bank has 30 challenges and 26/30 resolve, not "26/30" of a
different total — the count was right; the four dangling IDs are unchanged.

---

## Part 7 — Resource Caps on New Persisted State

### Local caps → **PASS** (unchanged code, re-verified by passing suites)
### Server caps
```
CAP domains-3000 status=200 bodyBytes~=489844
CAP progress-bad-shapes rejected=400
```
### ⚠ Finding M3 (still OPEN)
`UserProgressSchema.domains` and `DomainProgressSchema.quizAnswered` remain
`z.record(...)` with no `.max()`. Reproduced: 3 000 fake domains accepted.
Same fix as prescribed in round 1.

---

## Part 8 — Mutation Testing for New Deterministic Algorithms

All three mutations re-applied, confirmed caught, and reverted with source
restoration verified by re-reading the mutated lines afterward.

| # | Mutation | File | Caught? | Evidence |
|---|---|---|---|---|
| 1 | Leitner promotion `box + 1` → `box` | `session-timeline.ts:64` | **YES** | `AssertionError: expected 1 to be 2` |
| 2 | Structural diff skips nested objects (removed `walk`) | `structural-diff.ts:65` | **YES** | `expected [] to deeply equal ['$.config.capacity']` (committed + stress suites) |
| 3 | Codec drops last event `.slice(0, -1)` | `permalink-codec.ts:117` | **YES** | `expected 24 to be 25`; `kafka: last tick must be consumed: expected 39 to be 40`; plus the RL-3 flaw-state test (`expected false to be true`) |

Note: mutation 3 this round tripped **three** assertions (finalTick, fidelity,
and the RL-3 boundary-burst replay), confirming the fidelity coverage added in
round 1 is load-bearing, not decorative.

---

## Part 9 — Accessibility & Standard Reproduction Pass

### 9.1 axe-core over new surfaces (real Chromium via Playwright)
Harness extended to 11 routes (`/analytics`, `/classroom` added).

First scan found a **new** violation on the new `/analytics` page:
56 `color-contrast[serious]` nodes. Root cause: `opacity: 0.55` on unvisited
rows dragged `#94a3b8` down to an effective **3:1**. Fixed by replacing the
opacity dimming with a full-contrast `NEW` badge; rebuilt and re-scanned:

```
AXE /progress /quizzes /interview /badges /badges/verify /compare /composer
/challenges /analytics /classroom → all clean
AXE-SUMMARY routes=11 total_serious=1   (pre-existing home route "/" only)
```

**All 10 new surfaces have zero axe violations.** Finding A1 (analytics
contrast) is **FIXED** in this audit.

### 9.2 Standard reproduction
See §0. Note the integration count rose 81 → **94**: the previously-skipped
compiled-worker test now executes (see B4).

### 9.3 Entropy audit
```
grep Math.random over apps/web/src          → 0 matches
engine deterministic paths (codec, diff, timeline, scenario-runner,
  scenario-studio, edge-kernel):
  grep Math.random|Date.now|performance.now|new Date → 0 matches
```
`Date.now()` appears only in `learn-store.ts` UI metadata (6 sites, unchanged)
and one comment in `simulation-store.ts`. The deterministic paths are clean,
**including the rewritten codec and all new Phase 2/3 modules.** **PASS.**

---

## New findings this round

| ID | Severity | Part | Finding | Status |
|----|----------|------|---------|--------|
| **B4** | **High** | 9 | `fast-json-patch` named ESM imports (`snapshot-manager.ts`, `simulation-reconstitutor.ts`) crash native Node ESM consumers: the compiled worker thread died with `SyntaxError: ... does not provide an export named 'applyPatch'`, failing `test:all` | **FIXED** |
| M5 | Medium | 3 | `POST /learn/short-links` is unauthenticated — anonymous Redis writes (30d TTL), bounded only by schema/body-limit/per-IP rate limit | OPEN |
| A1 | Medium→fixed | 9 | `/analytics` shipped 56 contrast violations via opacity dimming | **FIXED** |

B4 detail: the failure mode matters more than the one-line fix. The gateway's
own `runner.ts` already carried a defensive default-import pattern for this
exact library; the two simulation files predated that lesson. The worker test
caught it only because it loads the **compiled** dist in a real thread —
vitest's transform had been masking the break. Fix: same default-import +
fallback pattern in both files; verified by rebuild + 7/7 worker tests +
full-suite green.

### Fixes applied during this audit
1. `snapshot-manager.ts`, `simulation-reconstitutor.ts` — CJS/ESM-safe
   `fast-json-patch` imports (B4).
2. `apps/web/src/app/analytics/page.tsx` — opacity dimming replaced with a
   full-contrast `NEW` badge (A1).
3. `apps/web/axe-learn-audit.mjs` — coverage extended to `/analytics` and
   `/classroom`.

---

## Findings carried over (re-verified, still open)

| ID | Severity | Part | Finding | Status |
|----|----------|------|---------|--------|
| **B1** | **High** | build | Broken `next build` via ESM/CJS coupling | **FIXED (round 1)** |
| **B2** | **High** | 4 | Badge requirements client-asserted; fabricated evidence → 201 | **OPEN** |
| **B3** | **High** | 5 | Composer presentational; 5/5 scenarioIds dangle | **OPEN** |
| M1 | Medium | 6 | Challenge answers/hints client-side; hint pacing client-only | OPEN |
| M2 | Medium | 5/6 | 4 fabricated invariant IDs + 2 dangling scenario refs | OPEN |
| M3 | Medium | 7 | No schema `.max()` on progress record key counts | OPEN |
| M4 | Medium | 2/8 | Round-trip self-consistency gap | **FIXED (round 1)** |
| L1 | Low | 4 | Badge key falls back to JWT key | OPEN |
| L2 | Low | 3 | Permalink payload values unbounded | OPEN |
| L3 | Low | 2 | No diff exclusion list for non-semantic fields | OPEN |

---

## 🚫 Ship / No-Ship verdict

**The batch is NOT cleared for unconditional release.** This round's headline
results:

1. **A new High (B4) was found and fixed in-session.** The uncommitted worker
   work could not survive contact with a real Node thread because of a latent
   CJS/ESM interop defect in two simulation files. It is fixed and covered, but
   it demonstrates that the Phase 2 additions need this audit's level of
   verification — `test:all` must stay green and must keep executing the
   compiled-worker test (not skip it).
2. **B2 and B3 remain open and remain blockers** for "verifiable certification"
   and "Build Your Own System" claims respectively, exactly as in round 1.
3. **New Medium M5** (unauthenticated short-link minting) should be gated
   (`requireAuth` or a dedicated anonymous quota) before launch.

**Cleared to ship now** (with the round-1 gatings unchanged): Features 1–6, 8,
10 mechanics; permalinks (now additionally Buffer-free and sandbox-proven);
replay persistence API; classroom API + page; analytics; WASM-ready kernel as a
portability artifact (not a `.wasm` binary — do not market it as one). Badges
ship **only** relabeled as self-asserted; Composer ships **only** behind a
preview label. M1/M2/M3/M5 should be scheduled immediately post-launch (M2
before, as factual learner-facing content); L1–L3 remain backlog.
