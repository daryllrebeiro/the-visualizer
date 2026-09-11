import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  CHAT_CAPS,
  type ChatPresenceClusterState,
  type ChatPresenceSimEvent,
  type ChatUser,
  type WireDelivery,
} from './chat-presence-types.js';

const HEARTBEAT_INTERVAL = 3;
const OFFLINE_TTL = 20;

function createUser(id: string): ChatUser {
  return { id, connected: true, presence: 'ONLINE', lastHeartbeatTick: 0, idle: false };
}

export function createDefaultChatPresenceCluster(
  clusterId = 'chat-presence-1',
): ChatPresenceClusterState {
  const userOrder = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank'];
  const users: Record<string, ChatUser> = Object.fromEntries(userOrder.map((id) => [id, createUser(id)]));
  return {
    clusterId,
    tick: 0,
    users,
    userOrder,
    conversations: {
      'direct-alice-bob': {
        id: 'direct-alice-bob',
        members: ['alice', 'bob'],
        nextSeq: 1,
        messages: [],
      },
      'team-alpha': {
        id: 'team-alpha',
        members: ['alice', 'bob', 'carol', 'dave', 'erin'],
        nextSeq: 1,
        messages: [],
      },
    },
    conversationOrder: ['direct-alice-bob', 'team-alpha'],
    wireQueues: Object.fromEntries(userOrder.map((id) => [id, []])),
    recvBuffers: Object.fromEntries(userOrder.map((id) => [id, []])),
    nextExpectedSeq: {},
    offlineQueues: Object.fromEntries(userOrder.map((id) => [id, []])),
    typing: {},
    sendThrottle: Object.fromEntries(userOrder.map((id) => [id, 0])),
    heartbeatInterval: HEARTBEAT_INTERVAL,
    offlineTtl: OFFLINE_TTL,
    stats: {
      messagesSent: 0,
      deliveries: 0,
      dedupHits: 0,
      outOfOrderHeld: 0,
      outOfOrderReleased: 0,
      offlineQueued: 0,
      offlineDrained: 0,
      throttleRejections: 0,
      presenceTransitions: 0,
    },
  };
}

function expectKey(userId: string, conversationId: string): string {
  return `${userId}::${conversationId}`;
}

/** Client-side receive: dedup (CHAT-4), hold (CHAT-1), accept+flush. */
function clientReceive(state: ChatPresenceClusterState, userId: string, delivery: WireDelivery): void {
  const conversation = state.conversations[delivery.conversationId];
  const message = conversation?.messages.find((m) => m.id === delivery.messageId);
  if (!conversation || !message) return;

  const key = expectKey(userId, delivery.conversationId);
  const expected = state.nextExpectedSeq[key] ?? 1;

  if (delivery.seq < expected) {
    // CHAT-4: duplicate delivery (reconnect before ack) — client dedup.
    state.stats.dedupHits++;
    return; // status stays DELIVERED — no duplicate display
  }

  if (delivery.seq > expected) {
    // CHAT-1: out-of-order arrival — hold in the receive buffer.
    const buffer = state.recvBuffers[userId] as WireDelivery[];
    if (buffer.length < CHAT_CAPS.maxRecvBuffer) {
      buffer.push(delivery);
      buffer.sort((a, b) => a.seq - b.seq);
      state.stats.outOfOrderHeld++;
      if (message.perRecipient[userId] !== 'READ') {
        message.perRecipient[userId] = 'HELD_OUT_OF_ORDER';
      }
    }
    return;
  }

  // In-order: deliver, then flush held successors in seq order.
  message.perRecipient[userId] = 'DELIVERED';
  state.stats.deliveries++;
  state.nextExpectedSeq[key] = expected + 1;

  const buffer = state.recvBuffers[userId] as WireDelivery[];
  while (
    buffer.length > 0 &&
    (buffer[0] as WireDelivery).seq === state.nextExpectedSeq[key]
  ) {
    const held = buffer.shift() as WireDelivery;
    const heldMsg = state.conversations[held.conversationId]?.messages.find(
      (m) => m.id === held.messageId,
    );
    if (heldMsg && heldMsg.perRecipient[userId] !== 'READ') {
      heldMsg.perRecipient[userId] = 'DELIVERED';
    }
    state.stats.deliveries++;
    state.stats.outOfOrderReleased++;
    state.nextExpectedSeq[key] = (state.nextExpectedSeq[key] as number) + 1;
  }
}

function drainWireQueues(state: ChatPresenceClusterState): void {
  for (const userId of state.userOrder) {
    const queue = state.wireQueues[userId] as WireDelivery[];
    while (queue.length > 0) {
      const delivery = queue.shift() as WireDelivery;
      clientReceive(state, userId, delivery);
    }
  }
}

function updatePresence(state: ChatPresenceClusterState): void {
  const awayBound = 2 * state.heartbeatInterval + 1;
  for (const user of Object.values(state.users)) {
    const staleFor = state.tick - user.lastHeartbeatTick;
    const before = user.presence;

    if (!user.connected) {
      user.presence = 'OFFLINE';
    } else if (staleFor > awayBound) {
      if (staleFor > state.offlineTtl) {
        user.presence = 'OFFLINE';
      } else {
        user.presence = 'AWAY';
      }
    } else {
      user.presence = 'ONLINE';
    }
    if (before !== user.presence) {
      state.stats.presenceTransitions++;
    }
  }
}

function runHeartbeats(state: ChatPresenceClusterState): void {
  for (const user of Object.values(state.users)) {
    if (user.connected && !user.idle) {
      if (state.tick - user.lastHeartbeatTick >= state.heartbeatInterval) {
        user.lastHeartbeatTick = state.tick;
      }
    }
  }
}

function expireTyping(state: ChatPresenceClusterState): void {
  for (const key of Object.keys(state.typing)) {
    if (state.tick >= (state.typing[key] as number)) {
      delete state.typing[key];
    }
  }
}

export function pureChatPresenceTransition(
  state: ChatPresenceClusterState,
  event: ChatPresenceSimEvent,
  rng: DeterministicRNG,
): { nextState: ChatPresenceClusterState; emittedEvents: ChatPresenceSimEvent[] } {
  const nextState: ChatPresenceClusterState = JSON.parse(
    JSON.stringify(state),
  ) as ChatPresenceClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'CHAT_SEND': {
      const conversation = nextState.conversations[event.payload.conversationId];
      const sender = nextState.users[event.payload.senderId];
      if (!conversation || !sender) break;
      if (!conversation.members.includes(sender.id)) break;

      // Local send throttle (standalone seam; Q.5 swaps in /rate-limiter).
      const lastSendTick = nextState.sendThrottle[sender.id] ?? -1;
      if (event.tick - lastSendTick < 1) {
        nextState.stats.throttleRejections++;
        break;
      }
      nextState.sendThrottle[sender.id] = event.tick;

      const seq = conversation.nextSeq;
      const messageId = `msg-${conversation.id}-${seq}`;
      const perRecipient: Record<string, 'SENT' | 'QUEUED_OFFLINE'> = {};
      for (const memberId of conversation.members) {
        const member = nextState.users[memberId];
        if (memberId === sender.id) {
          // The sender's own message flows through the same client
          // pipeline (seq-ordered timeline on every device, including
          // the sender's).
          perRecipient[memberId] = 'SENT';
          (nextState.wireQueues[memberId] as WireDelivery[]).push({
            conversationId: conversation.id,
            seq,
            messageId,
          });
          continue;
        }
        if (member && member.connected) {
          perRecipient[memberId] = 'SENT';
          (nextState.wireQueues[memberId] as WireDelivery[]).push({
            conversationId: conversation.id,
            seq,
            messageId,
          });
        } else {
          // CHAT-3: offline recipients get queued delivery, never dropped.
          perRecipient[memberId] = 'QUEUED_OFFLINE';
          (nextState.offlineQueues[memberId] as Array<{ conversationId: string; seq: number; messageId: string }>).push({
            conversationId: conversation.id,
            seq,
            messageId,
          });
          nextState.stats.offlineQueued++;
        }
      }

      conversation.messages.push({
        id: messageId,
        conversationId: conversation.id,
        seq,
        senderId: sender.id,
        text: event.payload.text,
        tick: event.tick,
        perRecipient,
      });
      if (conversation.messages.length > CHAT_CAPS.maxMessagesPerConversation) {
        conversation.messages.shift();
      }
      conversation.nextSeq = seq + 1;
      nextState.stats.messagesSent++;
      break;
    }

    case 'CHAT_HEARTBEAT': {
      const user = nextState.users[event.payload.userId];
      if (user) {
        user.lastHeartbeatTick = event.tick;
        user.idle = false;
      }
      break;
    }

    case 'CHAT_STOP_HEARTBEATS': {
      const user = nextState.users[event.payload.userId];
      if (user) {
        user.idle = true;
      }
      break;
    }

    case 'CHAT_DISCONNECT': {
      const user = nextState.users[event.payload.userId];
      if (user) {
        user.connected = false;
      }
      break;
    }

    case 'CHAT_RECONNECT': {
      const user = nextState.users[event.payload.userId];
      if (user && !user.connected) {
        user.connected = true;
        user.presence = 'ONLINE';
        user.lastHeartbeatTick = event.tick;
        user.idle = false;
        // Drain the offline queue onto the wire.
        const offline = nextState.offlineQueues[user.id] as Array<{ conversationId: string; seq: number; messageId: string }>;
        (nextState.wireQueues[user.id] as WireDelivery[]).push(...offline.map((o) => ({ ...o })));
        nextState.stats.offlineDrained += offline.length;
        offline.length = 0;
      }
      break;
    }

    case 'CHAT_READ': {
      const conversation = nextState.conversations[event.payload.conversationId];
      const user = nextState.users[event.payload.userId];
      if (!conversation || !user) break;
      for (const message of conversation.messages) {
        if (message.perRecipient[user.id] === 'DELIVERED') {
          message.perRecipient[user.id] = 'READ';
        }
      }
      break;
    }

    case 'CHAT_TYPING': {
      const conversation = nextState.conversations[event.payload.conversationId];
      const user = nextState.users[event.payload.userId];
      if (!conversation || !user) break;
      nextState.typing[`${conversation.id}::${user.id}`] = event.tick + CHAT_CAPS.typingTtl;
      break;
    }

    case 'CHAT_DELIVER_OUT_OF_ORDER': {
      // Chaos: swap the next two pending wire deliveries for this user
      // (requires >= 2 in flight — tests send two messages first).
      const queue = nextState.wireQueues[event.payload.userId] as WireDelivery[];
      if (queue.length >= 2) {
        const a = queue[0] as WireDelivery;
        queue[0] = queue[1] as WireDelivery;
        queue[1] = a;
      }
      break;
    }

    case 'CHAT_REDELIVER_LAST': {
      // Chaos: re-enqueue the recipient's last delivered message
      // (simulates reconnect before ack — the at-least-once hazard).
      const conversation = nextState.conversations[event.payload.conversationId];
      const userId = event.payload.userId;
      if (!conversation) break;
      const delivered = [...conversation.messages]
        .reverse()
        .find((m) => m.perRecipient[userId] === 'DELIVERED' || m.perRecipient[userId] === 'READ');
      if (delivered) {
        (nextState.wireQueues[userId] as WireDelivery[]).push({
          conversationId: conversation.id,
          seq: delivered.seq,
          messageId: delivered.id,
        });
      }
      break;
    }

    case 'TICK' as any:
    case 'CHAT_TICK': {
      runHeartbeats(nextState);
      updatePresence(nextState);
      drainWireQueues(nextState);
      expireTyping(nextState);
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
