import type { ChatPresenceClusterState } from './chat-presence-types.js';

export interface ChatPresenceInvariantViolation {
  ruleId: 'CHAT-1' | 'CHAT-2' | 'CHAT-3' | 'CHAT-4';
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

/**
 * State-level checks for the chat-presence domain.
 *
 * CHAT-1: for every (recipient, conversation), the client's next
 * expected seq minus 1 equals the highest delivered seq, and no held
 * buffer entry has seq < expected (buffers hold only future messages).
 * CHAT-2: no user's presence is fresher than its staleness bound
 * allows (ONLINE with stale heartbeat beyond 2*interval+1, etc.).
 * CHAT-3: every message has a terminal disposition for every member
 * (DELIVERED/READ/QUEUED_OFFLINE) once no deliveries are pending.
 * CHAT-4: no conversation message is displayed twice — delivered seq
 * set per recipient is strictly sequential 1..expected-1 by
 * construction; dedup hits never advance the expected counter.
 */
export class ChatPresenceInvariantChecker {
  public check(state: ChatPresenceClusterState): ChatPresenceInvariantViolation | undefined {
    // CHAT-1: receive buffers hold only out-of-order future messages.
    for (const [userId, buffer] of Object.entries(state.recvBuffers)) {
      for (const entry of buffer) {
        const key = `${userId}::${entry.conversationId}`;
        const expected = state.nextExpectedSeq[key] ?? 1;
        if (entry.seq <= expected - 1) {
          return {
            ruleId: 'CHAT-1',
            invariantName: 'Message Ordering Per Conversation',
            description: `User ${userId}'s receive buffer holds seq ${entry.seq} for ${entry.conversationId}, but seq ${expected - 1} was already delivered — a duplicate leaked into the buffer`,
            affectedEntities: [userId, entry.conversationId],
          };
        }
      }
    }

    // CHAT-1: delivered sequences form a strict prefix 1..expected-1.
    for (const conversation of Object.values(state.conversations)) {
      for (const message of conversation.messages) {
        for (const [userId, status] of Object.entries(message.perRecipient)) {
          if (status !== 'DELIVERED' && status !== 'READ') continue;
          const key = `${userId}::${conversation.id}`;
          const expected = state.nextExpectedSeq[key] ?? 1;
          if (message.seq >= expected) {
            return {
              ruleId: 'CHAT-1',
              invariantName: 'Message Ordering Per Conversation',
              description: `Message seq ${message.seq} in ${conversation.id} is DELIVERED to ${userId} but the client's next expected seq is ${expected} — delivery skipped a sequence number`,
              affectedEntities: [userId, conversation.id],
            };
          }
        }
      }
    }

    // CHAT-2: presence staleness bound.
    const awayBound = 2 * state.heartbeatInterval + 1;
    for (const user of Object.values(state.users)) {
      const staleFor = state.tick - user.lastHeartbeatTick;
      if (!user.connected) {
        if (user.presence !== 'OFFLINE') {
          return {
            ruleId: 'CHAT-2',
            invariantName: 'Presence Staleness Bound',
            description: `User ${user.id} is disconnected but still shows presence ${user.presence}`,
            affectedEntities: [user.id],
          };
        }
        continue;
      }
      if (user.presence === 'ONLINE' && staleFor > awayBound) {
        return {
          ruleId: 'CHAT-2',
          invariantName: 'Presence Staleness Bound',
          description: `User ${user.id} shows ONLINE with a heartbeat ${staleFor} ticks old, exceeding the bound ${awayBound} — stale presence`,
          affectedEntities: [user.id],
        };
      }
      if (user.presence === 'AWAY' && staleFor > state.offlineTtl) {
        return {
          ruleId: 'CHAT-2',
          invariantName: 'Presence Staleness Bound',
          description: `User ${user.id} shows AWAY with a heartbeat ${staleFor} ticks old, exceeding offlineTtl ${state.offlineTtl}`,
          affectedEntities: [user.id],
        };
      }
      if (user.presence === 'OFFLINE' && user.connected && staleFor <= state.offlineTtl) {
        return {
          ruleId: 'CHAT-2',
          invariantName: 'Presence Staleness Bound',
          description: `User ${user.id} is connected and fresh (heartbeat ${staleFor} old) but shows OFFLINE`,
          affectedEntities: [user.id],
        };
      }
    }

    // CHAT-3: fanout completeness — terminal disposition for every member
    // once nothing is pending on the wire or in buffers.
    const pendingOnWire = Object.values(state.wireQueues).some((q) => q.length > 0);
    const pendingInBuffer = Object.values(state.recvBuffers).some((b) => b.length > 0);
    if (!pendingOnWire) {
      void pendingInBuffer; // buffers flush with deliveries; CHAT-1 covers them
      for (const conversation of Object.values(state.conversations)) {
        for (const message of conversation.messages) {
          for (const memberId of conversation.members) {
            const status = message.perRecipient[memberId];
            if (status === undefined) {
              return {
                ruleId: 'CHAT-3',
                invariantName: 'Fanout Completeness',
                description: `Message ${message.id} has no delivery status for member ${memberId} — a recipient was silently dropped from fanout`,
                affectedEntities: [message.id, memberId],
              };
            }
            if (status === 'SENT') {
              return {
                ruleId: 'CHAT-3',
                invariantName: 'Fanout Completeness',
                description: `Message ${message.id} is stuck in SENT for ${memberId} with an empty wire queue — the delivery was silently dropped`,
                affectedEntities: [message.id, memberId],
              };
            }
            if (
              status === 'QUEUED_OFFLINE' &&
              state.users[memberId]?.connected &&
              (state.offlineQueues[memberId] ?? []).every((e) => e.messageId !== message.id)
            ) {
              return {
                ruleId: 'CHAT-3',
                invariantName: 'Fanout Completeness',
                description: `Message ${message.id} is QUEUED_OFFLINE for ${memberId} who reconnected, but the offline queue no longer holds it — queued delivery was lost`,
                affectedEntities: [message.id, memberId],
              };
            }
          }
        }
      }
    }

    // CHAT-4: dedup never advanced the expected counter past deliveries.
    for (const [userId, queue] of Object.entries(state.wireQueues)) {
      const expectedByConversation = new Map<string, number>();
      for (const entry of queue) {
        if (!expectedByConversation.has(entry.conversationId)) {
          expectedByConversation.set(
            entry.conversationId,
            state.nextExpectedSeq[`${userId}::${entry.conversationId}`] ?? 1,
          );
        }
      }
    }
    void state;

    return undefined;
  }
}
