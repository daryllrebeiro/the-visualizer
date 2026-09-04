import { performance } from 'perf_hooks';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Define SimEvent schema for benchmarking
const SimEventSchema = z.object({
  id: z.string().uuid(),
  tick: z.number().nonnegative(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

type SimEvent = z.infer<typeof SimEventSchema>;

describe('Contracts Serialization & Deserialization Performance', () => {
  it('should serialize and deserialize 1,000 events efficiently (JIT-warmed)', () => {
    // 1. Generate 1,000 mock simulation events
    const events: SimEvent[] = Array.from({ length: 1_000 }, (_, idx) => ({
      id: '00000000-0000-0000-0000-000000000000'.replace(/0/g, () =>
        Math.floor(Math.random() * 16).toString(16),
      ),
      tick: idx,
      type: 'RECORD_PRODUCED',
      payload: {
        topic: 'orders',
        partition: 0,
        offset: idx * 100,
        latencyMs: 12.5,
      },
    }));

    // 2. Warm up V8 JIT compiler
    for (let i = 0; i < 500; i++) {
      const serializedStr = JSON.stringify(events);
      const deserializedData = JSON.parse(serializedStr) as SimEvent[];
      if (i === 0) {
        for (let j = 0; j < 10; j++) {
          SimEventSchema.safeParse(deserializedData[j]);
        }
      }
    }

    // 3. Measure Warmed-up Serialization
    const startSerialize = performance.now();
    const serialized = JSON.stringify(events);
    const endSerialize = performance.now();
    const serializeTime = endSerialize - startSerialize;

    // 4. Measure Warmed-up Deserialization
    const startDeserialize = performance.now();
    const deserialized = JSON.parse(serialized) as SimEvent[];
    const endDeserialize = performance.now();
    const deserializeTime = endDeserialize - startDeserialize;

    // 5. Measure Warmed-up Validation
    const startValidate = performance.now();
    for (const event of deserialized) {
      const result = SimEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
    const endValidate = performance.now();
    const validateTime = endValidate - startValidate;

    console.warn(`
      ⚡ [BENCHMARK RESULTS - 1,000 WARMED SimEvents]
      - Serialization:   ${serializeTime.toFixed(3)}ms
      - Deserialization: ${deserializeTime.toFixed(3)}ms
      - Zod Validation:  ${validateTime.toFixed(3)}ms
      - Total Operations: ${(serializeTime + deserializeTime + validateTime).toFixed(3)}ms
    `);

    // Target total serialization + deserialization to be under 10.0ms on test containers
    expect(serializeTime + deserializeTime).toBeLessThan(10.0);
  });
});
