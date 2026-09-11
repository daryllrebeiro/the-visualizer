# New Features Batch 1 — Build Report

> Zero-token, non-LLM batch: progress, session history, bookmarks, permalinks,
> quizzes, interview mode, badges, compare mode, composer, challenge mode.
> Date: 2026-09-10. Author: implementation session.

## Verification (all green at time of writing)

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `pnpm typecheck` (recursive, all workspaces) | Clean, 0 errors |
| Determinism | `pnpm test:determinism` | 89/89 pass |
| Unit | `pnpm test:unit` | 444 pass, 1 skipped (pre-existing skip), 67 files |
| Integration | `pnpm test:integration` | 81/81 pass, 15 files |
| Lint | per-package `lint` on touched workspaces | 0 errors; warnings only (pre-existing style level). One pre-existing API parsing error on untouched `cors.test.ts` (tsconfig project-service include gap, not introduced here) |
| Zero-LLM audit | grep over every new file for `openai\|anthropic\|gpt-\|claude\|bedrock\|vertex\|cohere\|mistral\|huggingface\|OPENAI_\|ANTHROPIC_` | Zero matches |
| Determinism hygiene | grep over `packages/simulation/src/learn` for `Math.random\|Date.now\|fetch(` | Zero matches |
| Dependencies | `git diff` on manifests | Only addition: `simulation → @the-visualizer/contracts` (`workspace:*`). No external, paid, or LLM dependency anywhere in the batch |

New tests added (all passing): `learn-schemas.test.ts` (contracts fuzz, 3),
`learn-determinism.test.ts` (7 engine determinism incl. permalink byte-identity,
zero-diff identical runs, RL-3 flaw-state replay, timeline index, Leitner
transitions), `learn-content.test.ts` (5 content-bank validations),
`learn.routes.test.ts` (6 API integration: short-link roundtrip, auth gating,
progress sync, badge issue/verify/forgery rejection).

## Per-feature delivery map

| # | Feature | Data model / schema | UI component(s) | Determinism test |
|---|---------|--------------------|-----------------|------------------|
| 1 | Progress / Mastery Map | `UserProgress`, `DomainProgress` (`contracts/learn`); `learn-store.ts` (localStorage-first, zod-validated load, server sync helpers) | `ProgressDashboard.tsx`, `/progress` route, 🎓 Learn header entry | Schema fuzz |
| 2 | Session history | `SessionTimelineEntry`; `SessionTimelineBuilder` (engine); `subscribeLearnActions` bridge in `simulation-store.ts` + 3 choke-point hooks in `VisualizerApp.tsx` (switch, scenario, + store step/action/load/reset) | `SessionHistoryPanel.tsx` (collapsible, jump), mounted on `/progress` | Timeline index + jump-target test |
| 3 | Bookmarks | `Bookmark`; learn-store add/remove (persisted, validated) | `BookmarksPanel.tsx`, `createBookmark()` factory; panel on `/progress` | Schema fuzz |
| 4 | Permalinks | `PermalinkPayloadV2` (`domainId+seed+events`, ≤500); `permalink-codec.ts` (base64url, same `seed+events→state` path as the WS runner); API short links (`learn:shortlink:*`, 30d TTL) | `ShareScenarioButton.tsx` (inline `?p=` under 6000 chars, else short link), `resolveIncomingPermalink()` | Replay-twice byte-identical (rate-limiter ×25, raft ×10); untrusted-input null matrix |
| 5 | Quiz & flashcards | `QuizQuestion`, `SpacedRepetitionCard`; `quiz-banks.ts` (90 hand-authored Qs, 28 domains ×3 + rag/agents bonus); Leitner engine (`reviewCard`, `dueCards`) | `QuizMode.tsx` (MC + flip, due-only filter), `/quizzes` route | Leitner promote/reset/due-order test |
| 6 | Interview mode | `InterviewScript` (+steps/rubric); `interview-scripts.ts` (6 scripts, single-domain) | `InterviewMode.tsx` (timer, hints, rubric self-score), `/interview` route, completion recorded to progress | Content validation |
| 7 | Badges | `CurriculumTrack`, `BadgeAward`; `curriculum-tracks.ts` (3 tracks); HMAC-SHA256 sign/verify API (`/learn/badges/issue`, `/learn/badges/verify`) | `/badges` (requirement checklist, claim flow), `/badges/verify` (public, no account) | Forgery-rejection integration test |
| 8 | Compare mode | `CompareRunConfig`; `structural-diff.ts` (capped, cycle-safe) + `divergenceTicks` | `CompareShell.tsx` (dual headless engines, shared scrubber, divergence jump list, field diffs), `/compare` route | Identical configs → zero divergent fields; exact-path mutation test |
| 9 | Composer | `ComposedPipeline`; `supportedPairs()` (pipeline consecutive stages + 4 specified pairs); `COMPOSITE_PIPELINES` reused as-is | `ComposerCanvas.tsx` (node canvas, animated trace, domain deep-links), `/composer` route | Schema fuzz |
| 10 | Challenge mode | `Challenge`, `ChallengeAttempt`; `challenge-bank.ts` (30 challenges, all 28 registered domains + rag/agents bonus) | `ChallengeMode.tsx` (hints unlock, solve/give-up, reveal + mitigation), `/challenges` route | Boundary-burst replay reaches RL-3 flaw flag, byte-identically |

API additions (`apps/api/src/routes/learn.routes.ts`, mounted at `/learn`): short-link
mint/resolve, progress GET/PUT (auth, Redis `learn:progress:*`, 365d TTL),
badge issue/verify. Trust model documented in code: badges are self-asserted
learning records signed by the platform (verifiable, not proctored).

## Honest deviations and limitations

1. **Compare canvases → state inspectors.** The spec asked for side-by-side canvases;
   domain visualizers require bespoke interactive callback props, so a uniform
   platform capability renders generic state inspectors + divergence UI instead.
   No per-domain integration work was needed, per the spec's uniformity goal.
2. **Bonus banks for `rag`/`agents`.** These engine modules exist but are not in the
   28-domain registry; their 6 quiz questions + 2 challenges ship inert (never
   matched by registry-driven UI) and activate automatically if registered.
3. **RL-3 is a pedagogical flaw by design.** The registry wrapper deliberately
   withholds `isPedagogicalFlaw` violations from halting results, so the feature-10
   test asserts the engine reaches the `fixedWindowBoundaryBurstDetected` state
   flag (byte-identically) rather than a violations entry.
4. **Timeline capture points.** Switches, scenario loads, and zustand-store
   step/action/reset events are captured; per-domain chaos buttons inside
   `VisualizerApp`’s local state loops (dozens of handlers) are not individually
   instrumented — the bridge API (`subscribeLearnActions`) is ready for them.
5. **Badge trust.** See code comment: HMAC proves platform mint, not invigilation.
6. **No domain logic touched.** All 28 domains’ reducers, checkers, and scenarios
   are unmodified; the batch is additive (`contracts/learn`, `simulation/learn`,
   `components/learn|compare|composer`, new routes, one new API router, additive
   store listeners + 3 VisualizerApp hook lines).
