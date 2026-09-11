# New Features (Batch 1) — Hardening Audit

> Audit date: 2026-09-11. Method: every claim below was reproduced fresh in this
> session against the live working tree. Raw command output is quoted inline.
> No claim is carried over from the build report without re-execution.
>
> Scope: the 10-feature zero-token batch — `packages/contracts/src/learn`,
> `packages/simulation/src/learn`, `apps/api/src/routes/learn.routes.ts`,
> `apps/web/src/{app,components}/{learn,compare,composer,progress,quizzes,interview,badges,compare,composer,challenges}`.
>
> **Headline: the batch was NOT shippable as delivered.** The most severe finding
> is not a security issue — the Next.js production build was broken by this
> batch's own dependency change, and neither `pnpm typecheck` nor `vitest`
> caught it (B1, fixed in this audit). Two further findings (B2, B3) remain open
> and together mean the Composer and Badge features must not ship with their
> current user-facing claims.

---

## 0. Final verification (fresh, this session)

```
pnpm typecheck        → 0 errors (recursive, all 9 workspaces)
pnpm test:determinism → 89 passed (89)
pnpm test:unit        → 457 passed | 1 skipped (458), 68 files
pnpm test:integration → 81 passed (81), 15 files
pnpm build            → Tasks: 9 successful, 9 total (after B1 fix)
axe (real Chromium)   → 8/9 routes clean; all 8 new surfaces 0 violations
```

---

## Part 1 — Zero-Token Constraint Enforcement → **HELD**

| Probe | Command | Result |
|---|---|---|
| LLM SDK imports in new code | `grep -E 'openai\|anthropic\|generative-ai\|BEDROCK\|vertexai\|cohere\|mistral\|huggingface'` over every new dir | **0 matches** |
| Outbound network in new UI | `grep 'fetch(' apps/web/src/components/learn` | 4 call sites, all `${API_URL}/learn/...` (localhost default) |
| Outbound network in engine | `grep 'fetch(\|axios\|http.request' packages/simulation/src/learn` | **0 matches** |
| LLM hosts in API route | `grep 'openai\|anthropic\|axios\|https://' learn.routes.ts` | **0 matches** |
| Scheduler implementation | `session-timeline.ts` | Hand-coded Leitner: `LEITNER_INTERVALS_MS`, pure `reviewCard()`; no service call |
| Diff implementation | `structural-diff.ts` | Hand-coded recursive structural diff; no service call |

**Dependency graph of every new route:** `POST /learn/short-links` → Redis
(`learn:shortlink:*`); `GET /learn/short-links/:id` → Redis; `PUT/GET
/learn/progress` → Redis (`learn:progress:*`); `POST /learn/badges/issue` →
local `createHmac`; `GET /learn/badges/verify` → local `createHmac`. No route
reaches a third-party API.

**Verdict: the zero-token / no-LLM / no-paid-API constraint held without
exception.** The only dependency added by the batch is an internal workspace
link (`simulation → @the-visualizer/contracts`); see B1 for what that broke.

---

## Part 2 — Determinism Dependency Stress Test

### 2.1 Permalink round-trip — 5 domains × 3 fresh decode+replay cycles

Domains: `kafka` (original-8), `raft` (+ election-timeout randomness),
`llm-serving` (AI/LLM), `search-index` (newest 10-batch), `merkle-trees`.

```
ROUNDTRIP-OK kafka        hash={"brokers":{"1":  len=1145
ROUNDTRIP-OK raft         hash={"activeLeaderId  len=1725
ROUNDTRIP-OK llm-serving  hash={"batchScheduler   len=2618
ROUNDTRIP-OK search-index hash={"analyzer":{"st   len=1067
ROUNDTRIP-OK merkle-trees hash={"antiEntropy":n   len=1025
```

All three hashes per domain byte-identical. **PASS.**

### 2.2 Diff false-negative — single subtle config bit

```
DIFF-FN-OK flagged=["$.config.capacity"]
```
A one-unit capacity change (10 → 11) is flagged with an exact JSON path. **PASS.**

### 2.3 Diff false-positive — genuinely identical runs

```
DIFF-FP-OK zero-divergence
```
20 ticks of two identically-seeded runs → `structuralDiff` = `[]`,
`divergenceTicks` = `[]`. **PASS**, with a caveat noted in L3.

### 2.4 Long-session frame validity — 12 domains × 5 actions

```
TIMELINE-OK 60 entries all resolve
```
Every `seq` in a 60-entry session timeline resolves via `jumpTarget` to the
expected `{domainId, frameRef}`; out-of-range returns `null`. **PASS.**

### 2.5 ⚠ Finding M4 — the round-trip test did not actually prove fidelity

Discovered via mutation testing (Part 8, M3): injecting `.slice(0, -1)` into the
codec (dropping every last event) **passed the Part 2 round-trip test
unchanged** (`Tests 8 passed`), because the test compared two replays to each
other — a systematically truncated codec is self-consistent.

**Fixed in this audit** by adding a committed fidelity test to
`learn-determinism.test.ts` that asserts the last tick is consumed and that
dropping it changes the final state. Re-running the same mutation against the
new test:

```
AssertionError: kafka: last tick must be consumed: expected 39 to be 40
```

The existing committed suite already caught the mutation via `finalTick`, so the
product was never at risk — but the Part 2 methodology as specified was
insufficient, and now it is not.

---

## Part 3 — Permalink Security → **PASS** (one Low)

### 3.1 Fuzz decode — 10 malformed inputs, no throws, all rejected
```
FUZZ-wrong-types:   rejected=true      FUZZ-negative-tick: rejected=true
FUZZ-oversize-events (501): rejected=true   FUZZ-bad-seed:  rejected=true
FUZZ-bad-version:   rejected=true      FUZZ-huge-string (400KB): rejected=true
FUZZ-truncated-b64: rejected=true      FUZZ-not-json-b64: rejected=true
```
Promoted to a durable regression test (`permalink-security.test.ts`, 12 cases).

### 3.2 Wrong-domain / cross-domain events
```
FUZZ-unknown-domain: replay throws cleanly
FUZZ-cross-domain: survived, violations=0
```
An unknown `domainId` throws a clean `Unknown domain` error at replay; foreign
event types (`RAFT_REQUEST_VOTE` fed to the Kafka reducer, `__proto__` typed
events) neither crash nor pollute `Object.prototype`.

### 3.3 Short-link enumeration
```
ENUM ids=25 distinct=25 alphabet=62 space~=8.39e+17
ENUM sample=Bo9FlbAKtW,UxpJ_saTss,rjLXu5Pe-F,ds3wEE9xda,_Hc57xEGlU
```
`nanoid(10)` over a 62-char alphabet ≈ 8.4 × 10¹⁷ keyspace; no sequential or
date-like pattern. ID regex `/^[A-Za-z0-9_-]{10}$/` rejects traversal and
injection-shaped ids (`../../etc/passwd`, `learn:progress:someone` → 400).
**Non-enumerable.**

Access model: short links are **capability-style** — the ID is the secret. A
read returns only `{success, payload}` where `payload` = `{v, domainId, seed,
events}` (verified: `CAPABILITY keys=["payload","success"]`). No user data, no
PII. This is appropriate for shared simulation replays; it is not a private-data
channel and must not be used as one.

### 3.4 Size caps
```
OVERSIZE-501  status=400   (schema: events ≤ 500)
OVERSIZE-BODY status=413   (global bodyLimit 512KB)
```
**PASS** — caps enforced before Redis acceptance.

### 3.5 Untrusted-link blast radius
Decode + replay is pure local compute: no `fetch`, no mutation endpoint, no auth
context. A crafted permalink cannot reach an authenticated action, modify another
user's data, or escalate privilege. Verified by the absence of any network or
session dependency in `permalink-codec.ts`.

### Finding L2 — event payload has no per-value cap
`PermalinkEventSchema.payload` is `z.record(z.string().max(128), z.unknown())`.
Individual values are unbounded; the only backstops are the 200 000-char decode
cap and the 512 KB API body limit. **Low** (bounded), recommended fix: cap
per-value size and total payload bytes in the schema.

---

## Part 4 — Badge & Certification Anti-Forgery

### 4.1 Cryptographic guarantee → **PASS**
```
FORGE-guessed-secret   status=400
FORGE-tampered-track   status=400
FORGE-tampered-date    status=400
FORGE-badsig ""/zzzz/000…/aaaa…/!!!  → all 400
```
The badge is an HMAC-SHA256 over a canonical (key-sorted) JSON of
`{trackId, userId, earnedAt}`. Forging with a guessed secret fails; reusing a
valid signature after tampering the track or date fails; malformed signatures
fail. Verification recomputes the HMAC **server-side** and compares with
`timingSafeEqual` (length-guarded, constant-time). **Real cryptographic
guarantee, not an obscure URL.**

### 4.2 ⚠ Finding B2 (blocker for certification claims) — requirements are client-asserted
```
ENFORCE-progress-before=null
ENFORCE-fabricated-issue status=201
```
A freshly registered user with **no progress record** (`progress = null`) POSTs
`evidence: [{met:true}, …]` and receives a **signed badge (201)**. The server
never reads the stored progress record; it trusts `evidence[].met`.

The in-code trust model documents this ("self-asserted learning badges, not
proctored exams"), so it is not a cryptographic break — but the audit spec's
explicit bar ("rejected unless the actual underlying progress record supports
it") is **not met**. Anyone can mint a "Distributed Systems Fundamentals" badge
by calling one endpoint.

**Severity: High** *relative to the feature's user-facing claim*. A verifiable
signature on an unverified claim is worse than no signature, because it confers
false authority.

### 4.3 Finding L1 — badge signing key falls back to the JWT key
```
KEYS badge_signing_explicit=no   (BADGE_SIGNING_SECRET unset → uses JWT_SECRET)
```
`SIGNING_SECRET = process.env['BADGE_SIGNING_SECRET'] || JWT_SECRET`. A leaked
JWT secret therefore also forges badges, and vice-versa. **Low**; fix by
requiring a distinct key (same pattern already applied to JWT vs `SESSION_SECRET`).

---

## Part 5 — Composer: Verify Underlying Compositions

### 5.1 ⚠ Finding B3 (blocker for the Composer feature) — the compositions do not exist
```
COMPOSER presentational: calls_engine=false uses_timers=true
COMPOSER-SCENARIOS total=5 dangling=5 ->
  ai-serving-pipeline/llm-pipeline:lost-in-middle |
  social-feed-pipeline/kafka:leader-failover |
  fintech-checkout-pipeline/rate-limiter:boundary-burst |
  fintech-checkout-pipeline/distributed-lock:kleppmann-gc-pause |
  fintech-checkout-pipeline/transactions:coordinator-crash
```

- `ComposerCanvas` never imports or calls `DomainRegistry`/`reduceState`; it
  animates a trace with `setTimeout`. There is **no cross-domain composition
  engine, no state hand-off, no composition contract** — the `inputPayload` /
  `outputPayload` fields in `composite-pipelines.ts` are prose strings.
- The pre-existing `CompositePipelineModal.tsx` (510 lines) also has zero engine
  calls.
- All **5/5** `scenarioId` references in the pipelines dangle: none exist in any
  domain's `scenarioLibrary`.

This is exactly the failure the spec named: the Composer UI ships on top of
compositions that exist only as a planning document.

### 5.2 Composition-contract schema fuzz → **PASS**
`ComposedPipelineSchema` rejects null/empty/oversized/wrong-shaped input and
accepts a valid pipeline (`COMPOSER-SCHEMA fuzz ok`). Note: fuzzing a schema for
a contract that has no runtime consumer is necessary but not sufficient.

### 5.3 Composed-trace determinism → **cannot be tested as specified**
There is no composition state hand-off to test. Sequential per-domain reducer
application is reproducible (`COMPOSER-TRACE sequential-reproducible`), but this
proves nothing about composition, because none exists. **Honest gap**, contingent
on B3.

### 5.4 Additional dangling references (shipped content)
```
TRACK-SCENARIOS     dangling=1 -> ai-infra-foundations/llm-pipeline:lost-in-middle
CHALLENGE-SCENARIOS dangling=1 -> kafka:kafka-broker-crash
```
Both reference scenarios that no domain implements.

---

## Part 6 — Challenge Mode Integrity

### 6.1 ⚠ Finding M1 — answers and hints are client-side plaintext
```
CHALLENGE-BUNDLE hints_in_src=true explanation_in_src=true mitigation_in_src=true page_client=true
CHALLENGE-HINTGATE local_state=true server_gate=false
```
`challenge-bank.ts` (hints, `invariantId`, `explanation`, `mitigation`) is
imported by the `'use client'` `/challenges` page, so the full answer ships in
the client bundle. Anyone can read the target invariant and the complete
explanation via devtools or by downloading the JS. Hint pacing is a local
`useState(0)` counter with no server gate — trivially bypassed.

**Severity: Medium** (gameplay integrity, not a security vulnerability). If
answers must stay hidden until solved, they need a server-side gate
(auth-gated fetch on solve, or server-issued hints).

### 6.2 ⚠ Finding M2 — 4 of 30 challenge answer keys are fabricated
Harvested the engine's real invariant identifiers (114 of them via
`invariantName|ruleId` across `packages/simulation/src`):
```
CHALLENGE-INVARIANTS harvested=114 dangling=4 ->
  raft-ch1:RAFT_LEADER | redis-ch1:REDIS_STALENESS | rabbitmq-ch1:RABBIT_DLQ | storage-ch1:LSM_STALL
```
These four `invariantId` values match no invariant the engine emits
(real equivalents, where they exist: `RAFT_ELECTION_SAFETY`,
`REDIS_SLOT_COLLISION`, `AMQP_QUEUE_OVERFLOW`, `LSM_MEMTABLE_ORDER_VIOLATION`).
The remaining 26/30 resolve to real identifiers. **Medium** — the challenge
answer key is wrong for these four and would mislead a learner.

---

## Part 7 — Resource Caps on New Persisted State

### Local (client) caps → **PASS**
`learn-store.ts`: bookmarks `slice(-200)`, session timeline `slice(-500)`,
interviews `slice(-200)`, scenarios/invariants `slice(-500)`. Schema arrays cap
at 500. Bad shapes rejected (`CAP progress-bad-shapes rejected=400`).

### Server (account-synced) caps
```
CAP domains-3000 status=200   bodyBytes~=489844
CAP quiz-20000   status=413   bodyBytes~=1409095
CAP bookmarks-server-endpoint status=404
```
### ⚠ Finding M3 — no schema-level cap on record key counts
`UserProgressSchema.domains` and `DomainProgressSchema.quizAnswered` are
`z.record(...)` with **no `.max()`** on key count. A crafted `PUT /learn/progress`
with 3 000 fake domains (~490 KB) is accepted (200) and stored for 365 days. The
20 000-entry case is stopped only by the **global 512 KB body limit**, not by the
schema. Each user's single key is therefore ~512 KB worst-case; at scale that is
a material Redis footprint.

**Severity: Medium.** Fix: `z.record(...).refine(count ≤ N)` on both records
(e.g. 64 domains, 500 quiz entries) so the bound is explicit and independent of
the body limit. Bookmarks are correctly local-only (no server endpoint, 404).

---

## Part 8 — Mutation Testing for New Deterministic Algorithms

Three deliberate bugs injected, each test run, then reverted. Source restoration
verified by re-reading the mutated lines.

| # | Mutation | File | Caught? | Evidence |
|---|---|---|---|---|
| 1 | Leitner promotion `box + 1` → `box` | `session-timeline.ts:64` | **YES** | `AssertionError: expected 1 to be 2` |
| 2 | Structural diff skips nested objects (removed `walk`) | `structural-diff.ts:65` | **YES** | `expected [] to deeply equal [ '$.config.capacity' ]` (both suites) |
| 3 | Codec drops last event `.slice(0, -1)` | `permalink-codec.ts:80` | **Partial** | Caught by committed suite (`expected 24 to be 25`); **MISSED** by the Part 2 self-comparison test |

Mutation 3 exposed finding **M4** (Part 2.5). After adding the committed
fidelity test, re-running mutation 3 produces:
```
AssertionError: kafka: last tick must be consumed: expected 39 to be 40
```
All three mutations reverted; `session-timeline.ts:64`, `structural-diff.ts:65`,
and `permalink-codec.ts:80` confirmed restored to original.

---

## Part 9 — Accessibility & Standard Reproduction Pass

### 9.1 axe-core over new surfaces (real Chromium via Playwright)
The existing `scripts/run-axe-core-audit.mjs` uses JSDOM (`runScripts:
'outside-only'`) and cannot execute client-rendered React, which is what every
new page is. A browser-driven scan was written (`apps/web/axe-learn-audit.mjs`).

Before fix:
```
AXE /                violations=1 serious=1 color-contrast[serious]x4
AXE /quizzes         violations=1 serious=1 color-contrast[serious]x1
AXE /composer        violations=1 serious=1 color-contrast[serious]x2
AXE-SUMMARY routes=9 total_serious=3
```
Root cause: `color:#64748b` (slate-500) on dark backgrounds = **4.23:1**, just
under the 4.5:1 AA threshold. Fixed by raising muted text to `#94a3b8`
(slate-400, ≈7:1) across the 7 new components that used it.

After fix:
```
AXE /progress /quizzes /interview /badges /badges/verify /compare /composer /challenges → all clean
AXE-SUMMARY routes=9 total_serious=1   (the 1 is the pre-existing home route "/")
```
**All 8 new surfaces now have zero axe violations** — above the 95+ target. The
single remaining violation is on `/` (`connection-field-label`, a `.btn--ghost`
badge span) and predates this batch.

### 9.2 Standard reproduction
See §0. Zero regressions to the existing 28 domains (89 golden fixtures pass).

### 9.3 Entropy audit
```
grep Math.random  over apps/web/src          → 0 matches
engine learn modules (permalink-codec, structural-diff, session-timeline)
  grep Math.random|Date.now|performance.now|new Date → 0 matches
```
`Date.now()` appears only in `learn-store.ts` (UI metadata: `lastVisitedAt`,
`updatedAt`, bookmark ids, and the display-only `timestamp` on timeline
entries). None of these feed permalink encoding, diff computation, or
`frameRef` — the deterministic paths are clean. **PASS.**

---

## Findings, severity-ranked

| ID | Severity | Part | Finding | Status |
|----|----------|------|---------|--------|
| **B1** | **High** | build | Batch added `contracts` (ESM-only exports) as a runtime dep of `simulation` (CommonJS emit), breaking `next build` while typecheck/tests stayed green | **FIXED** |
| **B2** | **High** | 4 | Badge requirements are client-asserted; a fresh user with no progress mints a signed badge | **OPEN** |
| **B3** | **High** | 5 | Composer ships UI for compositions that do not exist at engine level (5/5 scenarioIds dangle, presentational only) | **OPEN** |
| M1 | Medium | 6 | Challenge answers + hints are client-side plaintext; hint pacing is client-only | OPEN |
| M2 | Medium | 5/6 | 4 fabricated challenge invariant IDs + 2 dangling scenario refs in shipped content | OPEN |
| M3 | Medium | 7 | No schema-level cap on `progress.domains` / `quizAnswered` key counts (512 KB body limit is the only backstop) | OPEN |
| M4 | Medium | 2/8 | Round-trip test proved self-consistency only; could not detect dropped events | **FIXED** |
| L1 | Low | 4 | Badge signing key defaults to the JWT signing key | OPEN |
| L2 | Low | 3 | Permalink event payload values unbounded (rely on body limit) | OPEN |
| L3 | Low | 2 | Structural diff has no explicit non-semantic-field exclusion list (safe today because all 28 domains are deterministic) | OPEN |

### Fixes applied during this audit
1. `packages/simulation/package.json` — added `"type": "module"`, aligning it
   with `contracts`/`api`/`ws-gateway` and unblocking the production build.
2. `packages/simulation/src/learn/learn-determinism.test.ts` — added a
   committed permalink fidelity test (M4).
3. `packages/simulation/src/learn/permalink-security.test.ts` — new durable
   adversarial regression suite (12 cases) promoted from Part 3.
4. 7 web components — muted text `#64748b` → `#94a3b8` (axe contrast).
5. `apps/web/axe-learn-audit.mjs` — new browser-driven axe scan over new surfaces.

---

## 🚫 Ship / No-Ship verdict

**The batch is NOT cleared for release as originally delivered**, because:

1. **B1 broke the production build.** `pnpm typecheck` and all 458 tests passed;
   `next build` failed with `Module not found: Package path . is not exported`.
   This is the single most important result of this audit: the batch's own
   verification suite was blind to a hard shipping blocker. B1 is **now fixed**
   and the full build passes 9/9 — but the process gap is real and should be
   closed by adding `pnpm build` (or at least `next build`) to CI as a required
   gate, since it already catches what unit/integration/typecheck do not.
2. **B2 must not ship as a "verifiable certification."** The signature is
   genuine, but it attests an unverified client claim. Either enforce track
   requirements server-side against the stored progress record, or relabel the
   badge as an explicitly self-asserted learning record (the code comment already
   says this; the UI does not).
3. **B3 must not ship as "Build Your Own System."** The Composer is a
   presentational trace animation; no composition runs. Ship it behind a
   "preview / coming soon" label or hold it until at least one composition pair
   is implemented and mutation-tested at the engine level.

**Cleared to ship now** (conditionally, after the above gating): Features 1
(progress), 2 (session history), 3 (bookmarks), 4 (permalinks — crypto-fuzz and
adversarially validated), 5 (quiz), 6 (interview), 8 (compare), 10 (challenge
mechanics). Badges may ship **only** relabeled as self-asserted. Medium findings
M1/M2/M3 should be scheduled immediately post-launch (M2 ideally before, since
it is a factual error in learner-facing content); Low findings L1–L3 are backlog.
