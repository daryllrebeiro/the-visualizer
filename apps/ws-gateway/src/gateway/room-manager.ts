import { Redis } from 'ioredis';
import { pack } from 'msgpackr';
import type { WebSocket } from 'ws';

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
        } catch (err) {
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
  }

  public async leaveRoom(socket: WebSocket): Promise<void> {
    const roomId = this.clientRooms.get(socket);
    if (!roomId) return;

    this.clientRooms.delete(socket);

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
          } catch (_) {}
        }
        sequenceReconciler.clearRoom(roomId);
      }
    }
  }

  /**
   * Publishes client intents to Redis so they are routed to the session worker.
   */
  public async publishIntent(roomId: string, intent: any): Promise<void> {
    await this.pub.publish(`room:${roomId}:intents`, JSON.stringify(intent));
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
    } catch (_) {}
    try {
      if (this.sub.status === 'ready') {
        await this.sub.quit();
      }
    } catch (_) {}
  }
}

export const roomManager = new RoomManager();
