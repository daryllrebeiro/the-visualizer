import * as http from 'http';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { createWebSocketServer } from './ws-server.js';

describe('WebSocket Origin Header Validation', () => {
  it('rejects upgrade requests with unauthorized Origin header', async () => {
    const server = http.createServer();
    createWebSocketServer(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const wsPromise = new Promise<{ code: number | undefined; rejected: boolean }>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`, {
        headers: { Origin: 'https://evil-attacker.com' },
      });

      ws.on('unexpected-response', (_req, res) => {
        resolve({ code: res.statusCode, rejected: true });
      });

      ws.on('open', () => {
        ws.close();
        resolve({ code: undefined, rejected: false });
      });

      ws.on('error', () => {
        // error triggered by unexpected response
      });
    });

    const result = await wsPromise;
    expect(result.rejected).toBe(true);
    expect(result.code).toBe(403);

    server.close();
  });
});
