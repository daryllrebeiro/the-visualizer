# TheVisualizer — Security Audit & Threat Model

> Audit date: 2026-09-10. Method: read-only source inspection of the live working
> tree (includes uncommitted Phase-1 hardening), five parallel audit tracks plus
> direct verification of every High-severity claim below against current code.
> Every finding cites `file:line` as observed — re-verify before quoting elsewhere.
>
> Scope: `apps/api` (Hono 4 + Drizzle + PG16), `apps/ws-gateway` (`ws` + Redis 7),
> `apps/web` (Next.js 15), `packages/*`, `docker-compose.yml`, `Dockerfile` +
> `infrastructure/docker/*`, `infrastructure/terraform/main.tf`, `cloudbuild.yaml`,
> `.github/workflows/*`, `turbo.json`. Hosting: Cloud Run + Compose for local dev.
> No live traffic was available; runtime behavior (headers on the wire, deployed
> `NODE_ENV`, secret values) is flagged, not asserted.

## 1. Executive Summary

**Overall risk: HIGH.** No unauthenticated remote-code or mass-breach path was found —
input validation, RBAC on REST resources, JWT algorithm pinning, and error hygiene
are genuinely solid. The risk concentrates in three places: (a) session/token
lifecycle flaws that survive logout and let refresh tokens mint WS access,
(b) a gateway that authorizes rooms by first-claimer squatting with no org or
topology check and no cap on room/timer creation, and (c) secrets committed to
tracked files plus a deterministic Terraform DB password. None requires exotic
skill; all are reachable with a valid login or a repo clone.

**Top 3 immediate priorities:**

1. **Close the session-lifecycle holes (V01–V04).** Logout cannot see the
   `refresh_token` cookie (Path mismatch), so "logout" leaves a 7-day credential
   alive; `/ws-ticket` mints WS tickets from *any* valid JWT type without checking
   the user still exists; ticket consume and refresh rotate are non-atomic
   GET-then-act races. Fix: unify cookie paths, require `type==='access'` +
   live user lookup on mint, atomic `GETDEL`/Lua consume.
2. **Authorize and bound the gateway (V05–V08).** Any authenticated socket can join
   any `roomId`, receive its simulation snapshot, and squat `room:<id>:owner` for
   24h to lock the victim out; room/timer/Redis-key creation is uncapped, and the
   `definition` jsonb column accepts unbounded nested JSON that is re-parsed on
   every tick. Fix: bind tickets to room/org, verify membership in `joinRoom`,
   cap rooms per user, cap `definition` depth/size.
3. **Purge committed secrets and fix secret plumbing (V09–V12).** `docker-compose.yml`
   carries dev passwords and Grafana `admin/admin`; `main.tf:90` builds the DB
   password deterministically from the environment name and injects it into a
   plaintext env var; prod Redis is `redis://` with no AUTH/TLS. Fix: `${VAR:?}`
   substitution, `random_password` + secret references, `rediss://` + AUTH.

## 2. Prioritized Vulnerabilities Table

| ID | Severity | Category | Component / File | Vulnerability | Impact |
|----|----------|----------|------------------|---------------|--------|
| V01 | High | Auth/Session | `apps/api/src/routes/auth.routes.ts:147,364,375` | Logout blind to `refresh_token` cookie (Path `/auth/refresh` vs `/auth/logout`); cookie never cleared | 7-day credential survives "logout" on shared machines; refresh → fresh access indefinitely |
| V02 | High | Auth/Session | `apps/api/src/routes/auth.routes.ts:316-358` | `/ws-ticket` mints from any valid JWT type, no `type` check, no user lookup | Stolen refresh token mints WS tickets forever; deleted users mint tickets |
| V03 | High | Auth/Session | `packages/contracts/src/auth/ws-ticket-store.ts:40-59`, `apps/api/src/routes/auth.routes.ts:256-281` | Ticket `GET`+`DEL` and refresh check-then-revoke are non-atomic races | Double-spend of single-use ticket / double-mint from one refresh across replicas |
| V04 | High | Auth/Session | `apps/api/src/routes/auth.routes.ts:399-414` | `dev-login` get-or-create by email on any non-prod env | Staging account takeover incl. admin emails, no password |
| V05 | High | AuthZ/Gateway | `apps/ws-gateway/src/gateway/ws-server.ts:337-406`, `room-manager.ts:99-151` | No org/topology auth on `JOIN_ROOM`; first-claimer ownership; full snapshot served | Cross-user snapshot read; 24h owner squat = victim lockout DoS |
| V06 | High | DoS/Validation | `room-manager.ts:99-151`, `runner.ts:125-197`, `contracts/.../websocket/index.ts:101-105` | Unbounded `roomId`, uncapped sessions/timers/subs; leave never stops runner | Authenticated event-loop collapse via 10k rooms × 10 Hz timers |
| V07 | High | DoS/Validation | `apps/api/src/routes/topology.routes.ts:19`, `schema.ts:69` | `definition` jsonb unbounded (keys/depth/bytes); re-parsed per tick | 512 KB nested bomb → per-tick CPU/memory DoS for every room member |
| V08 | High | Rate-limit | `apps/api/src/middleware/rate-limiter.ts:68-71`, `:78-95` | Fail-open on Redis outage; IP from spoofable headers, no trusted-proxy check | Outage kills all throttling; one header rotates buckets → login-bucket bypass |
| V09 | High | Secrets | `infrastructure/terraform/main.tf:90,187,191,224` | Deterministic DB password from env name; injected into plaintext env; Redis `redis://` no AUTH/TLS | State/console read = full DB; passive VPC observer sniffs tickets, revocation keys, creds |
| V10 | Medium | Secrets | `docker-compose.yml:5,22,51-54,85-87,151-152` | Committed dev passwords; Grafana `admin/admin` on `0.0.0.0:3003`; Prometheus on `0.0.0.0:9090` | Repo read = credential read; LAN-reachable observability with default creds |
| V11 | Medium | Network | `apps/api/src/index.ts:80-103` | CORS reflects any `localhost:` origin with `credentials:true`, all envs | Local process / DNS-rebind reads authenticated API responses in victim browser |
| V12 | Medium | Network | `apps/ws-gateway/src/gateway/ws-server.ts:196-218` | Origin check skipped when header absent; `localhost:*` allowed in prod | Non-browser clients bypass origin policy entirely |
| V13 | Medium | Auth/Session | `apps/api/src/routes/auth.routes.ts:383-396` | `/revoke` accepts unbounded arbitrary string, no ownership check | Redis junk-fill (512 KB keys × 7d); session-DoS oracle on seen tokens |
| V14 | Medium | Auth/Session | `apps/api/src/middleware/auth.middleware.ts:71-84` | Degraded mode synthesizes session from JWT claims on DB error | Valid-token holders (incl. disabled users) regain access during any DB blip |
| V15 | Medium | AuthZ | `topology.repository.ts:13-20,198-205`, `topology.routes.ts:112-145` | Any MEMBER can flip PRIVATE→PUBLIC; share URL returns full row, no expiry | Compromised member exfiltrates org topology with one PUT + link |
| V16 | Medium | Auth/Session | `apps/api/src/routes/auth.routes.ts:23-28` | Strict bucket on login only; register/refresh/ws-ticket/revoke/dev-login share global 60/min | scrypt CPU burn + DB fill via register loop; ticket-mint hammering |
| V17 | Medium | Validation | `contracts/.../websocket/index.ts:112-117`, `ws-server.ts:460-489`, `runner.ts:244-257` | `INTENT_DOMAIN_ACTION` payload `z.unknown`, action free string, piped to reducers | Malformed/huge payloads reach 28 reducers; `__proto__` keys into records |
| V18 | Medium | Validation | `ws-server.ts:460-465` | Payload spread overwrites envelope `type`/`id` after gate checks | Intent retyping confusion; any member can `INTENT_RESET` shared room (no owner check) |
| V19 | Medium | Validation | `ws-server.ts:187,299`, `runner.ts:326,354` | 1 MB frames, `unpack`/`JSON.parse` before schema, deep-clone + `fast-json-patch.compare` per tick | 20 msg/s × 1 MB per conn → Redis growth + tick CPU spike; broadcast amplification |
| V20 | Medium | Observability | `packages/logging/src/metrics.ts:28-33`, `room-manager.ts:150`, `ws-server.ts:308`, `runner.ts:156` | Unbounded label values: `room=<roomId>`, `type=<raw>`, `invariant=<message>` | Attacker-chosen labels → unbounded series → Prometheus OOM |
| V21 | Medium | Logging | `auth.routes.ts:90,152,215`, `runner.ts:577-579` | Email PII + raw attacker snippet logged; redactor covers only password/token/secret | Log store becomes PII store; log-injection/forgery |
| V22 | Medium | Supply chain | `pnpm-lock.yaml` (`ws@7.5.13`, `nanoid@3.3.18`, deprecated `prom-client`, stale `fast-json-patch`) + no blocking `pnpm audit` job | EOL/vulnerable transitive deps ride silently; wire-critical unmaintained lib | Known-class DoS/proto-pollution exposure with no gate |
| V23 | Medium | CI/Build | `.github/workflows/*` (no `permissions:`, `trufflehog@main`, `trivy-action@master`), `cloudbuild.yaml` (floating builders, `--allow-unauthenticated`) | Broad token; mutable action refs; unsigned deploy path | Supply-chain injection → malicious deploy |
| V24 | Medium | Build | `.dockerignore:1-13`, `Dockerfile:31`, `turbo.json:8` | Bare `.env` not ignored (baked into builder layer); `.env*` in turbo inputs poisons cache keys | Local secrets in image layers/cache; secret-derived cache audit trail |
| V25 | Medium | Secrets | `apps/api/src/config.ts:8`, `ws-gateway/src/config.ts:19`, `.env:20-21` | `JWT_SECRET ?? SESSION_SECRET` fallback live outside prod; shipped placeholders pass length check, identical | Single-key compromise forges every token type; dev runs on publicly known string |
| V26 | Low | Network | `apps/api/src/index.ts:53`, `:110-131`; `ws-gateway/src/index.ts:28-75` | Bare `secureHeaders()` (HSTS unverified on API); `/health` `/ready` `/metrics` + WS catch-all 200 unauthenticated | Fingerprinting; metrics/DB-liveness oracle; compliance gap |
| V27 | Low | Validation | `ws-server.ts:342-354`, `room-manager.ts:120,137,142` | JOIN failure echoes `err.message` (`belongs to another user`, `locked to domain Y`) | Private room-ID / domain-binding oracle |
| V28 | Low | Crypto | `apps/api/src/utils/password.ts:10,25` | scrypt at Node defaults (N=16384), no pepper, unversioned format | Offline dump cracked ~4-8× faster than OWASP guidance; dump alone suffices |
| V29 | Low | Logging | Audit-event gaps: refresh success/reuse, ticket mint/consume, share CRUD, role changes | Blind spots for incident response |
| V30 | Low | Secrets | `.gitignore:24-29` misses `.env.production` / `.env.staging` | `git add -A` can silently stage real secrets |

## 3. Deep-Dive Findings

### Domain 1 — Attack Surface & Network Architecture

**V11 — CORS reflects `localhost:` with credentials in all envs.**
`apps/api/src/index.ts:83-89` returns any `http://localhost:*` origin before the
`ALLOWED_ORIGINS` check, with `credentials:true` (`:102`). Root cause: dev
convenience placed ahead of the allowlist with no `NODE_ENV` gate. Attack: any
process on the victim's machine (or DNS-rebind to `localhost`) serving
`http://localhost:<port>` reads authenticated API responses via the victim's
browser. Fix: gate the localhost branch on `NODE_ENV!=='production'`; in prod,
allowlist only.
```typescript
// before
if (origin.startsWith('http://localhost:')) return origin;
// after
if (process.env.NODE_ENV !== 'production' && isLocalhost(origin)) return origin;
```

**V12 — WS origin check skipped when the header is absent.**
`ws-server.ts:196` wraps the entire check in `if (origin)`. Non-browser clients
(curl, k6, botnets) send no `Origin` and skip policy entirely; `localhost:*` is
accepted unconditionally even in prod. Authentication still applies, so this is
defense-in-depth, not a bypass — but cookie-based WS auth without an origin
policy is CSRF-adjacent. Fix: require `Origin` for browser-indicative handshakes
and gate the localhost branch on non-prod.

**V26 — Unauthenticated ops endpoints + WS catch-all.**
`/health` `/ready` `/metrics` share the public API listener (`index.ts:110-131`);
the gateway answers 200 to *any* path (`index.ts:28-75`). Fix: bind metrics to an
internal port or bearer-guard; return 404 on unknown WS paths; keep only LB
`/health` public.

### Domain 2 — Authentication, Authorization & Session Management

**V01 — Logout leaves the refresh credential alive.**
`refresh_token` is set with `Path: /auth/refresh` (`:147`), but `/logout` runs at
`/auth/logout`, so `getCookie(c,'refresh_token')` (`:364`) is always empty in the
browser flow and `deleteCookie` only clears `session_token` (`:375`). On a shared
machine, "logout" leaves a 7-day refresh cookie behind → `POST /auth/refresh`
mints fresh access indefinitely. Fix: set both cookies `Path:'/'`, accept refresh
via body on logout, revoke-then-clear both with matching paths.

**V02 — `/ws-ticket` trusts any valid JWT type, never checks the user.**
`:340-349` verifies signature then mints from `payload.id/email` with no
`type==='access'` check and no `getUserById`. A stolen 7-day refresh token (which
API routes correctly reject per `auth.middleware.ts:50`) mints 30s WS tickets
indefinitely; deleted users mint tickets. Fix: require `type==='access'`,
`getUserById` + 401, bind the ticket to the parent `jti`.

**V03 — Single-use and rotation are check-then-act races.**
`consumeTicket` does `GET` then `DEL` (`ws-ticket-store.ts:44-46`); refresh does
`isRevoked` (`:256`) → … → `revoke` (`:281`) with awaits between. Two concurrent
consumers both see the ticket; two concurrent refreshes both mint. Fix: atomic
`GETDEL` (Redis ≥6.2) or Lua compare-and-delete for tickets; Lua
`EXISTS?fail:SET revoked` before minting on refresh, and revoke the whole token
family on reuse detection.

**V05 — Rooms have no org/topology authorization.**
`JOIN_ROOM` trusts client `roomId/domainId` (`ws-server.ts:337-338`); ownership is
first-claimer with a 24h Redis key (`room-manager.ts:117-127`, itself a GET-then-SET
TOCTOU); the full simulation snapshot is served to whoever joins (`:393-404`).
Attacker joins `room-1`/guessed UUID first → reads victim state; or pre-squats
`room:<id>:owner` → victim gets `Access denied` DoS. Cross-node is worse: the
`else` branch (`:134-144`) checks only the local map, skipping Redis entirely.
Fix: bind tickets to `{userId, orgId, roomId}` at mint; verify membership inside
`joinRoom` before serving cached topology; `SET … NX` for claims; remove the
`public-/demo-/default` bypass or make such rooms read-only.

**V13/V04/V14/V16 — Revoke, dev-login, degraded mode, buckets.**
`/revoke` revokes any presented string with no ownership check and no max length
(`auth.routes.ts:383-396` + `revokeSchema`); fix with `verify` + caller-match +
`max(2048)`. `dev-login` is email-claimable on any non-prod env (`:399-414`); fix
with an explicit `ALLOW_DEV_LOGIN` flag defaulting off. Degraded mode now
correctly denies deleted users, but still synthesizes sessions from claims on DB
error (`auth.middleware.ts:71-84`); fail closed or bound a 60s grace with alert.
Only login has a strict bucket (`:23-28`); extend to
register/refresh/ws-ticket/revoke/dev-login.

### Domain 3 — Input Validation, Injection & Sanitization

**V07 — Unbounded `definition` jsonb.**
`z.record(z.string(), z.unknown())` (`topology.routes.ts:19`) with only the
512 KB body cap as defense. 512 KB of deep nesting or 15k keys passes Zod, lands
in jsonb, then is `JSON.parse`d on every `JOIN_ROOM` and cloned per tick —
CPU/memory DoS for all room members, planted by any member. Fix: `superRefine`
caps (keys ≤ 500, key length ≤ 128, depth ≤ 10, serialized ≤ 200 KB), reject
`__proto__`/`constructor`/`prototype`, per-`domainId` shapes where possible.

**V06 — Unbounded room/session creation.**
`roomId` allows 255 arbitrary chars; every `JOIN_ROOM` starts a 10 Hz interval
that `leaveRoom` never stops (reaper deletes Redis keys, not the runner). 10k
unique rooms at 20 msg/s (under the free bucket) collapses the event loop. Fix:
charset allowlist, caps (e.g. 1000 global / 20 per user), `stopSession` on empty/
reap, `JOIN_ROOM` per-connection throttle.

**V17/V18/V19 — Intent pipeline.**
`INTENT_DOMAIN_ACTION` payload is `z.unknown()` piped straight to reducers;
envelope fields lose to payload spread (`{id, type, ...payload}`), letting a
member retype intents and `INTENT_RESET` any shared room with no owner check.
1 MB frames decode before schema; per-tick clone+diff is attacker-influenced.
Fix: per-domain action allowlists + schemas at the gateway, envelope-wins
spread, OWNER-gated reset, 64 KB `maxPayload`, per-room intent caps.

**Verified absent:** SQL injection (only bound `${}`/column refs), path traversal
(no user-input file serving), XSS (`dangerouslySetInnerHTML`/`postMessage`
absent; React-escaped sinks), ReDoS (linear regexes), SSRF (no server-side fetch
of user URLs; `ssrf.ts` is dead code with residual bypass classes — harden before
first use).

### Domain 4 — Secrets Management & Cryptography

**V09 — Terraform deterministic password + plaintext transport.**
`main.tf:90` derives the DB password from the environment name; `:187` interpolates
it into a plaintext `DATABASE_URL` env value; `:191,224` use `redis://` with no
AUTH/TLS on Memorystore BASIC. State-file or console read = full DB; passive
observer sniffs tickets and creds. Fix: `random_password` (32+, special), secret
*references* never values, `sensitive=true`, Memorystore AUTH + `rediss://`,
`sslmode=require` / `ssl:{require:true}`.

**V10/V30 — Committed and stageable secrets.**
Compose carries dev passwords, Grafana `admin/admin` on LAN (`:151-152,158`),
Prometheus on `0.0.0.0:9090`. `.gitignore` misses `.env.production`/`.staging`.
Fix: `${VAR:?required}` + untracked env, bind observability to `127.0.0.1`,
`.env*` + `!.env.example` ignore, rotate anything derived from these values.

**V25/V28 — Key reuse and weak-at-defaults hashing.**
`JWT_SECRET ?? SESSION_SECRET` fallback lives outside prod with shipped identical
placeholders that pass the 32-char check. Add placeholder denylist +
distinctness assertion. scrypt runs at Node defaults without pepper — pin
`{N:2^17, r:8, p:1}`, version the format, add a Secret-Manager pepper.

### Domain 5 — Dependency, Supply Chain & Build Security

See **§4 Verdict** below. Headlines: transitive `ws@7.5.13` + `nanoid@3.3.18`,
deprecated `prom-client`, unmaintained wire-critical `fast-json-patch`, no
blocking audit job; workflows lack `permissions:` and pin `trufflehog@main` /
`trivy-action@master`; `.dockerignore` misses bare `.env` while `Dockerfile:31`
`COPY . .` ingests it; `turbo.json:8` hashes `.env*` into cache keys.

### Domain 6 — Business Logic, Rate Limiting & DoS

**V08 — Fail-open + spoofable identity.**
Redis outage returns `allowed:true` (`rate-limiter.ts:68-71`); client IP trusts
`cf-connecting-ip`/`x-real-ip`/rightmost-XFF unconditionally with no trusted-proxy
check (`:78-95`). One outage or one header rotation defeats every bucket. Fix:
fail closed on auth paths (429 + `Retry-After`), trusted-proxy allowlist with
hop-count indexing, otherwise `remote.address`.

**V16/V06/V07/V19** — per-route bucket gaps, room exhaustion, definition bombs,
frame/patch bombs — covered above with fixes.

**Verified sound:** concurrent-register `23505` handling, atomic intent-drain Lua,
single-owner tick lease, halt tombstone, refresh fail-closed on deleted user.

### Domain 7 — Logging, Monitoring & Incident Readiness

**V20 — Metric cardinality bombs.** `ws_active_connections{room=<roomId>}`,
`ws_messages_received_total{type=<raw>}` (incremented *before* schema validation,
`ws-server.ts:308`), `sim_invariant_violations_total{invariant=<message>}`.
Random rooms/types/messages → unbounded series → Prometheus OOM. Fix: drop the
`room` label, whitelist `type` else `other`, invariant codes not messages.

**V21/V29 — PII in logs; audit gaps.** Emails and raw attacker snippets bypass the
redactor; refresh success/reuse, ticket mint/consume, share CRUD, role changes
emit nothing. Fix: hash-only user IDs, extend redact list, emit `SECURITY_AUDIT`
for each with actor/jti/room/result and no secrets.

### Domain 8 — Compliance & Hardening for Production

**V26/V27 — Headers and oracles.** API uses bare `secureHeaders()` (explicit HSTS
unverified); JOIN failures echo room/domain internals. Web headers verified
strong (DENY/nosniff/CSP/HSTS/preload); 5xx leakage correctly gated by
`toErrorResponse`. Fix: explicit HSTS/CSP, generic join-rejection message,
`curl -I` verification pre-launch.

## 4. Dependency & Supply Chain Verdict

**Verdict: CONDITIONAL PASS — shippable only with the gates below.** Base hygiene
is real (digest-pinned bases, non-root users, `--frozen-lockfile`, `--prod` +
`--ignore-scripts` in images, `tsx` dev-only, compiled `CMD`s, no secret
ARG/ENVs, TruffleHog + Trivy + Syft SBOM jobs). The gaps are enforcement, not
posture:

- **Flagged packages:** transitive `ws@7.5.13` (EOL; historically DoS-prone class)
  and `nanoid@3.3.18` beside direct `nanoid@5.1.16` — run `pnpm why` and bump or
  drop the holders; deprecated `prom-client` → `@prometheus-io/client`;
  unmaintained `fast-json-patch` on the hot path — fuzz `applyPatch` and cap
  frames (already partially gated), plan replacement; `0.x` majors
  (`@hono/zod-validator`, `drizzle-orm/kit`, OTel SDK) are acceptable but must be
  covered by a blocking scan since semver promises nothing.
- **No CVE IDs are cited here** — none were verified against the current lockfile
  in this pass. Run `pnpm audit --prod --json`, `trivy image` on **all three**
  images (CI skips web today), and diff Syft SBOM before trusting the tree.
- **Required policy:** `.github/dependabot.yml` (npm + docker + gha),
  `dependency-review` on PRs, blocking `pnpm audit --prod --audit-level=high`,
  SHA-pinned actions, top-level `permissions: contents: read`, digest-pinned CI
  service images, `HEALTHCHECK` in all images, SARIF upload + daily scheduled
  scans, no `ignore-unfixed` on prod images, `pnpm.overrides` policy for
  transitive highs, trimmed `allowBuilds`, and `.env*` out of `turbo.json`
  inputs and `.dockerignore` coverage for bare `.env`.

## 5. Production Readiness Checklist

**Must fix before launch:**
- [ ] V01 logout cookie paths + revocation; V02 ticket type + user check; V03 atomic consume/rotate; V13 revoke ownership + bounds
- [ ] V05 room membership auth + `SET NX` claims; V06 room/user caps + runner stop on empty; V07 `definition` caps; V19 frame/payload caps + owner-gated reset
- [ ] V09 Terraform `random_password` + secret refs + `rediss://`/AUTH + `sslmode`; V10 purge compose secrets, bind observability to loopback, rotate derived creds
- [ ] V08 fail-closed auth paths + trusted-proxy IP; V16 per-route buckets (register/refresh/ticket/revoke/dev-login)
- [ ] V20 metric labels; V21 log redaction + audit events; V26 explicit HSTS + 404 catch-all
- [ ] Blocking `pnpm audit`, Trivy on all three images, SHA-pinned least-privilege workflows; verify `jose`/JWT `exp` enforcement and `curl -I` headers live

**Post-launch hardening:**
- [ ] V11/V12 prod-only CORS/origin tightening; V14 closed degraded mode; V15 admin-gated visibility + share expiry/audit; V04 flag-gated dev-login removal
- [ ] V17 per-domain intent schemas; V27 generic join errors; V28 pinned scrypt + pepper; V29/V30 audit + ignore hygiene; V24 cache/build secret hygiene; HEALTHCHECKs; OTLP auth/TLS; password-reset design (when needed) with hashed single-use ≤1h tokens

**Do not regress (verified present):** HS256 pinning on every verify; refresh
rotation + reuse + `jti`; revocation checks on API/gateway/mint paths; scrypt +
timing-safe + dummy-hash anti-enumeration; atomic `EXISTS` update/delete and JOIN
reads; share-token entropy + validation; CORS deny-default + body caps + Lua
rate limiter; no SQLi/XSS/CSRF-token-needing surface; React-escaped sinks.
