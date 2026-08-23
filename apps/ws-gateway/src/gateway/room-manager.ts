import { Redis } from 'ioredis';
import { pack } from 'msgpackr';
import type { WebSocket } from 'ws';

import {
  captureException,
  logger,
  wsActiveConnections,
  wsMessagesSentTotal,
} from '@the-visualizer/logging';

import { config } from '../config.js';
import { sequenceReconciler } from './sequence-reconciler.js';

export interface RoomClient {
  userId: string;
  socket: WebSocket;
}

export type RoomLifecycleState = 'ACTIVE' | 'IDLE' | 'RECLAIMED';

export class RoomManager {
  private pub: Redis;
  private sub: Redis;

  // Maps roomId -> Set of clients
  private rooms = new Map<string, Set<RoomClient>>();
  // Reverse lookup: socket -> roomId
  private clientRooms = new Map<WebSocket, string>();
  // Sockets that are connected but haven't joined a room
  private unassignedSockets = new Set<WebSocket>();

  // Room lifecycle activity tracking: roomId -> lastActivityEpochMs
  private roomLastActivity = new Map<string, number>();
  private roomStates = new Map<string, RoomLifecycleState>();
  private reaperInterval: NodeJS.Timeout | null = null;

  public addUnassigned(socket: WebSocket): void {
    this.unassignedSockets.add(socket);
    wsActiveConnections.inc({ room: 'unassigned' });
  }

  constructor() {
    this.pub = new Redis(config.REDIS_URL, {
      password: config.REDIS_PASSWORD,
    });
    this.pub.on('error', (err) => {
      logger.warn({ err }, 'Redis publisher connection error');
    });

    this.sub = new Redis(config.REDIS_URL, {
      password: config.REDIS_PASSWORD,
    });
    this.sub.on('error', (err) => {
      logger.warn({ err }, 'Redis subscriber connection error');
    });

    this.setupRedisSubscription();
    this.startReaperLoop();
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
          logger.warn(
            { err, channel, roomId, messageSnippet: message.substring(0, 100) },
            'Failed to parse Redis room pub/sub message',
          );
          captureException(err, { service: 'ws-gateway', roomId, extra: { channel } });
        }
      }
    });
  }

  public recordActivity(roomId: string): void {
    this.roomLastActivity.set(roomId, Date.now());
    this.roomStates.set(roomId, 'ACTIVE');
  }

  public getRoomState(roomId: string): RoomLifecycleState {
    return this.roomStates.get(roomId) ?? 'IDLE';
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
    this.recordActivity(roomId);
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

      // If room is empty locally, unsubscribe and mark state IDLE
      if (clients.size === 0) {
        this.rooms.delete(roomId);
        this.roomStates.set(roomId, 'IDLE');
        if (this.sub.status === 'ready') {
          try {
            await this.sub.unsubscribe(`room:${roomId}`);
          } catch (err) {
            logger.debug({ err, roomId }, 'Error unsubscribing from Redis channel');
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
    this.recordActivity(roomId);
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
    } catch (err) {
      logger.warn({ err, roomId }, 'Failed to retrieve cached topology from Redis');
      captureException(err, { service: 'ws-gateway', roomId });
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

  public getActiveClientCount(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }

  /**
   * Reaps idle rooms whose clients have disconnected and inactivity exceeds ttlMs.
   * Cleans up in-memory records and Redis session caches.
   */
  public async reapIdleRooms(ttlMs = 30 * 60 * 1000): Promise<string[]> {
    const now = Date.now();
    const evictedRooms: string[] = [];

    for (const [roomId, lastActivity] of this.roomLastActivity.entries()) {
      const activeClients = this.getActiveClientCount(roomId);
      if (activeClients === 0 && now - lastActivity > ttlMs) {
        logger.info({ roomId, lastActivity, now }, 'Reaping idle room session');
        this.roomStates.set(roomId, 'RECLAIMED');
        this.roomLastActivity.delete(roomId);
        evictedRooms.push(roomId);

        // Delete Redis session keys
        if (this.pub.status === 'ready') {
          await this.pub.del(`room:${roomId}:intents`);
          await this.pub.del(`topology:${roomId}`);
          await this.pub.del(`simulation:${roomId}:replays`);
        }
        sequenceReconciler.clearRoom(roomId);
      }
    }

    return evictedRooms;
  }

  private startReaperLoop(): void {
    // Check every 60 seconds for idle rooms
    this.reaperInterval = setInterval(() => {
      void this.reapIdleRooms();
    }, 60_000);
  }

  public async close(): Promise<void> {
    if (this.reaperInterval) {
      clearInterval(this.reaperInterval);
      this.reaperInterval = null;
    }
    try {
      if (this.pub.status === 'ready') {
        await this.pub.quit();
      }
    } catch (err) {
      logger.debug({ err }, 'Redis publisher quit error');
    }
    try {
      if (this.sub.status === 'ready') {
        await this.sub.quit();
      }
    } catch (err) {
      logger.debug({ err }, 'Redis subscriber quit error');
    }
  }
}

export const roomManager = new RoomManager();
