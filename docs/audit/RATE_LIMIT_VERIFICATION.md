# Rate Limiting & Message Size Verification Report (V2 — Live Server Evidence)

**Verification Date:** 2026-09-02  
**Target:** `@the-visualizer/ws-gateway`  
**Test Method:** Live in-process HTTP+WS server via `scripts/verify-rate-limiting.mjs`  
**Node:** v24.19.0  
**Status:** 🟢 **VERIFIED (3/3 PASS)**

---

## 0. Critical Fix Applied This Round

> [!IMPORTANT]
> The V2 scorecard claimed `maxPayload: 1024 * 1024` was enforced — **this was false**. The `WebSocketServer` constructor used `{ noServer: true }` with no `maxPayload` option. The `ws` library defaults to ~100 MiB when unset.
>
> **Fix applied:** Added `maxPayload: 1024 * 1024` to `ws-server.ts` line 180.  
> **Also fixed:** Added `ws.on('error')` handler on server-side connections (line 222) — without it, an oversized frame caused `RangeError: Max payload size exceeded` to crash the entire process as an unhandled error event.

---

## 1. Test Results

|   #   | Security Control             | Configured Limit       | Observed Behavior                                                                                                                                                              | Close Code / Payload                                                                                                                      |   Result    |
| :---: | :--------------------------- | :--------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- | :---------: |
| **1** | Free Tier Message Rate Limit | 20 msgs/sec            | Sent 35-message burst. Messages 1–20 accepted. Messages 21+ received `SESSION_ERROR` response with `code: 'RATE_LIMIT_EXCEEDED'`, `fatal: false`. Connection stayed open.      | Payload: `{code: 'RATE_LIMIT_EXCEEDED', message: 'Free tier message rate limit exceeded (20 msgs/sec). Dropping message.', fatal: false}` | 🟢 **PASS** |
| **2** | Hard System Flood Protection | 250 msgs/sec           | Sent 300-message burst. Messages 1–250 consumed tokens. Message 251 triggered forced socket termination.                                                                       | Close Code: **1006** (Abnormal Closure — server called `ws.terminate()`)                                                                  | 🟢 **PASS** |
| **3** | Max Frame Payload Size       | 1,048,576 bytes (1 MB) | Sent 1.5 MB text frame. Server's `ws` library rejected at receiver level with `RangeError: Max payload size exceeded`. Error handled gracefully (no crash). Connection closed. | Close Code: **1009** (Message Too Big), Error Code: `WS_ERR_UNSUPPORTED_MESSAGE_LENGTH`                                                   | 🟢 **PASS** |

---

## 2. Command Execution Evidence

### Rate Limit & Payload Cap Verification (Live Server)

```
$ node scripts/verify-rate-limiting.mjs

🛡️ Starting Rate Limiting & Payload Cap Verification Suite
================================================================================
📡 Test WebSocket Server listening on port 4055

[Test 1] Testing 20 msg/s Free Tier Rate Limiter...
  ✅ Server responded with expected rejection: {
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Free tier message rate limit exceeded (20 msgs/sec). Dropping message.',
  fatal: false
}
  (×16 repeated rejections for messages 21–35)

[Test 2] Testing 250 msg/s Hard System Flood Limiter (Socket Termination)...
  ✅ Server forcefully terminated socket flood: Code=1006

[Test 3] Testing 1MB Frame Payload Cap...
  Server log: {"level":"warn","err":{"type":"RangeError","message":"Max payload size exceeded",
    "code":"WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"},"msg":"WebSocket connection error"}
  ✅ Server rejected oversized payload: Close Code=1009 (1009 = Message Too Big)

================================================================================
📊 Verification Summary:
- Soft Rate Limit (20 msg/s): PASS
- Hard Rate Limit (250 msg/s): PASS (Terminated)
- 1MB Frame Payload Cap: PASS (Close Code: 1009)
```

### Unit Tests (Post-Fix Regression Check)

```
$ npx vitest run apps/ws-gateway/src/gateway/rate-limiting.test.ts

 ✓ apps/ws-gateway/src/gateway/rate-limiting.test.ts (2 tests) 4ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

---

## 3. Difference from V2 Report

| Aspect                          | V2 (Round 2)                                                             | V3 (Round 3)                                                                  |
| :------------------------------ | :----------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| **Test method**                 | Unit test only (`checkConnectionRateLimit` function called in isolation) | Live in-process WebSocket server with real TCP connections                    |
| **`maxPayload` enforcement**    | Claimed "enforced at WebSocket upgrade level" — **false**, was never set | Fixed and verified: `maxPayload: 1024 * 1024` added, Close Code 1009 observed |
| **Error handling**              | Not tested                                                               | Crash bug found and fixed: server-side `ws.on('error')` handler added         |
| **Close codes captured**        | None                                                                     | 1006 (flood termination), 1009 (oversized frame)                              |
| **Rejection payloads captured** | None                                                                     | Full `SESSION_ERROR` payload with `RATE_LIMIT_EXCEEDED` code                  |
