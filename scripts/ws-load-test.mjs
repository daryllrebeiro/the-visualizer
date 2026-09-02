/**
 * WebSocket Load & Concurrency Test Script
 * Connects N concurrent WebSocket clients to ws-gateway, joins rooms, sends heartbeats/intents,
 * and measures throughput, error rate, memory delta, and connection success rate.
 */

import { WebSocket } from 'ws';

const WS_URL = process.env.WS_GATEWAY_URL || 'ws://localhost:4001';
const CONCURRENT_CLIENTS = 50;
const DURATION_SECONDS = 5;

async function runLoadTest() {
  console.log(`🚀 Starting WebSocket Gateway Concurrency & Load Test`);
  console.log(`- Target: ${WS_URL}`);
  console.log(`- Concurrency: ${CONCURRENT_CLIENTS} concurrent clients`);
  console.log(`- Duration: ${DURATION_SECONDS}s`);
  console.log('='.repeat(80));

  let connectedCount = 0;
  let errorCount = 0;
  let messagesSent = 0;
  let messagesReceived = 0;
  const sockets = [];

  const startTime = Date.now();
  const startMem = process.memoryUsage().heapUsed;

  const connectPromise = new Promise((resolve) => {
    let resolved = 0;

    for (let i = 0; i < CONCURRENT_CLIENTS; i++) {
      const roomId = `bench-room-${i % 5}`;
      const client = new WebSocket(WS_URL);
      sockets.push(client);

      client.on('open', () => {
        connectedCount++;
        // Send JOIN_ROOM intent
        client.send(
          JSON.stringify({
            type: 'JOIN_ROOM',
            payload: { roomId, domainId: 'kafka' },
          })
        );
        messagesSent++;
      });

      client.on('message', () => {
        messagesReceived++;
      });

      client.on('error', (err) => {
        errorCount++;
      });

      client.on('close', () => {
        resolved++;
        if (resolved >= CONCURRENT_CLIENTS) resolve();
      });
    }

    // After connect, run for duration then close
    setTimeout(() => {
      console.log(`⏱️ Duration reached (${DURATION_SECONDS}s), closing ${sockets.length} connections...`);
      for (const s of sockets) {
        if (s.readyState === WebSocket.OPEN) {
          s.close();
        }
      }
      setTimeout(resolve, 1500);
    }, DURATION_SECONDS * 1000);
  });

  await connectPromise;

  const totalTimeSec = (Date.now() - startTime) / 1000;
  const endMem = process.memoryUsage().heapUsed;
  const memDeltaMb = (endMem - startMem) / (1024 * 1024);

  console.log('='.repeat(80));
  console.log(`📊 Load Test Report:`);
  console.log(`- Total Duration: ${totalTimeSec.toFixed(2)}s`);
  console.log(`- Connected Sockets: ${connectedCount} / ${CONCURRENT_CLIENTS} (${((connectedCount / CONCURRENT_CLIENTS) * 100).toFixed(1)}% success)`);
  console.log(`- Socket Errors: ${errorCount}`);
  console.log(`- Messages Sent: ${messagesSent}`);
  console.log(`- Messages Received: ${messagesReceived}`);
  console.log(`- Client Heap Growth: ${memDeltaMb.toFixed(2)} MB`);
}

runLoadTest().catch(console.error);
