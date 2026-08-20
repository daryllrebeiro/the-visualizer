import type * as http from 'http';
import { pack, unpack } from 'msgpackr';
import { WebSocket, WebSocketServer } from 'ws';

import { authenticateConnection } from './auth.js';
import { roomManager } from './room-manager.js';
import { sequenceReconciler } from './sequence-reconciler.js';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
}

export function createWebSocketServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // 1. Handle upgrade requests with authentication validation
  server.on('upgrade', async (request, socket, head) => {
    const url = request.url || '';
    const cookies = request.headers['cookie'];

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
  });

  // 2. Handle connections
  wss.on('connection', (ws: ExtendedWebSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data: Buffer, isBinary: boolean) => {
      try {
        let message: any;
        if (isBinary) {
          message = unpack(data);
        } else {
          message = JSON.parse(data.toString());
        }

        if (!message || typeof message.type !== 'string') {
          return;
        }

        const roomId = roomManager.getRoomIdForSocket(ws);

        // A. Handle JOIN_ROOM intent
        if (message.type === 'JOIN_ROOM') {
          const targetRoomId = message.payload?.roomId;
          if (typeof targetRoomId === 'string') {
            await roomManager.joinRoom(targetRoomId, ws.userId!, ws);
            // Confirm join
            ws.send(
              pack({
                type: 'ROOM_JOINED',
                payload: { roomId: targetRoomId },
              }),
            );
          }
          return;
        }

        // Must be in a room to execute any subsequent actions
        if (!roomId) return;

        // B. Handle GAP_RECOVERY request
        if (message.type === 'GAP_RECOVERY') {
          const fromSeq = message.payload?.fromSequence;
          if (typeof fromSeq === 'number') {
            const recoveredPayloads = sequenceReconciler.recoverGap(roomId, fromSeq);
            if (recoveredPayloads) {
              // Send back buffered updates sequentially
              for (const payload of recoveredPayloads) {
                ws.send(pack(payload));
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
          ...message,
        });
      } catch (err) {
        // Failed to parse frame payload
      }
    });

    ws.on('close', async () => {
      await roomManager.leaveRoom(ws);
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
