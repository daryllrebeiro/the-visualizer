import crypto from 'crypto';

const SECRET = '01234567890123456789012345678901';

function makeJWT(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

async function main() {
  console.log('📊 Starting Live Dashboard & Prometheus Ingestion Verification...');

  // 1. Generate live API HTTP traffic
  console.log('⚡ Generating live HTTP traffic on API server (port 3000)...');
  for (let i = 0; i < 20; i++) {
    await fetch('http://localhost:3000/health').catch(() => {});
    await fetch('http://localhost:3000/metrics').catch(() => {});
  }

  // 2. Generate live WebSocket traffic
  console.log('⚡ Generating live WebSocket traffic on WS Gateway (port 3001)...');
  const sockets = [];
  const token = makeJWT({ id: 'dashboard-tester', email: 'dash@example.com' }, SECRET);
  for (let i = 0; i < 10; i++) {
    const ws = new globalThis.WebSocket(`ws://localhost:3001?token=${token}`);
    sockets.push(ws);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomId: 'dash-room', domainId: 'kafka' } }));
      for (let j = 0; j < 5; j++) {
        ws.send(JSON.stringify({ type: 'SEND_INTENT', payload: { action: 'HEARTBEAT', seq: j } }));
      }
    };
  }

  // Wait 6 seconds for Prometheus to scrape with its 2s scrape_interval
  console.log('⏳ Awaiting Prometheus scrape cycle (6s)...');
  await new Promise((r) => setTimeout(r, 6000));

  // 3. Query Prometheus for http_requests_total
  console.log('\n--- Querying Prometheus: http_requests_total ---');
  const httpRes = await fetch('http://localhost:9090/api/v1/query?query=http_requests_total');
  const httpData = await httpRes.json();
  console.log('Prometheus Query Result:', JSON.stringify(httpData.data.result, null, 2));

  // 4. Query Prometheus for ws_active_connections
  console.log('\n--- Querying Prometheus: ws_active_connections ---');
  const wsRes = await fetch('http://localhost:9090/api/v1/query?query=ws_active_connections');
  const wsData = await wsRes.json();
  console.log('Prometheus Query Result:', JSON.stringify(wsData.data.result, null, 2));

  // 5. Query Prometheus for ws_messages_received_total
  console.log('\n--- Querying Prometheus: ws_messages_received_total ---');
  const msgRes = await fetch('http://localhost:9090/api/v1/query?query=ws_messages_received_total');
  const msgData = await msgRes.json();
  console.log('Prometheus Query Result:', JSON.stringify(msgData.data.result, null, 2));

  // 6. Query Grafana health and datasources
  console.log('\n--- Querying Grafana API (port 3003) ---');
  const grafanaHealth = await fetch('http://localhost:3003/api/health').then(r => r.json());
  console.log('Grafana Health:', grafanaHealth);

  const grafanaDs = await fetch('http://admin:admin@localhost:3003/api/datasources').then(r => r.json());
  console.log('Grafana Datasources:', JSON.stringify(grafanaDs, null, 2));

  for (const s of sockets) {
    s.close();
  }

  // Validation
  const hasHttp = httpData.data.result.length > 0 && parseFloat(httpData.data.result[0].value[1]) > 0;
  const hasWs = wsData.data.result.length > 0 && parseFloat(wsData.data.result[0].value[1]) > 0;
  const hasGrafana = grafanaHealth.database === 'ok';

  if (!hasHttp || !hasWs || !hasGrafana) {
    throw new Error(`Dashboard verification failed: hasHttp=${hasHttp}, hasWs=${hasWs}, hasGrafana=${hasGrafana}`);
  }

  console.log('\n🎉 ALL DASHBOARD & PROMETHEUS SCRAPE VERIFICATIONS PASSED WITH LIVE VALUES!');
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
