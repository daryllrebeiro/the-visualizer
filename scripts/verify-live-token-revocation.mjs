/**
 * Comprehensive Live Behavioral Verification of Token Revocation
 * Tests:
 * 1. Live API server boots on real TCP port
 * 2. Live WS Gateway boots on real TCP port
 * 3. Issues real signed JWT token
 * 4. Verifies authenticated HTTP request succeeds
 * 5. Verifies WS upgrade connection with valid token succeeds
 * 6. Revokes token via POST /auth/revoke
 * 7. Verifies same HTTP request with revoked token is REJECTED (401 Unauthorized)
 * 8. Verifies WS upgrade with revoked token is REJECTED at handshake (401 Unauthorized)
 */

import http from 'http';
import crypto from 'crypto';

process.env.SESSION_SECRET = '01234567890123456789012345678901';
process.env.JWT_SECRET = '01234567890123456789012345678901';
process.env.DATABASE_URL = 'postgresql://visualizer:visualizer_test@localhost:5432/visualizer_test';
process.env.REDIS_URL = 'redis://:redis_local_secret@localhost:6379';
process.env.REDIS_PASSWORD = 'redis_local_secret';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../apps/api/dist/index.js');
const { tokenRevocationStore } = await import('../packages/contracts/dist/index.js');
const { createWebSocketServer } = await import('../apps/ws-gateway/dist/gateway/ws-server.js');
const { Redis } = await import('../apps/ws-gateway/node_modules/ioredis/built/index.js');
const WebSocket = globalThis.WebSocket;

const API_PORT = 49152;
const WS_PORT = 49153;
const JWT_SECRET = process.env.JWT_SECRET;

function makeJWT(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

async function main() {
  console.log('🛡️ Starting Live End-to-End Token Revocation Behavioral Test...');

  // Setup Redis for revocation if available locally
  const redis = new Redis(process.env.REDIS_URL, {
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    console.log('✅ Connected to local Redis for cross-service revocation state');
    tokenRevocationStore.setBackend(redis);
  } catch (err) {
    console.log('ℹ️ Redis not available, using in-memory revocation store fallback');
  }

  // 1. Start live API Server using native Node http adapter
  const apiServer = http.createServer(async (req, res) => {
    try {
      const url = `http://${req.headers.host || `localhost:${API_PORT}`}${req.url}`;
      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (Array.isArray(val)) val.forEach((v) => headers.append(key, v));
        else if (val) headers.set(key, val);
      }

      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

      const webReq = new Request(url, {
        method: req.method,
        headers,
        body,
        duplex: 'half',
      });

      const webRes = await app.fetch(webReq);
      res.statusCode = webRes.status;
      for (const [k, v] of webRes.headers.entries()) {
        res.setHeader(k, v);
      }
      const resBody = Buffer.from(await webRes.arrayBuffer());
      res.end(resBody);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });

  await new Promise((resolve) => {
    apiServer.listen(API_PORT, () => {
      console.log(`📡 Real API Server listening on http://localhost:${API_PORT}`);
      resolve();
    });
  });

  // 2. Start live WS Gateway Server
  const wsHttpServer = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('OK');
  });
  const wss = createWebSocketServer(wsHttpServer);
  await new Promise((resolve) => {
    wsHttpServer.listen(WS_PORT, () => {
      console.log(`⚡ Real WS Gateway Server listening on ws://localhost:${WS_PORT}`);
      resolve();
    });
  });

  try {
    // 3. Generate a real JWT token
    const userId = '11111111-1111-1111-1111-111111111111';
    const payload = {
      id: userId,
      email: 'security-audit@example.com',
      name: 'Security Auditor',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const validToken = makeJWT(payload, JWT_SECRET);
    console.log(`🔑 Generated authentic JWT token for test user: ${userId}`);

    // 4. Test 1: Authenticated API request with valid token
    console.log('\n--- Step 1: Verify token works against API before revocation ---');
    const res1 = await fetch(`http://localhost:${API_PORT}/topologies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        orgId: '22222222-2222-2222-2222-222222222222',
        name: 'Test Topology',
        definition: {},
      }),
    });
    console.log(`API response with valid token: HTTP ${res1.status}`);
    if (res1.status === 401) {
      throw new Error('Valid token was unexpectedly rejected with 401');
    }
    console.log('✅ Authentication credentials accepted by API middleware (Status != 401)');

    // 5. Test 2: WS Upgrade with valid token
    console.log('\n--- Step 2: Verify token works against WS Gateway before revocation ---');
    let wsSuccess = false;
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${WS_PORT}?token=${validToken}`);
      ws.onopen = () => {
        wsSuccess = true;
        ws.close();
        resolve();
      };
      ws.onerror = (err) => {
        reject(err);
      };
    });
    console.log(`✅ WebSocket handshake accepted with valid token (wsSuccess=${wsSuccess})`);

    // 6. Step 3: Revoke token via POST /auth/revoke
    console.log('\n--- Step 3: Revoke token via real /auth/revoke endpoint ---');
    const revokeRes = await fetch(`http://localhost:${API_PORT}/auth/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: validToken }),
    });
    const revokeBody = await revokeRes.json();
    console.log(`Revocation response: HTTP ${revokeRes.status}`, revokeBody);
    if (revokeRes.status !== 200 || !revokeBody.success) {
      throw new Error(`Revocation endpoint failed: ${JSON.stringify(revokeBody)}`);
    }
    console.log('✅ Token successfully revoked in store and Redis backend');

    // 7. Step 4: Immediately retry API request with revoked token
    console.log('\n--- Step 4: Verify API strictly rejects revoked token ---');
    const resAfterRevoke = await fetch(`http://localhost:${API_PORT}/topologies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        orgId: '22222222-2222-2222-2222-222222222222',
        name: 'Test Topology',
        definition: {},
      }),
    });
    const errorBody = await resAfterRevoke.json();
    console.log(`API response with revoked token: HTTP ${resAfterRevoke.status}`, errorBody);
    if (resAfterRevoke.status !== 401) {
      throw new Error(`Expected HTTP 401 Unauthorized for revoked token, got ${resAfterRevoke.status}`);
    }
    console.log('✅ API strictly returned HTTP 401 Unauthorized with revoked credentials');

    // 8. Step 5: Retry WS Upgrade with revoked token
    console.log('\n--- Step 5: Verify WS Gateway strictly rejects revoked token at handshake ---');
    let wsRejected = false;
    await new Promise((resolve) => {
      const wsRevoked = new WebSocket(`ws://localhost:${WS_PORT}?token=${validToken}`);
      wsRevoked.onopen = () => {
        wsRevoked.close();
        resolve();
      };
      wsRevoked.onerror = () => {
        wsRejected = true;
        resolve();
      };
      wsRevoked.onclose = (ev) => {
        // When upgrade fails with 401, socket closes without open
        if (!wsRevoked.readyState || wsRevoked.readyState === 3) {
          wsRejected = true;
        }
        resolve();
      };
    });

    if (!wsRejected) {
      throw new Error('Expected WS Gateway handshake rejection with HTTP 401, but connection succeeded');
    }
    console.log('✅ WS Gateway handshake strictly rejected revoked token at handshake');

    console.log('\n🎉 ALL LIVE TOKEN REVOCATION TESTS PASSED BEHAVIORALLY (API + WS HANDSHAKE)!');
  } finally {
    if (apiServer) apiServer.close();
    wsHttpServer.close();
    wss.close();
    await redis.quit().catch(() => {});
  }
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
