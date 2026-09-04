/**
 * WebSocket Load & Concurrency Test Script
 * Connects N concurrent WebSocket clients to ws-gateway, joins rooms, sends heartbeats/intents,
 * and measures throughput, error rate, memory delta, and connection success rate.
 */

import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET || '01234567890123456789012345678901';

function makeJWT(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

const CONCURRENT_CLIENTS = 50;
const DURATION_SECONDS = 10;
const WS_BASE_URL = process.env.WS_GATEWAY_URL || 'ws://localhost:4001';

async function runLoadTest() {
  const token = makeJWT({ id: 'load-tester', email: 'load@example.com' }, SECRET);
  const WS_URL = `${WS_BASE_URL}?token=${token}`;

  console.log(`🚀 Starting WebSocket Gateway Concurrency & Load Test`);
  console.log(`- Target: ${WS_BASE_URL}`);
  console.log(`- Concurrency: ${CONCURRENT_CLIENTS} concurrent clients`);
  console.log(`- Duration: ${DURATION_SECONDS}s`);
  console.log('='.repeat(80));

  let connectedCount = 0;
  let errorCount = 0;
  let droppedCount = 0;
  let messagesSent = 0;
  let messagesReceived = 0;
  const sockets = [];

  const startTime = Date.now();
  const startRssMb = process.memoryUsage().rss / (1024 * 1024);
  const startHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);

  // Connect all clients
  for (let i = 0; i < CONCURRENT_CLIENTS; i++) {
    const roomId = `load-room-${i % 5}`;
    const client = new WebSocket(WS_URL);
    sockets.push(client);

    client.onopen = () => {
      connectedCount++;
      // Send JOIN_ROOM intent
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

    client.onerror = () => {
      errorCount++;
    };

    client.onclose = () => {
      if (Date.now() - startTime < DURATION_SECONDS * 1000 - 500) {
        droppedCount++;
      }
    };
  }

  // Periodic heartbeat / intent send
  const interval = setInterval(() => {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'INTENT_PRODUCE', payload: { topic: 'orders' } }));
        messagesSent++;
      }
    }
  }, 1000);

  // Wait for test duration
  await new Promise((resolve) => setTimeout(resolve, DURATION_SECONDS * 1000));
  clearInterval(interval);

  // Close all sockets
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const totalTimeSec = (Date.now() - startTime) / 1000;
  const endRssMb = process.memoryUsage().rss / (1024 * 1024);
  const endHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);
  const rssDeltaMb = endRssMb - startRssMb;
  const heapDeltaMb = endHeapMb - startHeapMb;

  console.log('='.repeat(80));
  console.log(`📊 Load Test Report:`);
  console.log(`- Test Duration: ${totalTimeSec.toFixed(2)}s`);
  console.log(`- Connection Success Rate: ${connectedCount} / ${CONCURRENT_CLIENTS} (${((connectedCount / CONCURRENT_CLIENTS) * 100).toFixed(1)}%)`);
  console.log(`- Dropped Connections: ${droppedCount}`);
  console.log(`- Total Socket Errors: ${errorCount}`);
  console.log(`- Messages Dispatched: ${messagesSent}`);
  console.log(`- Messages Received: ${messagesReceived}`);
  console.log(`- Starting Memory (RSS): ${startRssMb.toFixed(2)} MB (Heap: ${startHeapMb.toFixed(2)} MB)`);
  console.log(`- Ending Memory (RSS): ${endRssMb.toFixed(2)} MB (Heap: ${endHeapMb.toFixed(2)} MB)`);
  console.log(`- RSS Memory Growth: ${rssDeltaMb >= 0 ? '+' : ''}${rssDeltaMb.toFixed(2)} MB (Heap Growth: ${heapDeltaMb >= 0 ? '+' : ''}${heapDeltaMb.toFixed(2)} MB)`);
}

runLoadTest().catch(console.error);
