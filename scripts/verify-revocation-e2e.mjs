/**
 * Live End-to-End Behavioral Test for Token Revocation over TCP/HTTP Sockets.
 * Spins up a real native Node.js HTTP socket server, issues real TCP HTTP socket requests
 * to revoke a token, and verifies that subsequent authenticated requests receive HTTP 401.
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

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = 4088;

function makeJWT(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function httpRequest(port, path, options = {}, bodyData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      }
    );

    req.on('error', reject);
    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function run() {
  console.log('🚀 Starting native TCP HTTP Server for End-to-End Revocation Testing on port', PORT);
  
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? Buffer.concat(chunks) : undefined;

    const webReq = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: body && body.length > 0 ? body : undefined,
      duplex: 'half',
    });

    const webRes = await app.fetch(webReq);
    res.statusCode = webRes.status;
    for (const [k, v] of webRes.headers.entries()) {
      res.setHeader(k, v);
    }
    const resBuffer = Buffer.from(await webRes.arrayBuffer());
    res.end(resBuffer);
  });

  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  try {
    tokenRevocationStore.clear();

    const payload = {
      id: 'revocation-live-user',
      email: 'live-user@example.com',
      name: 'Live User',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = makeJWT(payload, JWT_SECRET);

    console.log('1. Health check over real TCP socket...');
    const health = await httpRequest(PORT, '/health');
    console.log(`   Health HTTP Status: ${health.status}`);

    console.log('2. Sending POST /auth/revoke with token over TCP socket...');
    const revokeRes = await httpRequest(
      PORT,
      '/auth/revoke',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { token }
    );
    console.log(`   Revoke HTTP Status: ${revokeRes.status}`);
    console.log(`   Revoke Response:`, revokeRes.data);

    if (revokeRes.status !== 200 || !revokeRes.data.success) {
      throw new Error(`Failed to revoke token: ${JSON.stringify(revokeRes)}`);
    }

    console.log('3. Attempting authenticated request to protected /topologies with revoked token...');
    const protectedRes = await httpRequest(
      PORT,
      '/topologies',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
      {
        orgId: '00000000-0000-0000-0000-000000000001',
        name: 'Unauthorized Topology',
        definition: {},
      }
    );

    console.log(`   Protected Endpoint HTTP Status: ${protectedRes.status}`);
    console.log(`   Protected Endpoint Response:`, protectedRes.data);

    if (protectedRes.status === 401 && protectedRes.data.error?.code === 'UNAUTHORIZED') {
      console.log('✅ BEHAVIORAL CONFIRMATION: End-to-end token revocation verified! Middleware rejected request with HTTP 401.');
    } else {
      throw new Error(`Expected HTTP 401 UNAUTHORIZED, but got ${protectedRes.status}`);
    }
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('❌ Revocation test failed:', err);
  process.exit(1);
});
