/**
 * Self-Contained Gateway Concurrency & Load Benchmark Suite
 */

import http from 'http';
import crypto from 'crypto';
import { createWebSocketServer } from '../apps/ws-gateway/dist/gateway/ws-server.js';

const PORT = 4077;
const CONCURRENT_CLIENTS = 50;
const DURATION_SECONDS = process.env.DURATION_SECONDS ? Number(process.env.DURATION_SECONDS) : 10;
const SECRET = process.env.SESSION_SECRET || 'test_session_secret_at_least_32_characters_long_123456';

function makeJWT(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

async function main() {
  console.log('🚀 Launching Dedicated Load Test Server on port', PORT);
  const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('OK');
  });

  const wss = createWebSocketServer(server);
  await new Promise((resolve) => server.listen(PORT, resolve));

  const token = makeJWT({ id: 'load-tester', email: 'load@example.com' }, SECRET);
  const WS_URL = `ws://localhost:${PORT}?token=${token}`;

  console.log(`📡 Connecting ${CONCURRENT_CLIENTS} concurrent WebSocket clients to ws://localhost:${PORT}...`);

  let connectedCount = 0;
  let errorCount = 0;
  let droppedCount = 0;
  let messagesSent = 0;
  let messagesReceived = 0;
  const sockets = [];

  const startTime = Date.now();
  const startRssMb = process.memoryUsage().rss / (1024 * 1024);
  const startHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);

  for (let i = 0; i < CONCURRENT_CLIENTS; i++) {
    const roomId = `room-${i % 5}`;
    const ws = new WebSocket(WS_URL);
    sockets.push(ws);

    ws.onopen = () => {
      connectedCount++;
      ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomId, domainId: 'kafka' } }));
      messagesSent++;
    };

    ws.onmessage = () => {
      messagesReceived++;
    };

    ws.onerror = (err) => {
      errorCount++;
    };

    ws.onclose = () => {
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

  server.close();
  wss.close();

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
  process.exit(0);
}

main().catch(console.error);
