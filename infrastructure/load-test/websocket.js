import http from 'k6/http';
import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  vus: 10,
  duration: '20s',
};

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3001';

export default function () {
  // 1. Authenticate with dev-login to obtain a valid JWT token
  const loginRes = http.post(
    `${API_URL}/auth/dev-login`,
    JSON.stringify({
      email: `load-test-${__VU}@visualizer.com`,
      name: `Load Test User ${__VU}`,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const token = loginRes.json().token;

  // 2. Establish WebSocket connection to the gateway using the token
  const url = `${WS_URL}/?token=${token}`;
  const response = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // Send JOIN_ROOM intent in JSON format (ws-gateway parses JSON if text frame)
      socket.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          payload: { roomId: 'load-test-room-1' },
        })
      );
    });

    socket.on('message', () => {
      // The server replies with MessagePack binary payload (e.g. ROOM_JOINED or INIT_SNAPSHOT)
      // Sending a PRODUCE intent once communication is established
      socket.send(
        JSON.stringify({
          type: 'PRODUCE',
          payload: {
            topic: 'load-test-topic',
            value: 'hello-world-load-test',
          },
        })
      );

      // Close the socket to complete the virtual user iteration cleanly
      socket.close();
    });

    socket.on('close', () => {
      // Closed connection
    });

    socket.on('error', () => {
      // Connection error
    });
  });

  check(response, {
    'upgrade status is 101': (r) => r && r.status === 101,
  });
}
