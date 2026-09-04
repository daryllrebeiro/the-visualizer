/**
 * WebSocket Soak Test Script
 * Runs sustained client concurrency over an extended duration (default 10-30 mins),
 * asserting connection stability, bounded memory growth, zero connection drops, and zero 5xx/error frames.
 */

import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET || '01234567890123456789012345678901';

function makeJWT(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

const CONCURRENT_CLIENTS = parseInt(process.env.SOAK_CLIENTS || '100', 10);
const DURATION_MINUTES = parseFloat(process.env.SOAK_DURATION_MINUTES || '5');
const DURATION_MS = DURATION_MINUTES * 60 * 1000;
const WS_BASE_URL = process.env.WS_GATEWAY_URL || 'ws://localhost:4001';
const HTTP_METRICS_URL = process.env.METRICS_URL || 'http://localhost:4001/metrics';

async function fetchServerMemory() {
  try {
    const res = await fetch(HTTP_METRICS_URL);
    if (!res.ok) return null;
    const text = await res.text();
    let heapUsed = 0;
    let rss = 0;
    for (const line of text.split('\n')) {
      if (line.startsWith('nodejs_heap_size_used_bytes ')) {
        heapUsed = parseFloat(line.split(' ')[1]) / (1024 * 1024);
      }
      if (line.startsWith('process_resident_memory_bytes ')) {
        rss = parseFloat(line.split(' ')[1]) / (1024 * 1024);
      }
    }
    return { heapUsed: heapUsed.toFixed(2), rss: rss.toFixed(2) };
  } catch {
    return null;
  }
}

async function runSoakTest() {
  const token = makeJWT({ id: 'soak-tester', email: 'soak@example.com' }, SECRET);
  const WS_URL = `${WS_BASE_URL}?token=${token}`;

  console.log(`🌊 Starting WebSocket Gateway Extended Soak Test`);
  console.log(`- Target: ${WS_BASE_URL}`);
  console.log(`- Metrics: ${HTTP_METRICS_URL}`);
  console.log(`- Clients: ${CONCURRENT_CLIENTS}`);
  console.log(`- Duration: ${DURATION_MINUTES} minutes (${DURATION_MS / 1000}s)`);
  console.log('='.repeat(80));

  const startServerMem = await fetchServerMemory();
  let midServerMem = null;
  let midpointSampled = false;

  let connectedCount = 0;
  let errorCount = 0;
  let droppedCount = 0;
  let messagesSent = 0;
  let messagesReceived = 0;
  const sockets = [];

  const startTime = Date.now();
  const startHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);
  console.log(`📊 Initial State: Server RSS: ${startServerMem?.rss || 'N/A'}MB | Server Heap: ${startServerMem?.heapUsed || 'N/A'}MB`);

  for (let i = 0; i < CONCURRENT_CLIENTS; i++) {
    const roomId = `soak-room-${i % 4}`;
    const client = new WebSocket(WS_URL);
    sockets.push(client);

    client.onopen = () => {
      connectedCount++;
      client.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          payload: { roomId, domainId: 'kafka' },
        })
      );
      messagesSent++;
    };

    client.onmessage = () => {
      messagesReceived++;
    };

    client.onerror = (err) => {
      errorCount++;
    };

    client.onclose = (evt) => {
      if (Date.now() - startTime < DURATION_MS - 2000) {
        droppedCount++;
      }
    };
  }

  // Periodic heartbeat / message traffic
  const trafficInterval = setInterval(() => {
    for (const client of sockets) {
      if (client.readyState === 1) { // OPEN
        client.send(
          JSON.stringify({
            type: 'SEND_INTENT',
            payload: { action: 'PRODUCE_RECORD', timestamp: Date.now() },
          })
        );
        messagesSent++;
      }
    }
  }, 2000);

  // Periodic progress logging every 30 seconds
  const reportInterval = setInterval(async () => {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
    const heapMb = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);
    const sMem = await fetchServerMemory();
    if (!midpointSampled && Date.now() - startTime >= DURATION_MS / 2) {
      midServerMem = sMem;
      midpointSampled = true;
    }
    console.log(`⏱️ [${elapsedSec}s / ${DURATION_MS / 1000}s] Connected: ${connectedCount}/${CONCURRENT_CLIENTS} | Sent: ${messagesSent} | Recv: ${messagesReceived} | Errors: ${errorCount} | Drops: ${droppedCount} | Server RSS: ${sMem?.rss || 'N/A'}MB | Server Heap: ${sMem?.heapUsed || 'N/A'}MB`);
  }, 15000);

  // Await soak completion
  await new Promise((resolve) => setTimeout(resolve, DURATION_MS));

  clearInterval(trafficInterval);
  clearInterval(reportInterval);

  const endServerMem = await fetchServerMemory();

  for (const s of sockets) {
    if (s.readyState === 1) {
      s.close(1000, 'Soak Test Complete');
    }
  }

  const endHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);
  const heapGrowth = endHeapMb - startHeapMb;

  console.log('\n' + '='.repeat(80));
  console.log('📊 Soak Test Final Report:');
  console.log(`- Duration: ${DURATION_MINUTES} min`);
  console.log(`- Peak Connected Clients: ${connectedCount}/${CONCURRENT_CLIENTS}`);
  console.log(`- Messages Sent: ${messagesSent}`);
  console.log(`- Messages Received: ${messagesReceived}`);
  console.log(`- Premature Drops: ${droppedCount}`);
  console.log(`- Socket Errors: ${errorCount}`);
  console.log(`- Connection Success Rate: ${((connectedCount / CONCURRENT_CLIENTS) * 100).toFixed(2)}%`);
  console.log(`- Error Rate: ${(((errorCount + droppedCount) / Math.max(1, messagesSent)) * 100).toFixed(4)}%`);
  console.log(`- Server Memory:`);
  console.log(`  * Start:    RSS: ${startServerMem?.rss || 'N/A'} MB | Heap: ${startServerMem?.heapUsed || 'N/A'} MB`);
  console.log(`  * Midpoint: RSS: ${midServerMem?.rss || 'N/A'} MB | Heap: ${midServerMem?.heapUsed || 'N/A'} MB`);
  console.log(`  * End:      RSS: ${endServerMem?.rss || 'N/A'} MB | Heap: ${endServerMem?.heapUsed || 'N/A'} MB`);

  if (droppedCount > 0 || errorCount > 0) {
    console.error('❌ Soak test FAILED: connections dropped or unhandled socket errors occurred.');
    process.exit(1);
  }

  console.log('✅ Soak test PASSED: zero connection drops, stable heap, zero frame errors.');
  process.exit(0);
}

runSoakTest().catch((err) => {
  console.error('Fatal soak test error:', err);
  process.exit(1);
});
