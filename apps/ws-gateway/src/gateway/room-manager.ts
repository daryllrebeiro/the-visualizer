import { Redis } from 'ioredis';
import { pack } from 'msgpackr';
import type { WebSocket } from 'ws';

import { wsActiveConnections, wsMessagesSentTotal } from '@the-visualizer/logging';

import { config } from '../config.js';
import { sequenceReconciler } from './sequence-reconciler.js';

export interface RoomClient {
  userId: string;
  socket: WebSocket;
}

export class RoomManager {
  private pub: Redis;
  private sub: Redis;

  // Maps roomId -> Set of clients
  private rooms = new Map<string, Set<RoomClient>>();
  // Reverse lookup: socket -> roomId
  private clientRooms = new Map<WebSocket, string>();
  // Sockets that are connected but haven't joined a room
  private unassignedSockets = new Set<WebSocket>();

  public addUnassigned(socket: WebSocket): void {
    this.unassignedSockets.add(socket);
    wsActiveConnections.inc({ room: 'unassigned' });
  }


  constructor() {
    this.pub = new Redis(config.REDIS_URL, {
      password: config.REDIS_PASSWORD,
    });
    this.pub.on('error', () => {
      // Suppress unhandled connection-closed errors during socket teardowns
    });

    this.sub = new Redis(config.REDIS_URL, {
      password: config.REDIS_PASSWORD,
    });
    this.sub.on('error', () => {
      // Suppress unhandled connection-closed errors during socket teardowns
    });

    this.setupRedisSubscription();
  }

  private setupRedisSubscription(): void {
    // Listen for room updates published from the simulation runner or other gateway nodes
    this.sub.on('message', (channel: string, message: string) => {
      if (channel.startsWith('room:')) {
        const roomId = channel.substring(5);
        try {
          const payload = JSON.parse(message);
          this.broadcastToLocalRoom(roomId, payload);
        } catch {
          // Failed to parse pub/sub message
        }
      }
    });
  }

  public async joinRoom(roomId: string, userId: string, socket: WebSocket): Promise<void> {
    // 1. Leave previous room if any
    await this.leaveRoom(socket);

    // 2. Add to local room set
    let clients = this.rooms.get(roomId);
    if (!clients) {
      clients = new Set();
      this.rooms.set(roomId, clients);
      // Subscribe to Redis channel for this room
      await this.sub.subscribe(`room:${roomId}`);
    }

    const client: RoomClient = { userId, socket };
    clients.add(client);
    this.clientRooms.set(socket, roomId);
    wsActiveConnections.inc({ room: roomId });
  }

  public async leaveRoom(socket: WebSocket): Promise<void> {
    const roomId = this.clientRooms.get(socket);
    if (!roomId) {
      if (this.unassignedSockets.has(socket)) {
        this.unassignedSockets.delete(socket);
        wsActiveConnections.dec({ room: 'unassigned' });
      }
      return;
    }

    this.clientRooms.delete(socket);
    wsActiveConnections.dec({ room: roomId });

    const clients = this.rooms.get(roomId);
    if (clients) {
      // Find client matching socket and remove
      for (const client of clients) {
        if (client.socket === socket) {
          clients.delete(client);
          break;
        }
      }

      // If room is empty locally, unsubscribe and cleanup sequence buffers
      if (clients.size === 0) {
        this.rooms.delete(roomId);
        if (this.sub.status === 'ready') {
          try {
            await this.sub.unsubscribe(`room:${roomId}`);
          } catch {
            // Ignore errors
          }
        }
        sequenceReconciler.clearRoom(roomId);
      }
    }
  }

  /**
   * Pushes client intents to a Redis List queue so they are consumed by the simulation worker.
   */
  public async publishIntent(roomId: string, intent: any): Promise<void> {
    if (this.pub.status === 'ready') {
      await this.pub.lpush(`room:${roomId}:intents`, JSON.stringify(intent));
    }
  }

  /**
   * Retrieves cached topology string from Redis.
   */
  public async getCachedTopology(roomId: string): Promise<string | null> {
    try {
      if (this.pub.status === 'ready') {
        return await this.pub.get(`topology:${roomId}`);
      }
    } catch {
      // Ignore error
    }
    return null;
  }

  /**
   * Broadcasts updates to Redis so all gateway nodes broadcast it to their local sockets.
   */
  public async publishRoomUpdate(roomId: string, update: any): Promise<void> {
    await this.pub.publish(`room:${roomId}`, JSON.stringify(update));
  }

  /**
   * Broadcasts message directly to all local sockets in the room.
   * Encodes payload using MessagePack and tracks sequence numbers.
   */
  private broadcastToLocalRoom(roomId: string, payload: any): void {
    const clients = this.rooms.get(roomId);
    if (!clients || clients.size === 0) return;

    // Buffer update and retrieve monotonic sequence number
    const sequence = sequenceReconciler.bufferMessage(roomId, payload);

    // Wrap payload in sequence envelope
    const envelope = {
      sequence,
      type: payload.type,
      payload: payload.payload,
    };

    const binaryBuffer = pack(envelope);

    for (const client of clients) {
      if (client.socket.readyState === 1) {
        // WebSocket.OPEN
        client.socket.send(binaryBuffer);
        wsMessagesSentTotal.inc({ type: payload.type });
      }
    }
  }

  public getRoomIdForSocket(socket: WebSocket): string | undefined {
    return this.clientRooms.get(socket);
  }

  public async close(): Promise<void> {
    try {
      if (this.pub.status === 'ready') {
        await this.pub.quit();
      }
    } catch {
      // Ignore error
    }
    try {
      if (this.sub.status === 'ready') {
        await this.sub.quit();
      }
    } catch {
      // Ignore error
    }
  }
}

export const roomManager = new RoomManager();
