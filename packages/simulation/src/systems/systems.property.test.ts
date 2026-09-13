import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { TICKET_BOOKING_SYSTEM } from './flagships.js';
import { MVP_CACHE_SYSTEM } from './mvp-cache.js';
import { runSystemScript } from './runtime.js';

describe('composite property tests', () => {
  it('event ids strictly increase for arbitrary cache scripts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('product:42', 'product:7'), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 1, max: 100000 }),
        (keys, seed) => {
          const events = keys.map((key, idx) => ({ tick: idx + 1, type: 'HTTP_REQUEST', source: 'user', target: 'gateway', payload: { key } }));
          const run = runSystemScript(MVP_CACHE_SYSTEM, { seed, events });
          const nums = run.events.map((e) => Number(e.id.replace('sys-', '')));
          for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeGreaterThan(nums[i - 1] as number);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('replay(seed, actions) === original for arbitrary booking arrivals', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('alice', 'bob', 'carol'), { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 1, max: 100000 }),
        (owners, seed) => {
          const events = owners.map((owner) => ({ tick: 1, type: 'HTTP_REQUEST', source: 'users', target: 'booking', payload: { seat: 'A12', owner } }));
          const a = runSystemScript(TICKET_BOOKING_SYSTEM, { seed, events });
          const b = runSystemScript(TICKET_BOOKING_SYSTEM, { seed, events });
          expect(b.events).toEqual(a.events);
          expect(b.contentHash).toBe(a.contentHash);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('at most one LOCK_ACQUIRED per seat in any race', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('alice', 'bob'), { minLength: 2, maxLength: 5 }), (owners) => {
        const events = owners.map((owner) => ({ tick: 1, type: 'HTTP_REQUEST', source: 'users', target: 'booking', payload: { seat: 'A12', owner } }));
        const run = runSystemScript(TICKET_BOOKING_SYSTEM, { seed: 42, events });
        const acquiredBySeat = new Map<string, number>();
        for (const e of run.events) {
          if (e.type === 'LOCK_ACQUIRED' && typeof e.payload['seat'] === 'string' && !e.payload['released']) {
            const s = e.payload['seat'] as string;
            acquiredBySeat.set(s, (acquiredBySeat.get(s) ?? 0) + 1);
          }
        }
        for (const n of acquiredBySeat.values()) expect(n).toBeLessThanOrEqual(1);
      }),
      { numRuns: 25 },
    );
  });
});
