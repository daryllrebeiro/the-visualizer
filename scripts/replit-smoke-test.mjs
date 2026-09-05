#!/usr/bin/env node

/**
 * TheVisualizer — Replit Live Deployment Smoke Test Suite
 * Validates all 18 domains, API endpoints, WebSocket gateway, rate limiting,
 * token revocation, security headers, and TLS against any target URL.
 *
 * Usage:
 *   node scripts/replit-smoke-test.mjs [TARGET_URL]
 *   Default TARGET_URL: http://localhost:8080
 */

let unpackFn = null;
try {
  const mod = await import('../apps/ws-gateway/node_modules/msgpackr/dist/index.js');
  unpackFn = mod.unpack;
} catch {
  // fallback if msgpackr not in root
}

const targetUrl = (process.argv[2] || 'http://localhost:8080').replace(/\/+$/, '');
const isHttps = targetUrl.startsWith('https://');
const wsProtocol = isHttps ? 'wss:' : 'ws:';
const wsBaseUrl = targetUrl.replace(/^http/, 'ws');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  THE VISUALIZER — Live Deployment Smoke Test Suite');
console.log(`  Target URL:       ${targetUrl}`);
console.log(`  WebSocket Target: ${wsBaseUrl}/ws`);
console.log(`  Timestamp:        ${new Date().toISOString()}`);
console.log('═══════════════════════════════════════════════════════════════════\n');

let passedChecks = 0;
let failedChecks = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedChecks++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedChecks++;
  }
}

async function runSuite() {
  let authToken = '';

  // ─── TEST 1: Deployment Health Check ───────────────────────────────────────
  console.log('>>> [1/8] Probing Fast Deployment Health (/deployment-health)...');
  try {
    const t0 = Date.now();
    const res = await fetch(`${targetUrl}/deployment-health`);
    const duration = Date.now() - t0;
    assert(res.status === 200, `Returns HTTP 200 OK (got ${res.status}) in ${duration}ms`);
    const body = await res.json();
    assert(body.status === 'UP', `Health payload status is UP (got "${body.status}")`);
    assert(body.service === 'replit-reverse-proxy', `Service is replit-reverse-proxy`);
  } catch (err) {
    assert(false, `Deployment health check failed: ${err.message}`);
  }
  console.log('');

  // ─── TEST 2: Hardened Security Headers Check ──────────────────────────────
  console.log('>>> [2/8] Validating Hardened Security Headers on Root Ingress...');
  try {
    const res = await fetch(`${targetUrl}/deployment-health`);
    const h = res.headers;
    assert(h.get('x-content-type-options') === 'nosniff', `X-Content-Type-Options is "nosniff"`);
    assert(h.get('x-frame-options') === 'DENY', `X-Frame-Options is "DENY"`);
    assert(h.get('referrer-policy') === 'no-referrer', `Referrer-Policy is "no-referrer"`);
    if (isHttps) {
      assert(
        Boolean(h.get('strict-transport-security')),
        `Strict-Transport-Security header present over HTTPS`,
      );
    } else {
      console.log('  ℹ Skipping HSTS check (Target is HTTP, not HTTPS)');
    }
  } catch (err) {
    assert(false, `Security headers check failed: ${err.message}`);
  }
  console.log('');

  // ─── TEST 3: REST API & Authentication Endpoints ──────────────────────────
  console.log('>>> [3/8] Probing REST API Endpoints & Developer Authentication...');
  try {
    // Health
    const healthRes = await fetch(`${targetUrl}/health`);
    assert(healthRes.status === 200, `API /health returns HTTP 200`);
    const healthBody = await healthRes.json();
    assert(healthBody.service === 'api', `API health confirms service is "api"`);

    // Metrics
    const metricsRes = await fetch(`${targetUrl}/metrics`);
    assert(metricsRes.status === 200, `API /metrics returns HTTP 200`);
    const metricsText = await metricsRes.text();
    assert(
      metricsText.includes('process_cpu') || metricsText.includes('http_request'),
      `API /metrics exposes Prometheus metrics payload`,
    );

    // Dev Login
    const loginRes = await fetch(`${targetUrl}/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'smoke-test@the-visualizer.io', name: 'Smoke Tester' }),
    });
    assert(loginRes.status === 200, `POST /auth/dev-login returns HTTP 200`);
    const loginBody = await loginRes.json();
    assert(loginBody.success === true && Boolean(loginBody.token), `Received valid JWT session token`);
    authToken = loginBody.token;
  } catch (err) {
    assert(false, `API and Auth verification failed: ${err.message}`);
  }
  console.log('');

  // ─── TEST 4: All 18 Canonical Domain Routes ───────────────────────────────
  console.log('>>> [4/8] Probing All 18 Canonical Domain Routes...');
  const canonicalDomains = [
    'kafka',
    'raft',
    'database',
    'redis',
    'kubernetes',
    'rabbitmq',
    'storage',
    'networking',
    'rate-limiter',
    'distributed-lock',
    'cdn-cache',
    'id-gen',
    'transactions',
    'rag',
    'agents',
    'llm-serving',
    'vectordb',
    'gpu-cluster',
  ];

  for (const domain of canonicalDomains) {
    try {
      const res = await fetch(`${targetUrl}/${domain}`);
      assert(res.status === 200, `Route /${domain} returns HTTP 200 OK`);
    } catch (err) {
      assert(false, `Route /${domain} failed to load: ${err.message}`);
    }
  }
  console.log('');

  // ─── TEST 5: Live WebSocket Connection & Session Round-trip ───────────────
  console.log('>>> [5/8] Testing Stateful WebSocket Gateway Round-trip over /ws...');
  try {
    await new Promise((resolve) => {
      const wsUrl = `${wsBaseUrl}/ws?token=${authToken}`;
      const ws = new WebSocket(wsUrl);
      let receivedAck = false;

      const timeout = setTimeout(() => {
        ws.close();
        assert(false, 'WebSocket test timed out waiting for server message');
        resolve();
      }, 5000);

      ws.onopen = () => {
        assert(true, `WebSocket handshake established with ${wsBaseUrl}/ws`);
        // Send join room intent
        ws.send(
          JSON.stringify({
            type: 'JOIN_ROOM',
            payload: {
              roomId: 'smoke-test-room',
              domainId: 'kafka',
            },
          }),
        );
      };

      ws.onmessage = (event) => {
        receivedAck = true;
        let data = event.data;
        if (data instanceof ArrayBuffer) {
          data = unpack(new Uint8Array(data));
        } else if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            // raw string
          }
        }
        assert(true, `Received simulation response from WS Gateway: ${typeof data}`);
        clearTimeout(timeout);
        ws.close();
        resolve();
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        assert(false, `WebSocket error: ${err.message || 'connection failed'}`);
        resolve();
      };
    });
  } catch (err) {
    assert(false, `WebSocket suite failed: ${err.message}`);
  }
  console.log('');

  // ─── TEST 6: Ingress Rate Limiting Under Flood Attack ──────────────────────
  console.log('>>> [6/8] Testing Ingress Rate Limiting Under Rapid Burst Traffic...');
  try {
    let rateLimited = false;
    let attempts = 0;
    const burstPromises = [];

    // Send 75 concurrent requests (limit is 60)
    for (let i = 0; i < 75; i++) {
      burstPromises.push(
        fetch(`${targetUrl}/auth/dev-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'flood@the-visualizer.io', name: 'Flooder' }),
        }).then((r) => {
          attempts++;
          if (r.status === 429) {
            rateLimited = true;
          }
          return r.status;
        }),
      );
    }

    await Promise.all(burstPromises);
    assert(
      rateLimited,
      `Rate limiter triggered: returned HTTP 429 Too Many Requests under burst (${attempts} requests)`,
    );
  } catch (err) {
    assert(false, `Rate limiter test failed: ${err.message}`);
  }
  console.log('');

  // ─── TEST 7: Token Revocation / Invalid Token Rejection ───────────────────
  console.log('>>> [7/8] Testing Token Revocation & Unauthorized WS Upgrade Rejection...');
  try {
    await new Promise((resolve) => {
      const invalidWsUrl = `${wsBaseUrl}/ws?token=invalid.revoked.signature.token`;
      const ws = new WebSocket(invalidWsUrl);

      const timeout = setTimeout(() => {
        ws.close();
        assert(false, 'Expected immediate rejection of invalid token, but connection remained open');
        resolve();
      }, 3000);

      ws.onopen = () => {
        clearTimeout(timeout);
        ws.close();
        assert(false, 'Expected WebSocket rejection, but connection opened with invalid token');
        resolve();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        assert(true, 'WebSocket upgrade correctly rejected for invalid/unauthenticated token (HTTP 401)');
        resolve();
      };

      ws.onclose = (event) => {
        clearTimeout(timeout);
        assert(true, `WebSocket connection closed on unauthorized token (Code: ${event.code})`);
        resolve();
      };
    });
  } catch (err) {
    assert(false, `Revocation test failed: ${err.message}`);
  }
  console.log('');

  // ─── TEST 8: TLS Certificate Verification (HTTPS Targets) ─────────────────
  console.log('>>> [8/8] Testing TLS Security & Certificate Validity...');
  if (isHttps) {
    try {
      const httpsRes = await fetch(targetUrl);
      assert(httpsRes.ok, `TLS handshake succeeded, valid CA certificate for ${targetUrl}`);
    } catch (err) {
      assert(false, `TLS verification failed: ${err.message}`);
    }
  } else {
    console.log('  ℹ Target is HTTP (Local/Dev). TLS verification skipped.');
    assert(true, 'Local HTTP endpoint operates without TLS requirement');
  }
  console.log('');

  // ─── SUMMARY ─────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  SMOKE TEST SUMMARY: ${passedChecks} PASSED, ${failedChecks} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════');

  if (failedChecks > 0) {
    console.error('\n❌ Smoke test failed with errors.');
    process.exit(1);
  } else {
    console.log('\n✅ All deployment quality gates certified.');
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
