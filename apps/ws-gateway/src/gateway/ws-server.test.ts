import { sign } from 'hono/jwt';
import { pack, unpack } from 'msgpackr';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { JWT_SECRET } from '../config.js';
import { server } from '../index.js';
import { roomManager } from './room-manager.js';

describe('WebSocket Gateway Integration Tests', () => {
  let port: number;
  let testUserToken: string;

  beforeAll(async () => {
    // Generate valid JWT token for test user
    const payload = {
      id: 'test-user-uuid',
      email: 'test@gateway.com',
      name: 'Gateway Client',
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    };
    testUserToken = await sign(payload, JWT_SECRET);

    // Spin up server on a random free port
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Teardown connections and close server
    await roomManager.close();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it('should reject connection upgrade with 401 if token is invalid or missing', () => {
    return new Promise<void>((resolve) => {
      const client = new WebSocket(`ws://localhost:${port}`);
      client.on('error', (err: any) => {
        // Upgrade failed (e.g. returned 401)
        expect(err.message).toContain('Unexpected server response: 401');
        resolve();
      });
    });
  });

  it('should accept connection upgrade with valid token query parameter', () => {
    return new Promise<void>((resolve, reject) => {
      const client = new WebSocket(`ws://localhost:${port}?token=${testUserToken}`);

      client.on('open', () => {
        expect(client.readyState).toBe(WebSocket.OPEN);
        client.close();
        resolve();
      });

      client.on('error', (err) => {
        reject(err);
      });
    });
  });

  it('should support joining rooms and dispatching ClientIntents', () => {
    return new Promise<void>((resolve, reject) => {
      const client = new WebSocket(`ws://localhost:${port}?token=${testUserToken}`);

      client.on('open', () => {
        // Send JOIN_ROOM MessagePack request
        const joinMsg = {
          type: 'JOIN_ROOM',
          payload: { roomId: 'test-room-1' },
        };
        client.send(pack(joinMsg));
      });

      client.on('message', (data: Buffer) => {
        const message = unpack(data) as any;
        if (message.type === 'ROOM_JOINED') {
          expect(message.payload.roomId).toBe('test-room-1');
          client.close();
          resolve();
        }
      });

      client.on('error', (err) => {
        reject(err);
      });
    });
  });

  it('should handle GAP_RECOVERY request and trigger full snapshot sync if sequence is missing', () => {
    return new Promise<void>((resolve, reject) => {
      const client = new WebSocket(`ws://localhost:${port}?token=${testUserToken}`);

      client.on('open', () => {
        // Join room first
        const joinMsg = {
          type: 'JOIN_ROOM',
          payload: { roomId: 'test-room-2' },
        };
        client.send(pack(joinMsg));
      });

      let joined = false;
      client.on('message', (data: Buffer) => {
        const message = unpack(data) as any;

        if (message.type === 'ROOM_JOINED') {
          joined = true;
          // Send GAP_RECOVERY request for sequence 5 (no buffer exists)
          const gapMsg = {
            type: 'GAP_RECOVERY',
            payload: { fromSequence: 5 },
          };
          client.send(pack(gapMsg));
        } else if (joined && message.type === 'INIT_SNAPSHOT_REQUIRED') {
          expect(message.payload.roomId).toBe('test-room-2');
          client.close();
          resolve();
        }
      });

      client.on('error', (err) => {
        reject(err);
      });
    });
  });
});
