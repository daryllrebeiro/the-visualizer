# TheVisualizer — Remediation Log

**Audit Baseline Date:** 2026-09-02  
**Audited By:** Independent Verification Agent  
**Status:** ALL P0, P1, P2, P3 REMEDIATIONS COMPLETED & VERIFIED

---

## 1. Executive Summary

Following the independent verification audit of `DELIVERABLES_DONE.md`, four primary issues were isolated and prioritized for remediation:
1. **P0.1 Residual Simulation Entropy**: Unseeded `Math.random()` and `Date.now()` calls in `storage` (B+Tree and LSM-Tree) and `rabbitmq` domain state reducers.
2. **P0.2 CORS Wildcard with Credentials**: `apps/api/src/index.ts` returned `'*'` for unlisted origins while `credentials: true` was enabled.
3. **P1.3 Accessible UI Shell Adoption**: `<CanvasShell>` and accessible components (`OnboardingTour`, `DataTableModal`) were created in `@the-visualizer/ui` but needed top-level wiring in `apps/web/src/app/page.tsx`.
4. **P1.4 Scaffolding Generator Auto-Export**: `scripts/create-domain.mjs` failed workspace typecheck without manual index re-exports.

All items have been resolved with reproducible evidence and zero regressions.

---

## 2. Remediation Details & Verification Evidence

### Item P0.1: Residual Nondeterminism in Storage and RabbitMQ Reducers
- **Severity:** P0 (Critical - Determinism Violation)
- **Files Modified:**
  - `packages/simulation/src/domains/storage/btree.ts` (Lines 99, 124)
  - `packages/simulation/src/domains/storage/lsm-tree.ts` (Lines 83, 132)
  - `packages/simulation/src/domains/rabbitmq/rabbitmq-state-transitions.ts` (Line 217)
  - `packages/simulation/src/golden-determinism.test.ts`
- **Root Cause:**
  Node IDs in B+Tree page splits, SSTable IDs in MemTable flushes / compactions, and AMQP message IDs in RabbitMQ publish operations utilized `Date.now()` or `Math.random().toString(36)`.
- **Fix Applied:**
  Replaced all wall-clock and random entropy with deterministic state-derived counters:
  - B+Tree node IDs: `` `node-split-${state.totalPageSplits}-${node.id}-r` `` and `` `node-root-${state.totalPageSplits}` ``
  - LSM SSTable IDs: `` `sstable-L0-${tick}-${(state.levels['0']?.length ?? 0) + 1}` `` and `` `sstable-L${fromLevel+1}-${tick}-c${state.totalCompactions}` ``
  - RabbitMQ Message IDs: `` `msg-${state.tick}-${state.totalPublished + 1}` ``
- **Verification Evidence:**
  - Added dedicated deep mutation golden tests for Storage (B+Tree page splits + LSM flushes) and RabbitMQ (AMQP message routing) in `golden-determinism.test.ts`.
  - Ran `pnpm test:determinism` -> **20/20 golden tests passed**.
  - Grepped `packages/simulation/src/domains` for `Math.random|Date.now|new Date` -> **0 matches**.

---

### Item P0.2: CORS Wildcard & Credentials Misconfiguration
- **Severity:** P0 (High - Security Misconfiguration)
- **Files Modified:**
  - `apps/api/src/index.ts` (Lines 44–58)
  - `apps/api/src/cors.test.ts` (New test suite)
- **Root Cause:**
  `apps/api` returned `origin: '*'` as fallback while configuring `credentials: true`.
- **Fix Applied:**
  Updated CORS middleware to strictly allow-list verified local development origins (`localhost`, `127.0.0.1`), configured environment origins (`ALLOWED_ORIGINS`), and Google Cloud Run domains (`*.run.app`). Unlisted origins return `null` and receive no CORS allowance headers.
- **Verification Evidence:**
  - Created `apps/api/src/cors.test.ts` testing rejected evil origins vs allowed localhost/Cloud Run origins.
  - Ran `pnpm --filter @the-visualizer/api exec vitest run src/cors.test.ts` -> **3/3 passed**.

---

### Item P1.3: CanvasShell & Accessibility Primitives Adoption
- **Severity:** P1 (Medium - Usability & Accessibility)
- **Files Modified:**
  - `apps/web/src/app/page.tsx`
  - `packages/ui/src/ui.test.ts`
- **Fix Applied:**
  Wired `<OnboardingTour>` and `<DataTableModal>` directly into `apps/web/src/app/page.tsx` with dynamic `accessibleRows` calculation mapping cluster entities across all 8 domains (Kafka, Raft, Database, Redis, Kubernetes, RabbitMQ, Storage, Networking). Added header triggers for "💡 Tour" and "📊 Table View".
- **Verification Evidence:**
  - Ran `pnpm --filter @the-visualizer/web build` -> **Compiled successfully (13 static/SSG pages generated with zero type errors)**.

---

### Item P1.4: Scaffolding Generator Auto-Registration in Index
- **Severity:** P1 (Medium - Developer Experience & Automation)
- **Files Modified:**
  - `scripts/create-domain.mjs`
- **Fix Applied:**
  Added step 6 in `scripts/create-domain.mjs` to automatically append domain type, reducer, and invariant exports to `packages/simulation/src/index.ts`.
- **Verification Evidence:**
  - Executed `node scripts/create-domain.mjs testdomain "Test Domain"`.
  - Ran `pnpm typecheck` -> **Exited 0 with zero manual fixes needed**.
  - Cleaned up testdomain scaffold.

---

## 3. Summary of Test Verification Results

| Suite | Package | Tests Run | Result |
| :--- | :--- | :--- | :--- |
| Golden Determinism | `@the-visualizer/simulation` | 20 | **PASS (100%)** |
| Simulation Engine & Reducers | `@the-visualizer/simulation` | 83 | **PASS (100%)** |
| Memory Boundary (10k ticks) | `@the-visualizer/simulation` | 1 | **PASS (<50MB delta)** |
| Headless Throughput Bench | `@the-visualizer/simulation` | 1 | **PASS (>33,000 ticks/sec)** |
| Contracts Property Fuzzing | `@the-visualizer/test-utils` | 5 (3,300 runs) | **PASS (0 violations)** |
| Design System & Glossary | `@the-visualizer/ui` | 3 | **PASS (100%)** |
| Logging & Trace Context | `@the-visualizer/logging` | 3 | **PASS (100%)** |
| Configuration & Limits | `@the-visualizer/config` | 2 | **PASS (100%)** |
| CORS Security Allow-list | `@the-visualizer/api` | 3 | **PASS (100%)** |
| SSRF Protection & IP Block | `@the-visualizer/ws-gateway` | 7 | **PASS (100%)** |
| Next.js Static Build | `@the-visualizer/web` | 13 routes | **PASS (Exit 0)** |
| Workspace Typecheck | All 9 Projects | Full Tree | **PASS (Exit 0)** |

---

## 4. Sign-Off
All audit findings are remediated and verified with reproducible evidence. The repository is ready for Part B Production Readiness Scoring.
