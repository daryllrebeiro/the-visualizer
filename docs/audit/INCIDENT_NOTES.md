# Incident Retrospective Note: Missing `maxPayload` on WebSocket Server

**Incident Reference:** INC-2026-09-02-WS-MAXPAYLOAD  
**Date Identified:** 2026-09-02 (During Round 3 Live Verification)  
**Severity:** HIGH (Denial-of-Service / Memory Exhaustion Vector)  
**Status:** 🟢 RESOLVED & REGRESSION-PROTECTED  

---

## 1. Summary of Defect
During the Round 2 forensic audit, the production readiness scorecard asserted that WebSocket frames were constrained by a 1MB payload cap (`maxPayload: 1024 * 1024`). In Round 3 live server verification, code inspection of `apps/ws-gateway/src/gateway/ws-server.ts` revealed that `WebSocketServer` was constructed via `new WebSocketServer({ noServer: true })` without supplying `maxPayload`.

Under the `ws` package defaults, unconstrained servers accept message frames up to **100 MiB** (104,857,600 bytes) per incoming frame before rejecting. Furthermore, because no connection-level `ws.on('error')` handler was attached to client sockets, incoming oversized frames raised an unhandled `RangeError: Max payload size exceeded`, triggering an unhandled exception crash that terminated the entire Node.js gateway process.

## 2. Risk & Impact Analysis
1. **Memory Exhaustion (DoS):** An unauthenticated or free-tier client could dispatch multiple 50–100MB frames concurrently, rapidly inflating heap usage and provoking Out-Of-Memory (OOM) killer restarts across Kubernetes pods or Cloud Run containers.
2. **Process Termination:** Sending a single payload larger than 100MB immediately crashed the server instance rather than cleanly closing the violating socket.
3. **Audit Discrepancy:** The gap occurred because earlier audits relied on configuration review of planned values rather than live ingress validation tests.

## 3. Immediate Remediation
1. **Server Option Enforced:** Explicitly passed `maxPayload: 1024 * 1024` (1MB) to `WebSocketServer` constructor in `ws-server.ts`.
2. **Crash Prevention:** Attached a connection-level `ws.on('error')` listener to log receiver-level protocol errors and allow RFC 6455 closure to fire without crashing the process.
3. **Live Verification:** Executed `scripts/verify-rate-limiting.mjs` confirming a 1.5MB frame is rejected with Close Code **1009** (`WS_ERR_UNSUPPORTED_MESSAGE_LENGTH`) while preserving server uptime.

## 4. Permanent Regression Prevention
1. **Automated Unit Regression Gate:** Created `apps/ws-gateway/src/gateway/ws-server-config.test.ts` which runs in CI on every PR, asserting `wss.options.maxPayload === 1024 * 1024`.
2. **Transport Hardening:** Configured explicit HTTP server timeouts (`keepAliveTimeout = 65000`, `headersTimeout = 66000`, `requestTimeout = 30000`, `maxHeadersCount = 100`) across both `apps/ws-gateway` and `apps/api` to eliminate default timeout attack surfaces.
3. **CI Behavioral Ingress Job:** Wired `scripts/verify-rate-limiting.mjs` into `.github/workflows/ci.yml` as a mandatory blocking gate before merge.
