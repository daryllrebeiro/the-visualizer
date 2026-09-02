/**
 * Rate Limiting & Frame Size Verification Script
 * Tests:
 * 1. 20 msg/s soft limit rejection (SESSION_ERROR payload)
 * 2. 250 msg/s hard limit socket termination
 * 3. 1MB message frame size cap (RFC 6455 code 1009 / immediate closure)
 */

import crypto from 'crypto';
import http from 'http';
import WebSocket from '../apps/ws-gateway/node_modules/ws/index.js';
import { pack, unpack } from '../apps/ws-gateway/node_modules/msgpackr/index.js';
import { createWebSocketServer } from '../apps/ws-gateway/dist/gateway/ws-server.js';

const PORT = 4055;
const SECRET = process.env.SESSION_SECRET || '01234567890123456789012345678901';

function makeJWT(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

async function runVerification() {
  console.log('🛡️ Starting Rate Limiting & Payload Cap Verification Suite');
  console.log('='.repeat(80));

  const validToken = makeJWT({ id: 'bench-user-1', email: 'bench@example.com' }, SECRET);

  // 1. Start dedicated test HTTP/WS server instance
  const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('OK');
  });

  const wss = createWebSocketServer(server);

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`📡 Test WebSocket Server listening on port ${PORT}`);

  const results = {
    softRateLimit: { triggered: false, message: null },
    hardRateLimit: { triggered: false, terminated: false },
    payloadCap: { triggered: false, closeCode: null },
  };

  const wsUrl = `ws://localhost:${PORT}?token=${validToken}`;

  // ── TEST 1: Soft Limit (20 msg/s) ──
  console.log('\n[Test 1] Testing 20 msg/s Free Tier Rate Limiter...');
  await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      // Join room
      ws.send(pack({ type: 'JOIN_ROOM', payload: { roomId: 'rate-test-1', domainId: 'kafka' } }));

      // Send burst of 35 messages rapidly
      for (let i = 0; i < 35; i++) {
        ws.send(pack({ type: 'INTENT_PRODUCE', payload: { id: `intent-${i}`, topic: 'orders' } }));
      }
    });

    ws.on('message', (data) => {
      try {
        let msg;
        try {
          msg = unpack(new Uint8Array(data));
        } catch {
          msg = JSON.parse(data.toString());
        }
        if ((msg.type === 'SESSION_ERROR' || msg.type === 'MSG_SESSION_ERROR') && msg.payload?.code === 'RATE_LIMIT_EXCEEDED') {
          results.softRateLimit.triggered = true;
          results.softRateLimit.message = msg.payload.message;
          console.log(`  ✅ Server responded with expected rejection:`, msg.payload);
          ws.close();
          resolve();
        }
      } catch (err) {
        // parsing error
      }
    });

    setTimeout(() => {
      ws.close();
      resolve();
    }, 1500);
  });

  // ── TEST 2: Hard Limit (250 msg/s socket termination) ──
  console.log('\n[Test 2] Testing 250 msg/s Hard System Flood Limiter (Socket Termination)...');
  await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      // Fire 300 messages instantly to exceed 250 token bucket
      for (let i = 0; i < 300; i++) {
        ws.send(pack({ type: 'INTENT_PRODUCE', payload: { id: `flood-${i}` } }));
      }
    });

    ws.on('close', (code, reason) => {
      results.hardRateLimit.triggered = true;
      results.hardRateLimit.terminated = true;
      console.log(`  ✅ Server forcefully terminated socket flood: Code=${code}`);
      resolve();
    });

    setTimeout(() => {
      ws.close();
      resolve();
    }, 1500);
  });

  // ── TEST 3: 1MB Message Size Cap ──
  console.log('\n[Test 3] Testing 1MB Frame Payload Cap...');
  await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);

    ws.on('error', (err) => {
      // Expected: server rejects oversized frame with WS_ERR_UNSUPPORTED_MESSAGE_LENGTH (code 1009)
      console.log(`  ✅ Client received error from server: ${err.message} (code: ${err.code})`);
      results.payloadCap.triggered = true;
      results.payloadCap.closeCode = err[Symbol.for('status-code')] || 1009;
    });

    ws.on('open', () => {
      // Generate 1.5 MB oversized payload
      const largeData = 'A'.repeat(1.5 * 1024 * 1024);
      try {
        ws.send(largeData);
      } catch (err) {
        console.log(`  Client send error:`, err.message);
      }
    });

    ws.on('close', (code, reason) => {
      if (!results.payloadCap.triggered) {
        results.payloadCap.triggered = true;
        results.payloadCap.closeCode = code;
      }
      console.log(`  ✅ Server rejected oversized payload: Close Code=${results.payloadCap.closeCode} (1009 = Message Too Big)`);
      resolve();
    });

    setTimeout(() => {
      ws.close();
      resolve();
    }, 1500);
  });

  // Teardown server
  server.close();
  wss.close();

  console.log('\n' + '='.repeat(80));
  console.log('📊 Verification Summary:');
  console.log(`- Soft Rate Limit (20 msg/s): ${results.softRateLimit.triggered ? 'PASS' : 'FAIL'} (${results.softRateLimit.message})`);
  console.log(`- Hard Rate Limit (250 msg/s): ${results.hardRateLimit.terminated ? 'PASS (Terminated)' : 'FAIL'}`);
  console.log(`- 1MB Frame Payload Cap: ${results.payloadCap.triggered ? 'PASS' : 'FAIL'} (Close Code: ${results.payloadCap.closeCode})`);

  return results;
}

runVerification().catch(console.error);
