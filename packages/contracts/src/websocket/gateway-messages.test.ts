import { describe, expect, it } from 'vitest';

import {
  domainActionPayloadSchema,
  GatewayServerMessageSchema,
  SessionLimitsSchema,
  validateGatewayMessage,
} from '../index.js';

describe('gateway egress contract', () => {
  const valid: unknown[] = [
    { type: 'EVENT_BATCH', payload: { tick: 5, patch: [{ op: 'replace', path: '/tick', value: 5 }] } },
    { type: 'INTENT_ACK', payload: { intentId: 'i1', status: 'ACCEPTED' } },
    { type: 'MSG_INTENT_ACK', payload: { intentId: 'i1', status: 'REJECTED', reason: 'bad intent' } },
    { type: 'INIT_SNAPSHOT', payload: { roomId: 'r1', state: null, tick: 0 } },
    { type: 'MSG_INIT_SNAPSHOT', payload: { sessionId: 'r1', serverTick: 0, topology: { tick: 0 } } },
    { type: 'INIT_SNAPSHOT_REQUIRED', payload: { roomId: 'r1' } },
    { type: 'ROOM_JOINED', payload: { roomId: 'r1' } },
    { type: 'SESSION_ERROR', payload: { code: 'RATE_LIMIT_EXCEEDED', message: 'slow down', fatal: false } },
    { type: 'MSG_SESSION_ERROR', payload: { code: 'ERR_BAD_REQUEST', message: 'nope', fatal: false } },
    { type: 'INVARIANT_VIOLATION', payload: { error: 'broker down', tick: 12 } },
    { type: 'PRESENCE_UPDATE', payload: { activeUsers: [{ userId: 'u1', name: 'Ann', role: 'STUDENT' }] } },
  ];

  it.each(valid.map((v) => [(v as { type: string }).type, v]))(
    'accepts %s',
    (_name, message) => {
      expect(validateGatewayMessage(message).ok).toBe(true);
    },
  );

  it('rejects drift: unknown type, wrong payload shape, missing fields', () => {
    const drift: unknown[] = [
      { type: 'NOT_A_MESSAGE', payload: {} },
      { type: 'EVENT_BATCH', payload: { tick: -1, patch: [] } },
      { type: 'INTENT_ACK', payload: { intentId: 'i1', status: 'MAYBE' } },
      { type: 'SESSION_ERROR', payload: { code: 'X', fatal: 'yes' } },
      { type: 'ROOM_JOINED', payload: {} },
      { payload: { roomId: 'r1' } },
      null,
      'string',
    ];
    for (const message of drift) {
      const result = validateGatewayMessage(message);
      expect(result.ok, `should reject ${String(JSON.stringify(message)).slice(0, 60)}`).toBe(false);
      expect(result.error).toBeTruthy();
    }
    expect(GatewayServerMessageSchema.safeParse({ type: 'EVENT_BATCH', payload: { tick: 1, patch: [] } }).success).toBe(
      true,
    );
  });
});

describe('SessionLimitsSchema generalization', () => {
  it('accepts generic-only limits (non-Kafka domains)', () => {
    expect(SessionLimitsSchema.safeParse({ maxTicks: 1000, maxMsgRatePerSec: 20, maxEntities: 50 }).success).toBe(true);
  });

  it('accepts Kafka-shaped limits', () => {
    expect(
      SessionLimitsSchema.safeParse({
        maxTicks: 1000,
        maxMsgRatePerSec: 20,
        maxBrokers: 5,
        maxPartitions: 100,
        maxProducers: 20,
        maxConsumers: 10,
      }).success,
    ).toBe(true);
  });

  it('requires the always-present fields', () => {
    expect(SessionLimitsSchema.safeParse({ maxEntities: 5 }).success).toBe(false);
  });
});

describe('domain action payload schemas', () => {
  it('constrains known domains and rejects malformed payloads', () => {
    expect(domainActionPayloadSchema('rate-limiter').safeParse({ clientId: 'c1', count: 5 }).success).toBe(true);
    expect(domainActionPayloadSchema('rate-limiter').safeParse({ clientId: '', count: 5 }).success).toBe(false);
    expect(domainActionPayloadSchema('rate-limiter').safeParse({ clientId: 'c1', count: -1 }).success).toBe(false);
    expect(domainActionPayloadSchema('distributed-lock').safeParse({ clientId: 'c1' }).success).toBe(true);
    expect(domainActionPayloadSchema('distributed-lock').safeParse({ clientId: 'c1', ttlMs: -5 }).success).toBe(false);
  });

  it('falls back to a permissive bounded record for unknown domains', () => {
    const schema = domainActionPayloadSchema('some-future-domain');
    expect(schema.safeParse({ anything: true, nested: { ok: 1 } }).success).toBe(true);
    expect(schema.safeParse('not-an-object').success).toBe(false);
  });
});
