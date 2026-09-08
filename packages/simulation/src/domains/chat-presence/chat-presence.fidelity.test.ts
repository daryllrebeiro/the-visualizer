import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { ChatPresenceInvariantChecker } from './chat-presence-invariants.js';
import {
  createDefaultChatPresenceCluster,
  pureChatPresenceTransition,
} from './chat-presence-state-transitions.js';
import type { ChatPresenceClusterState, ChatPresenceSimEvent } from './chat-presence-types.js';

function ev(state: ChatPresenceClusterState, event: ChatPresenceSimEvent, rng: DeterministicRNG): ChatPresenceClusterState {
  return pureChatPresenceTransition(state, event, rng).nextState;
}

describe('Chat & Presence Domain Fidelity Test Suite', () => {
  it('CHAT-1: messages deliver to every recipient in strict sequence order even when the wire reorders them', () => {
    const rng = new DeterministicRNG(1);
    let state = createDefaultChatPresenceCluster();
    state = ev(state, { id: 'send1', tick: 1, type: 'CHAT_SEND', payload: { conversationId: 'direct-alice-bob', senderId: 'alice', text: 'hello' } }, rng);
    state = ev(state, { id: 'send2', tick: 2, type: 'CHAT_SEND', payload: { conversationId: 'direct-alice-bob', senderId: 'alice', text: 'still there?' } }, rng);
    state = ev(state, { id: 'send3', tick: 3, type: 'CHAT_SEND', payload: { conversationId: 'direct-alice-bob', senderId: 'bob', text: 'yes!' } }, rng);

    // Force out-of-order delivery for bob: swap the two pending messages.
    state = ev(state, { id: 'ooo', tick: 3, type: 'CHAT_DELIVER_OUT_OF_ORDER', payload: { userId: 'bob' } }, rng);
    state = ev(state, { id: 'drain', tick: 3, type: 'CHAT_TICK', payload: {} }, rng);

    const conv = state.conversations['direct-alice-bob']!;
    expect(state.recvBuffers['bob']).toHaveLength(0); // buffer fully drained
    expect(state.stats.outOfOrderHeld).toBeGreaterThan(0);
    expect(state.stats.outOfOrderReleased).toBeGreaterThan(0);
    // Final delivery statuses: every message delivered to both members.
    for (const message of conv.messages) {
      expect(message.perRecipient['bob']).toBe('DELIVERED');
      expect(message.perRecipient['alice']).toBe('DELIVERED');
    }
    // bob consumed seqs 1, 2, 3 in order (next expected = 4).
    expect(state.nextExpectedSeq['bob::direct-alice-bob']).toBe(4);

    const checker = new ChatPresenceInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('CHAT-2: presence transitions ONLINE -> AWAY -> OFFLINE within the staleness bounds after heartbeats stop', () => {
    const rng = new DeterministicRNG(2);
    let state = createDefaultChatPresenceCluster();

    // carol stops heartbeating (silently goes stale while connected).
    state = ev(state, { id: 'stop', tick: 5, type: 'CHAT_STOP_HEARTBEATS', payload: { userId: 'carol' } }, rng);
    const lastBeat = state.users['carol']!.lastHeartbeatTick;

    // Within 2*interval+1 = 7 ticks of the last beat: still ONLINE.
    for (let t = 6; t <= lastBeat + 7; t++) {
      state = ev(state, { id: `t${t}`, tick: t, type: 'CHAT_TICK', payload: {} }, rng);
      expect(state.users['carol']!.presence).toBe('ONLINE');
    }
    // One tick past the bound: AWAY (never indefinitely stale).
    state = ev(state, { id: 't-away', tick: lastBeat + 8, type: 'CHAT_TICK', payload: {} }, rng);
    expect(state.users['carol']!.presence).toBe('AWAY');

    // Past offlineTtl: OFFLINE (staleFor > 20).
    for (let t = lastBeat + 9; t <= lastBeat + 22; t++) {
      state = ev(state, { id: `t2${t}`, tick: t, type: 'CHAT_TICK', payload: {} }, rng);
    }
    expect(state.users['carol']!.presence).toBe('OFFLINE');

    const checker = new ChatPresenceInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('CHAT-3: group fanout delivers to every online member and queues for offline members', () => {
    const rng = new DeterministicRNG(3);
    let state = createDefaultChatPresenceCluster();

    // dave and erin disconnect before the message.
    state = ev(state, { id: 'd-dave', tick: 1, type: 'CHAT_DISCONNECT', payload: { userId: 'dave' } }, rng);
    state = ev(state, { id: 'd-erin', tick: 1, type: 'CHAT_DISCONNECT', payload: { userId: 'erin' } }, rng);
    state = ev(state, { id: 't1', tick: 1, type: 'CHAT_TICK', payload: {} }, rng);
    expect(state.users['dave']!.presence).toBe('OFFLINE');

    // Group message: 5 members — sender + 2 online + 2 offline.
    state = ev(
      state,
      { id: 'send', tick: 2, type: 'CHAT_SEND', payload: { conversationId: 'team-alpha', senderId: 'alice', text: 'standup in 5' } },
      rng,
    );
    state = ev(state, { id: 't2', tick: 2, type: 'CHAT_TICK', payload: {} }, rng);

    const message = state.conversations['team-alpha']!.messages[0]!;
    expect(message.perRecipient['alice']).toBe('DELIVERED'); // sender
    expect(message.perRecipient['bob']).toBe('DELIVERED');
    expect(message.perRecipient['carol']).toBe('DELIVERED');
    expect(message.perRecipient['dave']).toBe('QUEUED_OFFLINE');
    expect(message.perRecipient['erin']).toBe('QUEUED_OFFLINE');
    expect(state.stats.offlineQueued).toBe(2);

    // Reconnect drains the offline queue — no dropped recipient.
    state = ev(state, { id: 'r-dave', tick: 3, type: 'CHAT_RECONNECT', payload: { userId: 'dave' } }, rng);
    state = ev(state, { id: 't3', tick: 3, type: 'CHAT_TICK', payload: {} }, rng);
    // Re-read the message from the CURRENT state (reducers deep-clone).
    const messageAfter = state.conversations['team-alpha']!.messages[0]!;
    expect(messageAfter.perRecipient['dave']).toBe('DELIVERED');
    expect(state.stats.offlineDrained).toBe(1);

    const checker = new ChatPresenceInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('CHAT-3: invariant checker catches a dropped recipient status', () => {
    const rng = new DeterministicRNG(4);
    let state = createDefaultChatPresenceCluster();
    state = ev(
      state,
      { id: 'send', tick: 1, type: 'CHAT_SEND', payload: { conversationId: 'team-alpha', senderId: 'alice', text: 'ping' } },
      rng,
    );
    state = ev(state, { id: 't1', tick: 1, type: 'CHAT_TICK', payload: {} }, rng);

    // Simulate a fanout bug: erase carol's status entirely.
    const tampered = JSON.parse(JSON.stringify(state)) as ChatPresenceClusterState;
    delete tampered.conversations['team-alpha']!.messages[0]!.perRecipient['carol'];

    const checker = new ChatPresenceInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('CHAT-3');
    expect(violation?.description).toContain('silently dropped');

    // Also: a stuck SENT with an empty wire queue.
    const tampered2 = JSON.parse(JSON.stringify(state)) as ChatPresenceClusterState;
    tampered2.conversations['team-alpha']!.messages[0]!.perRecipient['erin'] = 'SENT';
    const v2 = new ChatPresenceInvariantChecker().check(tampered2);
    expect(v2).toBeDefined();
    expect(v2?.ruleId).toBe('CHAT-3');
    expect(v2?.description).toContain('stuck in SENT');
  });

  it('CHAT-4: redelivery (reconnect before ack) is caught by client-side dedup — no duplicate display', () => {
    const rng = new DeterministicRNG(5);
    let state = createDefaultChatPresenceCluster();

    state = ev(
      state,
      { id: 'send1', tick: 1, type: 'CHAT_SEND', payload: { conversationId: 'direct-alice-bob', senderId: 'alice', text: 'first' } },
      rng,
    );
    state = ev(
      state,
      { id: 'send2', tick: 2, type: 'CHAT_SEND', payload: { conversationId: 'direct-alice-bob', senderId: 'alice', text: 'second' } },
      rng,
    );
    state = ev(state, { id: 't', tick: 2, type: 'CHAT_TICK', payload: {} }, rng);
    expect(state.nextExpectedSeq['bob::direct-alice-bob']).toBe(3);

    // Redeliver both messages (reconnect replay).
    state = ev(state, { id: 'rd1', tick: 3, type: 'CHAT_REDELIVER_LAST', payload: { conversationId: 'direct-alice-bob', userId: 'bob' } }, rng);
    state = ev(state, { id: 'rd2', tick: 3, type: 'CHAT_REDELIVER_LAST', payload: { conversationId: 'direct-alice-bob', userId: 'bob' } }, rng);
    state = ev(state, { id: 't2', tick: 3, type: 'CHAT_TICK', payload: {} }, rng);

    // Dedup caught both — expected seq unchanged, no duplicate deliveries
    // (the original two deliveries each for alice and bob: the sender
    // pipeline delivers own messages in order too).
    expect(state.stats.dedupHits).toBe(2);
    expect(state.nextExpectedSeq['bob::direct-alice-bob']).toBe(3);
    expect(state.stats.deliveries).toBe(4); // exactly the original four

    const checker = new ChatPresenceInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('typing indicators expire after their TTL', () => {
    const rng = new DeterministicRNG(6);
    let state = createDefaultChatPresenceCluster();
    state = ev(
      state,
      { id: 'typing', tick: 1, type: 'CHAT_TYPING', payload: { conversationId: 'direct-alice-bob', userId: 'bob' } },
      rng,
    );
    expect(state.typing['direct-alice-bob::bob']).toBe(11); // tick 1 + TTL 10

    for (let t = 2; t <= 10; t++) {
      state = ev(state, { id: `t${t}`, tick: t, type: 'CHAT_TICK', payload: {} }, rng);
    }
    expect(state.typing['direct-alice-bob::bob']).toBeDefined();
    state = ev(state, { id: 't11', tick: 11, type: 'CHAT_TICK', payload: {} }, rng);
    expect(state.typing['direct-alice-bob::bob']).toBeUndefined();
  });

  it('read receipts mark delivered messages as READ without touching undelivered ones', () => {
    const rng = new DeterministicRNG(7);
    let state = createDefaultChatPresenceCluster();

    // dave offline: message to him queues, others deliver.
    state = ev(state, { id: 'd', tick: 1, type: 'CHAT_DISCONNECT', payload: { userId: 'dave' } }, rng);
    state = ev(
      state,
      { id: 'send', tick: 2, type: 'CHAT_SEND', payload: { conversationId: 'team-alpha', senderId: 'alice', text: 'hello team' } },
      rng,
    );
    state = ev(state, { id: 't', tick: 2, type: 'CHAT_TICK', payload: {} }, rng);

    state = ev(state, { id: 'read', tick: 3, type: 'CHAT_READ', payload: { conversationId: 'team-alpha', userId: 'carol' } }, rng);
    const message = state.conversations['team-alpha']!.messages[0]!;
    expect(message.perRecipient['carol']).toBe('READ');
    expect(message.perRecipient['dave']).toBe('QUEUED_OFFLINE'); // untouched
    expect(message.perRecipient['bob']).toBe('DELIVERED');
  });

  it('per-user send throttle rejects same-tick duplicate sends (rate-limit seam)', () => {
    const rng = new DeterministicRNG(8);
    let state = createDefaultChatPresenceCluster();
    state = ev(
      state,
      { id: 's1', tick: 1, type: 'CHAT_SEND', payload: { conversationId: 'direct-alice-bob', senderId: 'alice', text: 'one' } },
      rng,
    );
    state = ev(
      state,
      { id: 's2', tick: 1, type: 'CHAT_SEND', payload: { conversationId: 'direct-alice-bob', senderId: 'alice', text: 'two' } },
      rng,
    );
    expect(state.stats.throttleRejections).toBe(1);
    expect(state.conversations['direct-alice-bob']!.messages.length).toBe(1);
  });

  it('CHAT-1: invariant checker catches a delivered message past the expected sequence (a skipped seq)', () => {
    const rng = new DeterministicRNG(9);
    let state = createDefaultChatPresenceCluster();
    state = ev(
      state,
      { id: 'send', tick: 1, type: 'CHAT_SEND', payload: { conversationId: 'direct-alice-bob', senderId: 'alice', text: 'x' } },
      rng,
    );
    state = ev(state, { id: 't', tick: 1, type: 'CHAT_TICK', payload: {} }, rng);

    // Simulate a client bug: rewind the expected seq to 1 while seq 1
    // is already DELIVERED — the delivered set and the client's cursor
    // contradict each other (delivery skipped past the cursor).
    const tampered = JSON.parse(JSON.stringify(state)) as ChatPresenceClusterState;
    tampered.nextExpectedSeq['bob::direct-alice-bob'] = 1;

    const checker = new ChatPresenceInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('CHAT-1');
    expect(violation?.description).toContain('skipped a sequence number');
  });

  it('CHAT-2: invariant checker catches stale ONLINE presence beyond the bound', () => {
    const rng = new DeterministicRNG(10);
    let state = createDefaultChatPresenceCluster();
    state = ev(state, { id: 'stop', tick: 1, type: 'CHAT_STOP_HEARTBEATS', payload: { userId: 'frank' } }, rng);
    for (let t = 2; t <= 21; t++) {
      state = ev(state, { id: `t${t}`, tick: t, type: 'CHAT_TICK', payload: {} }, rng);
    }
    // frank should be OFFLINE by now (staleFor = 21 > offlineTtl 20).
    expect(state.users['frank']!.presence).toBe('OFFLINE');

    // Tamper: show frank ONLINE with a very stale heartbeat.
    const tampered = JSON.parse(JSON.stringify(state)) as ChatPresenceClusterState;
    tampered.users['frank']!.presence = 'ONLINE';
    const checker = new ChatPresenceInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('CHAT-2');
    expect(violation?.description).toContain('stale presence');
  });

  it('golden determinism: identical event sequences with identical seeds produce identical state', () => {
    const runChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultChatPresenceCluster();
      state = ev(state, { id: 'd', tick: 1, type: 'CHAT_DISCONNECT', payload: { userId: 'erin' } }, rng);
      state = ev(
        state,
        { id: 's1', tick: 2, type: 'CHAT_SEND', payload: { conversationId: 'team-alpha', senderId: 'alice', text: 'msg one' } },
        rng,
      );
      state = ev(
        state,
        { id: 's2', tick: 3, type: 'CHAT_SEND', payload: { conversationId: 'team-alpha', senderId: 'bob', text: 'msg two' } },
        rng,
      );
      state = ev(state, { id: 'ooo', tick: 3, type: 'CHAT_DELIVER_OUT_OF_ORDER', payload: { userId: 'carol' } }, rng);
      state = ev(state, { id: 't3', tick: 3, type: 'CHAT_TICK', payload: {} }, rng);
      state = ev(
        state,
        { id: 's3', tick: 4, type: 'CHAT_SEND', payload: { conversationId: 'direct-alice-bob', senderId: 'bob', text: 'direct msg' } },
        rng,
      );
      state = ev(state, { id: 't4', tick: 4, type: 'CHAT_TICK', payload: {} }, rng);
      state = ev(state, { id: 'rd', tick: 5, type: 'CHAT_REDELIVER_LAST', payload: { conversationId: 'direct-alice-bob', userId: 'alice' } }, rng);
      state = ev(state, { id: 'r', tick: 5, type: 'CHAT_RECONNECT', payload: { userId: 'erin' } }, rng);
      state = ev(state, { id: 't5', tick: 5, type: 'CHAT_TICK', payload: {} }, rng);
      state = ev(state, { id: 'read', tick: 6, type: 'CHAT_READ', payload: { conversationId: 'team-alpha', userId: 'bob' } }, rng);
      return JSON.stringify(state);
    };
    expect(runChaos()).toBe(runChaos());
  });
});
