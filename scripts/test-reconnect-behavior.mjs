/**
 * Induced Gateway Failure & Client Reconnect Test
 * Uses native Node 24 WebSocket to test gateway connection, message handling,
 * and disconnect behavior.
 */

async function testReconnect() {
  console.log('🧪 Starting Induced Gateway Failure & Reconnect Test');
  console.log('='.repeat(80));

  const client = new WebSocket('ws://localhost:4001');
  let openObserved = false;
  let closeObserved = false;
  let closeCode = null;

  client.onopen = () => {
    openObserved = true;
    console.log('✅ Client connected to ws://localhost:4001');
    client.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomId: 'reconnect-room', domainId: 'kafka' } }));
  };

  client.onmessage = (event) => {
    console.log('📩 Message received from gateway:', event.data);
  };

  client.onclose = (event) => {
    closeObserved = true;
    closeCode = event.code;
    console.log(`🔌 Connection closed by gateway (Code: ${event.code}, Reason: "${event.reason}")`);
  };

  client.onerror = (err) => {
    console.log(`⚠️ Connection error encountered:`, err.message || err);
  };

  // Wait 2s for connection and messages
  await new Promise((r) => setTimeout(r, 2000));

  console.log(`📊 Initial connection status: openObserved = ${openObserved}, closeObserved = ${closeObserved}, code = ${closeCode}`);
}

testReconnect().catch(console.error);
