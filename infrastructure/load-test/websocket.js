import { check } from 'k6';
import http from 'k6/http';
import ws from 'k6/ws';

export const options = {
  vus: 10,
  duration: '10s',
  thresholds: {
    http_req_duration: ['p(95)<50'], // 95% of auth requests must complete within 50ms
    http_req_failed: ['rate<0.01'], // Error rate under 1%
    ws_connecting: ['p(95)<100'], // 95% of WS handshakes under 100ms
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3001';

export default function () {
  // 1. Authenticate with register/login to obtain a valid JWT token
  const authPayload = JSON.stringify({
    email: `load-test-${__VU}-${Date.now()}@visualizer.com`,
    name: `Load Test User ${__VU}`,
    password: 'Password123!',
  });

  const registerRes = http.post(`${API_URL}/auth/register`, authPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const token = registerRes.json()?.token;
  check(registerRes, {
    'auth succeeded': (r) => r.status === 201 && Boolean(token),
  });

  if (!token) return;

  // 2. Establish WebSocket connection to the gateway using the token
  const url = `${WS_URL}/?token=${token}`;
  const response = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // Send JOIN_ROOM intent in JSON format (ws-gateway parses JSON if text frame)
      socket.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          payload: { roomId: 'load-test-room-1' },
        }),
      );
    });

    socket.on('message', () => {
      // Sending a PRODUCE intent once communication is established
      socket.send(
        JSON.stringify({
          type: 'PRODUCE',
          payload: {
            topic: 'orders',
            partition: 0,
            key: `k-${__VU}`,
            value: 'hello-world-load-test',
            acks: 1,
          },
        }),
      );

      // Close the socket to complete the virtual user iteration cleanly
      socket.close();
    });

    socket.on('close', () => {
      // Closed connection
    });

    socket.on('error', (e) => {
      console.error('WebSocket Error: ', e);
    });
  });

  check(response, { 'ws handshake successful': (r) => r && r.status === 101 });
}
