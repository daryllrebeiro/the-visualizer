'use client';

import React, { useState } from 'react';

import type {
  BindingSpec,
  ExchangeSpec,
  RabbitClusterState,
  RabbitConsumer,
  RabbitQueue,
} from '@the-visualizer/simulation';

interface RabbitMQVisualizerProps {
  state: RabbitClusterState;
  onPublish: (
    exchangeName: string,
    routingKey: string,
    payload: string,
    ttl: number | null,
  ) => void;
  onAck: (messageId: string, consumerId: string) => void;
  onNack: (messageId: string, consumerId: string, requeue: boolean) => void;
  onReject: (messageId: string, consumerId: string) => void;
}

export function RabbitMQVisualizer({
  state,
  onPublish,
  onAck,
  onNack,
  onReject,
}: RabbitMQVisualizerProps): React.JSX.Element {
  const [selectedExchange, setSelectedExchange] = useState<string>('amq.topic');
  const [routingKeyInput, setRoutingKeyInput] = useState<string>('orders.eu.electronics');
  const [payloadInput, setPayloadInput] = useState<string>('{"orderId":"101","total":89.99}');
  const [ttlInput, setTtlInput] = useState<string>('');

  const exchanges = Object.values(state.exchanges) as ExchangeSpec[];
  const queues = Object.values(state.queues) as RabbitQueue[];
  const bindings = Object.values(state.bindings) as BindingSpec[];
  const consumers = Object.values(state.consumers) as RabbitConsumer[];

  const handlePublishSubmit = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    if (!selectedExchange || !payloadInput.trim()) return;
    const ttl = ttlInput.trim() ? parseInt(ttlInput.trim(), 10) : null;
    onPublish(selectedExchange, routingKeyInput.trim(), payloadInput.trim(), ttl);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '16px',
      }}
    >
      {/* Top Banner: Cluster Metrics & Publish Form */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.4rem' }}>🐇</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
              RabbitMQ (AMQP 0-9-1 Exchanges, Queues & Dead-Letter Routing)
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Published: <strong style={{ color: '#38bdf8' }}>{state.totalPublished}</strong> ·
              Acked: <strong style={{ color: '#4ade80' }}>{state.totalAcked}</strong> · Nacked:{' '}
              <strong style={{ color: '#fbbf24' }}>{state.totalNacked}</strong> · Dead-Lettered
              (DLX): <strong style={{ color: '#f43f5e' }}>{state.totalDeadLettered}</strong>
            </span>
          </div>
        </div>

        {/* Publish Toolbar */}
        <form
          onSubmit={handlePublishSubmit}
          style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}
        >
          <select
            value={selectedExchange}
            onChange={(e) => setSelectedExchange(e.target.value)}
            aria-label="Target RabbitMQ exchange"
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
            }}
          >
            {exchanges.map((ex) => (
              <option key={ex.name} value={ex.name}>
                {ex.name} ({ex.type})
              </option>
            ))}
          </select>
          <input
            type="text"
            value={routingKeyInput}
            onChange={(e) => setRoutingKeyInput(e.target.value)}
            placeholder="Routing Key e.g. orders.eu.fast"
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              width: '150px',
            }}
          />
          <input
            type="text"
            value={payloadInput}
            onChange={(e) => setPayloadInput(e.target.value)}
            placeholder="Payload"
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              width: '160px',
            }}
          />
          <input
            type="number"
            value={ttlInput}
            onChange={(e) => setTtlInput(e.target.value)}
            placeholder="TTL (opt)"
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '4px',
              width: '65px',
            }}
          />
          <button
            type="submit"
            className="btn btn--primary"
            style={{ padding: '5px 10px', fontSize: '0.75rem' }}
          >
            ✉️ Publish
          </button>
        </form>
      </div>

      {/* AMQP Topology Canvas: 3 Columns [ Exchanges -> Queues -> Consumers ] */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 1fr 280px',
          gap: '16px',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Column 1: Exchanges */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            backgroundColor: '#0f172a',
            borderRadius: '8px',
            padding: '12px',
            border: '1px solid #1e293b',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#f8fafc',
              borderBottom: '1px solid #1e293b',
              paddingBottom: '6px',
            }}
          >
            🔀 Exchanges ({exchanges.length})
          </div>
          {exchanges.map((ex) => {
            const exBindings = bindings.filter((b) => b.exchangeName === ex.name);
            return (
              <div
                key={ex.id}
                style={{
                  backgroundColor: '#020617',
                  border: `1px solid ${ex.color}60`,
                  borderRadius: '6px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#f8fafc' }}>
                    {ex.name}
                  </span>
                  <span
                    style={{
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '3px',
                      backgroundColor: `${ex.color}20`,
                      color: ex.color,
                    }}
                  >
                    {ex.type.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                  Bindings ({exBindings.length}):
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      marginTop: '2px',
                    }}
                  >
                    {exBindings.map((b) => (
                      <span key={b.id} style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>
                        → {b.queueName} {b.routingKeyPattern ? `[${b.routingKeyPattern}]` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Column 2: Queues */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            backgroundColor: '#0f172a',
            borderRadius: '8px',
            padding: '12px',
            border: '1px solid #1e293b',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#f8fafc',
              borderBottom: '1px solid #1e293b',
              paddingBottom: '6px',
            }}
          >
            📥 Queues & Buffers ({queues.length})
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
            }}
          >
            {queues.map((q) => {
              const isDLQ = q.name.includes('dlx') || q.name.includes('dead');
              return (
                <div
                  key={q.id}
                  style={{
                    backgroundColor: isDLQ ? 'rgba(244, 63, 94, 0.05)' : '#020617',
                    border: isDLQ ? '1px solid rgba(244, 63, 94, 0.5)' : `1px solid ${q.color}60`,
                    borderRadius: '6px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        color: isDLQ ? '#f43f5e' : '#f8fafc',
                      }}
                    >
                      {q.name}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                      {q.messages.length} / {q.maxQueueLength} msgs
                    </span>
                  </div>

                  {q.deadLetterExchange && (
                    <div style={{ fontSize: '0.65rem', color: '#fca5a5' }}>
                      DLX: <code>{q.deadLetterExchange}</code>
                    </div>
                  )}

                  {/* Messages List */}
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: '#0f172a',
                      padding: '4px',
                      borderRadius: '4px',
                      minHeight: '60px',
                      maxHeight: '120px',
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                    }}
                  >
                    {q.messages.length === 0 ? (
                      <span style={{ fontSize: '0.65rem', color: '#475569', fontStyle: 'italic' }}>
                        (empty buffer)
                      </span>
                    ) : (
                      q.messages.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            fontSize: '0.65rem',
                            fontFamily: 'monospace',
                            padding: '2px 4px',
                            backgroundColor: '#020617',
                            borderRadius: '3px',
                            border: '1px solid #1e293b',
                            display: 'flex',
                            justifyContent: 'space-between',
                            color:
                              m.state === 'DeadLettered'
                                ? '#f43f5e'
                                : m.assignedConsumerId
                                  ? '#4ade80'
                                  : '#cbd5e1',
                          }}
                        >
                          <span>{m.routingKey}</span>
                          <span>
                            {m.state} {m.ttl !== null ? `(ttl:${m.ttl})` : ''}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 3: Consumers Worker Pool */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            backgroundColor: '#0f172a',
            borderRadius: '8px',
            padding: '12px',
            border: '1px solid #1e293b',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#f8fafc',
              borderBottom: '1px solid #1e293b',
              paddingBottom: '6px',
            }}
          >
            👷 Consumer Pool ({consumers.length})
          </div>
          {consumers.map((c) => (
            <div
              key={c.id}
              style={{
                backgroundColor: '#020617',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#f8fafc' }}>
                  {c.name}
                </span>
                <span style={{ fontSize: '0.65rem', color: '#38bdf8' }}>
                  Prefetch: {c.prefetchCount}
                </span>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                Bound: <code>{c.queueName}</code>
              </div>

              {/* Active Messages with Ack / Reject Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {c.activeMessages.length === 0 ? (
                  <span style={{ fontSize: '0.65rem', color: '#475569', fontStyle: 'italic' }}>
                    (idle / awaiting messages)
                  </span>
                ) : (
                  c.activeMessages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: '4px',
                        backgroundColor: '#0f172a',
                        borderRadius: '4px',
                        border: '1px solid #334155',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                      }}
                    >
                      <div
                        style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: '#f8fafc' }}
                      >
                        {m.routingKey}: &quot;{m.payload}&quot;
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => onAck(m.id, c.id)}
                          className="btn btn--emerald"
                          style={{ flex: 1, fontSize: '0.6rem', padding: '2px 4px' }}
                        >
                          ✓ Ack
                        </button>
                        <button
                          onClick={() => onNack(m.id, c.id, true)}
                          className="btn btn--secondary"
                          style={{ flex: 1, fontSize: '0.6rem', padding: '2px 4px' }}
                        >
                          ↺ Requeue
                        </button>
                        <button
                          onClick={() => onReject(m.id, c.id)}
                          className="btn btn--rose"
                          style={{ flex: 1, fontSize: '0.6rem', padding: '2px 4px' }}
                        >
                          ☠ Reject (DLX)
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
