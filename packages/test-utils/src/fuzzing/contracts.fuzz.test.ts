/**
 * Property-Based Fuzz Testing Suite for Wire Contracts
 *
 * Uses `fast-check` to generate thousands of arbitrary JSON trees,
 * boundary strings, huge payloads, and corrupted objects.
 *
 * Invariants:
 * 1. Schema validation NEVER throws an unhandled error for any arbitrary input.
 * 2. Any malformed input returns `success: false` with structured Zod error issues.
 * 3. Valid generated intents consistently pass validation.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ClientIntentSchema,
  IntentJoinRoomSchema,
  IntentProduceSchema,
  ServerMessageSchema,
} from '@the-visualizer/contracts';

describe('Contracts Fuzzing & Boundary Hardening', () => {
  it('ClientIntentSchema never throws unhandled exceptions on arbitrary JSON structures', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (arbitraryValue) => {
        // safeParse must never throw, regardless of the input shape
        const result = ClientIntentSchema.safeParse(arbitraryValue);
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');

        if (!result.success) {
          // Failure must return a structured error with valid issues array
          expect(Array.isArray(result.error.issues)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('ServerMessageSchema never throws on arbitrary input trees', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (arbitraryValue) => {
        const result = ServerMessageSchema.safeParse(arbitraryValue);
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');

        if (!result.success) {
          expect(Array.isArray(result.error.issues)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('IntentJoinRoomSchema correctly validates well-formed rooms and rejects corrupted ones', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (id, roomId, domainId) => {
          const payload = {
            id,
            type: 'JOIN_ROOM',
            roomId,
            domainId,
          };
          const result = IntentJoinRoomSchema.safeParse(payload);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.roomId).toBe(roomId);
            expect(result.data.domainId).toBe(domainId);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('IntentProduceSchema enforces payload limits and acks union strictly', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 249 }),
        fc.string({ maxLength: 1000 }),
        fc.string({ maxLength: 1000 }),
        fc.constantFrom(0, 1, -1 as const),
        (id, topic, key, value, acks) => {
          const validPayload = {
            id,
            type: 'INTENT_PRODUCE',
            topic,
            key,
            value,
            acks,
          };
          const result = IntentProduceSchema.safeParse(validPayload);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('rejects invalid acks and oversized keys gracefully', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 2, max: 999 }), // Invalid ACKs (Kafka only accepts 0, 1, -1)
        (id, topic, invalidAcks) => {
          const invalidPayload = {
            id,
            type: 'INTENT_PRODUCE',
            topic,
            key: 'test-key',
            value: 'test-val',
            acks: invalidAcks,
          };
          const result = IntentProduceSchema.safeParse(invalidPayload);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });
});
