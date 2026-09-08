'use client';

import React, { useState } from 'react';

import type { ChatPresenceClusterState, ChatPresenceSimEvent } from '@the-visualizer/simulation';
import { Badge, ControlButton, Panel, StatRow } from '../new-domains/shared';

export interface ChatPresenceVisualizerProps {
  state: ChatPresenceClusterState;
  dispatch: (event: ChatPresenceSimEvent) => void;
}

const PRESENCE_COLORS: Record<string, string> = {
  ONLINE: '#10b981',
  AWAY: '#f59e0b',
  OFFLINE: '#475569',
};

const STATUS_TICKS: Record<string, string> = {
  SENT: '✓',
  DELIVERED: '✓✓',
  READ: '✓✓✓',
  QUEUED_OFFLINE: '💾',
  HELD_OUT_OF_ORDER: '⏸',
};

export function ChatPresenceVisualizer({ state, dispatch }: ChatPresenceVisualizerProps): React.JSX.Element {
  const [conversationId, setConversationId] = useState('direct-alice-bob');
  const [senderId, setSenderId] = useState('alice');
  const [text, setText] = useState('');
  const conversation = state.conversations[conversationId]!;
  const ev = (type: ChatPresenceSimEvent['type'], payload: Record<string, unknown>): void => {
    dispatch({ id: `cp-${Math.random().toString(36).slice(2, 8)}`, tick: state.tick + 1, type, payload } as ChatPresenceSimEvent);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Panel
        title="Real-Time Chat & Presence — Sequence Ordering, Dedup, Fanout"
        subtitle={`tick ${state.tick} · heartbeat every ${state.heartbeatInterval}t · away after 2h+1 · offline after ${state.offlineTtl}t`}
        accent="#06b6d4"
        right={<ControlButton label="Tick (deliveries + presence)" tone="success" onClick={() => ev('CHAT_TICK', {})} />}
      >
        <StatRow
          items={[
            { label: 'Sent', value: String(state.stats.messagesSent) },
            { label: 'Delivered', value: String(state.stats.deliveries) },
            { label: 'Dedup hits (CHAT-4)', value: String(state.stats.dedupHits), color: state.stats.dedupHits > 0 ? '#f59e0b' : undefined },
            { label: 'Held OOO (CHAT-1)', value: String(state.stats.outOfOrderHeld) },
            { label: 'Offline queued', value: String(state.stats.offlineQueued) },
            { label: 'Throttled', value: String(state.stats.throttleRejections) },
          ]}
        />
      </Panel>

      <Panel title="Presence grid — staleness bounds (CHAT-2)" accent="#10b981">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {state.userOrder.map((id) => {
            const user = state.users[id]!;
            return (
              <div
                key={id}
                style={{
                  backgroundColor: '#020617',
                  border: `1px solid ${PRESENCE_COLORS[user.presence]}`,
                  borderRadius: '8px',
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  minWidth: '130px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: '#f8fafc', fontSize: '0.8rem' }}>{id}</strong>
                  <Badge text={user.presence} color={PRESENCE_COLORS[user.presence] as string} />
                </div>
                <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                  last beat t{user.lastHeartbeatTick}
                  {!user.connected && ' · socket closed'}
                </span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {user.connected ? (
                    <>
                      <ControlButton label="💔 Disconnect" tone="danger" onClick={() => ev('CHAT_DISCONNECT', { userId: id })} />
                      <ControlButton label="😴 Stop beats" tone="warn" onClick={() => ev('CHAT_STOP_HEARTBEATS', { userId: id })} />
                    </>
                  ) : (
                    <ControlButton label="🔌 Reconnect" tone="success" onClick={() => ev('CHAT_RECONNECT', { userId: id })} />
                  )}
                  <ControlButton label="❤️ Beat" onClick={() => ev('CHAT_HEARTBEAT', { userId: id })} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="Conversation — per-recipient delivery status"
        subtitle={`${conversationId} · next seq ${conversation.nextSeq}`}
        accent="#38bdf8"
        right={
          <div style={{ display: 'flex', gap: '6px' }}>
            {Object.keys(state.conversations).map((id) => (
              <ControlButton
                key={id}
                label={id}
                tone={conversationId === id ? 'success' : 'default'}
                onClick={() => setConversationId(id)}
              />
            ))}
          </div>
        }
      >
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <select
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
            style={{
              backgroundColor: '#020617',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 8px',
              color: '#e2e8f0',
              fontSize: '0.8rem',
            }}
          >
            {conversation.members.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="message…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim().length > 0) {
                ev('CHAT_SEND', { conversationId, senderId, text: text.trim() });
                setText('');
              }
            }}
            style={{
              flex: 1,
              minWidth: '180px',
              backgroundColor: '#020617',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 10px',
              color: '#e2e8f0',
              fontSize: '0.8rem',
            }}
          />
          <ControlButton
            label="Send"
            tone="success"
            disabled={text.trim().length === 0}
            onClick={() => {
              ev('CHAT_SEND', { conversationId, senderId, text: text.trim() });
              setText('');
            }}
          />
          <ControlButton label="⌨️ Typing…" onClick={() => ev('CHAT_TYPING', { conversationId, userId: senderId })} />
        </div>

        {Object.keys(state.typing)
          .filter((k) => k.startsWith(`${conversationId}::`))
          .map((k) => {
            const [, user] = k.split('::');
            return (
              <div key={k} style={{ fontSize: '0.7rem', color: '#f59e0b', marginBottom: '4px' }}>
                {user} is typing… (expires t{state.typing[k]})
              </div>
            );
          })}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
          {conversation.messages.length === 0 && (
            <div style={{ color: '#475569', fontSize: '0.8rem' }}>No messages yet.</div>
          )}
          {[...conversation.messages].map((m) => {
            const isMine = m.senderId === senderId;
            const statusList = conversation.members
              .filter((mem) => mem !== m.senderId)
              .map((mem) => `${mem}: ${STATUS_TICKS[m.perRecipient[mem] ?? 'SENT'] ?? '?'}`)
              .join('  ');
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    backgroundColor: isMine ? '#1e3a5f' : '#1e293b',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    maxWidth: '70%',
                  }}
                >
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                    <strong style={{ color: isMine ? '#38bdf8' : '#10b981' }}>{m.senderId}</strong> · seq {m.seq} · t{m.tick}
                  </div>
                  <div style={{ color: '#e2e8f0', fontSize: '0.8rem' }}>{m.text}</div>
                  <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{statusList}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
          <ControlButton
            label="🔀 Deliver out-of-order to a recipient (CHAT-1)"
            tone="warn"
            onClick={() => {
              const recipient = conversation.members.find((m) => m !== senderId);
              if (recipient) ev('CHAT_DELIVER_OUT_OF_ORDER', { userId: recipient });
            }}
          />
          <ControlButton
            label="🔁 Redeliver last (reconnect before ack, CHAT-4)"
            tone="warn"
            onClick={() => {
              const recipient = conversation.members.find((m) => m !== senderId);
              if (recipient) ev('CHAT_REDELIVER_LAST', { conversationId, userId: recipient });
            }}
          />
          <ControlButton label="👁 Mark all read" onClick={() => ev('CHAT_READ', { conversationId, userId: senderId })} />
        </div>
      </Panel>

      <Panel title="Client receive buffers (out-of-order holds)" accent="#f59e0b">
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {state.userOrder.map((id) => {
            const buffer = state.recvBuffers[id] ?? [];
            const expected = Object.entries(state.nextExpectedSeq)
              .filter(([k]) => k.startsWith(`${id}::`))
              .map(([k, v]) => `${k.split('::')[1]}→${v}`)
              .join('  ');
            return (
              <div key={id} style={{ fontSize: '0.7rem', color: buffer.length > 0 ? '#f59e0b' : '#64748b' }}>
                <strong>{id}</strong>: {buffer.length} held · expected {expected || 'seq 1'}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
