import type * as http from 'http';
import { pack, unpack } from 'msgpackr';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import { authenticateConnection } from './auth.js';
import { roomManager } from './room-manager.js';
import { simulationRunner } from './runner.js';
import { sequenceReconciler } from './sequence-reconciler.js';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
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
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
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

          // C. Publish standard ClientIntents to Redis streams for processing by session workers
          await roomManager.publishIntent(roomId, {
            userId: ws.userId,
            type,
            payload,
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
