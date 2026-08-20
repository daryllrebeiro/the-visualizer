import * as crypto from 'crypto';
import type * as http from 'http';
import { pack, unpack } from 'msgpackr';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

import { ClientIntentSchema, type KafkaClusterState } from '@the-visualizer/contracts';

import { authenticateConnection } from './auth.js';
import { roomManager } from './room-manager.js';
import { simulationRunner } from './runner.js';
import { sequenceReconciler } from './sequence-reconciler.js';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
  rateLimitBucket?: {
    tokens: number;
    lastRefill: number;
  };
  hardLimitBucket?: {
    tokens: number;
    lastRefill: number;
  };
}

function checkConnectionRateLimit(ws: ExtendedWebSocket): { allowed: boolean; terminate: boolean } {
  const now = Date.now();

  // 1. Hard system limit (250 msgs/s)
  if (!ws.hardLimitBucket) {
    ws.hardLimitBucket = { tokens: 250, lastRefill: now };
  }
  const hard = ws.hardLimitBucket;
  const hardElapsed = now - hard.lastRefill;
  if (hardElapsed > 0) {
    hard.tokens = Math.min(250, hard.tokens + hardElapsed * 0.25);
    hard.lastRefill = now;
  }
  if (hard.tokens >= 1) {
    hard.tokens -= 1;
  } else {
    return { allowed: false, terminate: true };
  }

  // 2. Normal free tier limit (20 msgs/s)
  if (!ws.rateLimitBucket) {
    ws.rateLimitBucket = { tokens: 20, lastRefill: now };
  }
  const free = ws.rateLimitBucket;
  const freeElapsed = now - free.lastRefill;
  if (freeElapsed > 0) {
    free.tokens = Math.min(20, free.tokens + freeElapsed * 0.02);
    free.lastRefill = now;
  }
  if (free.tokens >= 1) {
    free.tokens -= 1;
    return { allowed: true, terminate: false };
  }

  return { allowed: false, terminate: false };
}

const DEFAULT_TOPOLOGY: KafkaClusterState = {
  clusterId: '12345678-1234-1234-1234-123456789012',
  tick: 0,
  rngState: 0,
  transactions: {},
  brokers: {
    '1': {
      id: '1' as never,
      status: 'ALIVE',
      host: 'localhost',
      port: 9092,
      diskUsageBytes: 0,
      maxDiskSizeBytes: 10 * 1024 * 1024 * 1024,
      lastHeartbeatTick: 0,
      rack: 'rack-a',
    },
    '2': {
      id: '2' as never,
      status: 'ALIVE',
      host: 'localhost',
      port: 9093,
      diskUsageBytes: 0,
      maxDiskSizeBytes: 10 * 1024 * 1024 * 1024,
      lastHeartbeatTick: 0,
      rack: 'rack-b',
    },
    '3': {
      id: '3' as never,
      status: 'ALIVE',
      host: 'localhost',
      port: 9094,
      diskUsageBytes: 0,
      maxDiskSizeBytes: 10 * 1024 * 1024 * 1024,
      lastHeartbeatTick: 0,
      rack: 'rack-c',
    },
  },
  topics: {},
  kraft: {
    activeControllerId: '1' as never,
    controllerEpoch: 1,
    voters: ['1' as never, '2' as never, '3' as never],
    metadataOffset: 0,
  },
  consumerGroups: {},
};

export function createWebSocketServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // 1. Handle upgrade requests with authentication validation
  server.on('upgrade', (request, socket, head) => {
    void (async () => {
      const url = request.url ?? '';
      const cookies = request.headers.cookie ?? '';

      const user = await authenticateConnection(url, cookies);
      if (!user) {
        socket.write(
          'HTTP/1.1 401 Unauthorized\r\n' +
            'Connection: close\r\n' +
            'Content-Type: text/plain\r\n' +
            'X-Frame-Options: DENY\r\n' +
            'X-Content-Type-Options: nosniff\r\n' +
            'Referrer-Policy: no-referrer\r\n' +
            'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload\r\n' +
            '\r\n' +
            'Unauthorized',
        );
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        const extWs = ws as ExtendedWebSocket;
        extWs.userId = user.id;
        wss.emit('connection', extWs, request);
      });
    })();
  });

  // 2. Handle connections
  wss.on('connection', (ws: ExtendedWebSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      void (async () => {
        // Apply WebSocket message ingress rate-limiting
        const { allowed, terminate } = checkConnectionRateLimit(ws);
        if (terminate) {
          ws.send(
            pack({
              type: 'SESSION_ERROR',
              payload: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Hard system message rate limit exceeded. Connection terminated.',
                fatal: true,
              },
            }),
          );
          ws.terminate();
          return;
        }

        if (!allowed) {
          ws.send(
            pack({
              type: 'SESSION_ERROR',
              payload: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Free tier message rate limit exceeded (20 msgs/sec). Dropping message.',
                fatal: false,
              },
            }),
          );
          return;
        }

        try {
          const message = (isBinary ? unpack(data) : JSON.parse(data.toString())) as Record<
            string,
            unknown
          >;

          if (typeof message.type !== 'string') {
            return;
          }

          const roomId = roomManager.getRoomIdForSocket(ws);
          const type = message.type;
          const payload = message.payload as Record<string, any> | undefined;

          // A. Handle JOIN_ROOM intent
          if (type === 'JOIN_ROOM') {
            const targetRoomId = payload?.roomId as unknown;
            if (typeof targetRoomId === 'string') {
              await roomManager.joinRoom(targetRoomId, ws.userId ?? '', ws);

              // Fetch cached topology or use default
              const cachedTopologyStr = await roomManager.getCachedTopology(targetRoomId);
              let topology = DEFAULT_TOPOLOGY;
              if (cachedTopologyStr) {
                try {
                  topology = JSON.parse(cachedTopologyStr) as KafkaClusterState;
                } catch {
                  // Ignore JSON parse errors
                }
              }

              // Start simulation runner session
              simulationRunner.startSession(targetRoomId, topology);

              // Fetch current engine state if session exists
              const session = simulationRunner.getSession(targetRoomId);
              const currentState = session ? session.engine.state : topology;

              // Confirm join
              ws.send(
                pack({
                  type: 'ROOM_JOINED',
                  payload: { roomId: targetRoomId },
                }),
              );

              // Send full initial state snapshot
              ws.send(
                pack({
                  type: 'INIT_SNAPSHOT',
                  payload: {
                    roomId: targetRoomId,
                    state: currentState,
                  },
                }),
              );
            }
            return;
          }

          // Must be in a room to execute any subsequent actions
          if (!roomId) return;

          // B. Handle GAP_RECOVERY request
          if (type === 'GAP_RECOVERY') {
            const fromSeq = payload?.fromSequence as number | undefined;
            if (typeof fromSeq === 'number') {
              const recoveredPayloads = sequenceReconciler.recoverGap(roomId, fromSeq);
              if (recoveredPayloads) {
                // Send back buffered updates sequentially
                for (const recoveredPayload of recoveredPayloads) {
                  ws.send(pack(recoveredPayload));
                }
              } else {
                // Missing messages evicted -> notify client a full snapshot refresh is required
                ws.send(
                  pack({
                    type: 'INIT_SNAPSHOT_REQUIRED',
                    payload: { roomId },
                  }),
                );
              }
            }
            return;
          }

          // C. Normalize and validate other client intents using ClientIntentSchema
          let normalizedType = type;
          if (!type.startsWith('INTENT_')) {
            normalizedType = `INTENT_${type}`;
          }

          const intentId = (payload?.id as string) || crypto.randomUUID();
          const flattenedIntent = {
            id: intentId,
            type: normalizedType,
            ...(typeof payload === 'object' && payload !== null ? payload : {}),
          };

          const parseResult = ClientIntentSchema.safeParse(flattenedIntent);
          if (!parseResult.success) {
            ws.send(
              pack({
                type: 'MSG_INTENT_ACK',
                payload: {
                  intentId,
                  status: 'REJECTED',
                  reason: `Invalid intent structure: ${parseResult.error.errors[0]?.message || 'unknown error'}`,
                },
              }),
            );
            return;
          }

          // Publish normalized and validated ClientIntents to Redis streams for processing by session workers
          await roomManager.publishIntent(roomId, {
            userId: ws.userId,
            id: intentId,
            type: normalizedType,
            payload: parseResult.data,
          });
        } catch {
          // Failed to parse frame payload
        }
      })();
    });

    ws.on('close', () => {
      void roomManager.leaveRoom(ws);
    });
  });

  // 3. Heartbeat interval checker (10-second checks)
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (!extWs.isAlive) {
        extWs.terminate();
        return;
      }
      extWs.isAlive = false;
      extWs.ping();
    });
  }, 10_000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}
