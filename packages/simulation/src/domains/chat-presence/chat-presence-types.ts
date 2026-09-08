/**
 * Real-Time Chat & Presence System — simulation types.
 *
 * WebSocket-based real-time messaging (RFC 6455): presence heartbeats,
 * at-least-once delivery with client-side dedup via sequence numbers,
 * fanout to group members, offline queuing, and typing indicators.
 *
 * References:
 * - RFC 6455 (WebSocket) — connection lifecycle
 * - Kleppmann, DDIA ch. 8 — delivery semantics (at-least-once +
 *   idempotent consumer = effectively-once)
 * - Fanout-on-write vs fanout-on-read messaging architecture
 */

export type PresenceState = 'ONLINE' | 'AWAY' | 'OFFLINE';

export interface ChatUser {
  id: string;
  connected: boolean;
  presence: PresenceState;
  lastHeartbeatTick: number;
  /** chaos flag: stops automatic heartbeats (staleness scenario) */
  idle: boolean;
}

export type DeliveryStatus = 'SENT' | 'HELD_OUT_OF_ORDER' | 'DELIVERED' | 'READ' | 'QUEUED_OFFLINE';

export interface ChatMessage {
  id: string;
  conversationId: string;
  seq: number;
  senderId: string;
  text: string;
  tick: number;
  perRecipient: Record<string, DeliveryStatus>;
}

export interface ChatConversation {
  id: string;
  members: string[];
  nextSeq: number;
  messages: ChatMessage[];
}

/** A pending wire delivery to one recipient. */
export interface WireDelivery {
  conversationId: string;
  seq: number;
  messageId: string;
}

export interface OfflineQueueEntry {
  conversationId: string;
  seq: number;
  messageId: string;
}

export interface ChatPresenceClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  users: Record<string, ChatUser>;
  userOrder: string[];
  conversations: Record<string, ChatConversation>;
  conversationOrder: string[];
  /**
   * Per-recipient wire queues: messages in transit. Drained on tick in
   * order (with chaos-induced reordering via swap flags).
   */
  wireQueues: Record<string, WireDelivery[]>;
  /** per-recipient client receive buffers holding out-of-order messages */
  recvBuffers: Record<string, WireDelivery[]>;
  /** per-(recipient,conversation) next expected sequence number */
  nextExpectedSeq: Record<string, number>;
  /** per-recipient offline queue (messages while disconnected) */
  offlineQueues: Record<string, OfflineQueueEntry[]>;
  /** typing indicators: per (conversation, user) expiry tick */
  typing: Record<string, number>;
  /** local per-user send throttle (Q.5: /rate-limiter composition seam) */
  sendThrottle: Record<string, number>;
  heartbeatInterval: number;
  offlineTtl: number;
  stats: {
    messagesSent: number;
    deliveries: number;
    dedupHits: number;
    outOfOrderHeld: number;
    outOfOrderReleased: number;
    offlineQueued: number;
    offlineDrained: number;
    throttleRejections: number;
    presenceTransitions: number;
  };
}

export type ChatPresenceSimEvent =
  | { id: string; tick: number; type: 'CHAT_TICK'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: 'CHAT_SEND'; payload: { conversationId: string; senderId: string; text: string } }
  | { id: string; tick: number; type: 'CHAT_HEARTBEAT'; payload: { userId: string } }
  | { id: string; tick: number; type: 'CHAT_STOP_HEARTBEATS'; payload: { userId: string } }
  | { id: string; tick: number; type: 'CHAT_DISCONNECT'; payload: { userId: string } }
  | { id: string; tick: number; type: 'CHAT_RECONNECT'; payload: { userId: string } }
  | { id: string; tick: number; type: 'CHAT_READ'; payload: { conversationId: string; userId: string } }
  | { id: string; tick: number; type: 'CHAT_TYPING'; payload: { conversationId: string; userId: string } }
  | { id: string; tick: number; type: 'CHAT_DELIVER_OUT_OF_ORDER'; payload: { userId: string } }
  | { id: string; tick: number; type: 'CHAT_REDELIVER_LAST'; payload: { conversationId: string; userId: string } };

/** Resource caps (hard-clamped; surfaced in UI when hit). */
export const CHAT_CAPS = {
  maxUsers: 32,
  maxConversations: 8,
  maxMessagesPerConversation: 200,
  maxRecvBuffer: 50,
  maxOfflineQueue: 200,
  typingTtl: 10,
} as const;
