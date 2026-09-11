import { createHash } from 'node:crypto';
import { describe, it } from 'vitest';

import { DomainRegistry } from './domains/registry.js';
import { DeterministicRNG } from './prng/deterministic-rng.js';

/**
 * Golden vector regeneration helper.
 *
 * Skipped in normal runs. To regenerate the committed GOLDEN_VECTORS after an
 * intentional reducer change:
 *
 *   PowerShell:  $env:UPDATE_GOLDEN=1; pnpm vitest run packages/simulation/src/golden-vectors.update.test.ts
 *   sh:          UPDATE_GOLDEN=1 pnpm vitest run packages/simulation/src/golden-vectors.update.test.ts
 *
 * Paste the printed block into GOLDEN_VECTORS in golden-determinism.test.ts
 * and review every changed digest like a snapshot update.
 */
describe.skipIf(!process.env['UPDATE_GOLDEN'])('golden vector regeneration', () => {
  it('prints GOLDEN_VECTORS block', () => {
    const lines: string[] = [];
    for (const meta of DomainRegistry.list()) {
      const plugin = DomainRegistry.get(meta.id)!;
      const rng = new DeterministicRNG(12345);
      let state = plugin.createDefaultState();
      for (let t = 0; t < 10; t++) {
        const result = plugin.reduceState(
          state,
          { id: `golden-tick-${t}`, tick: t, type: 'TICK', payload: {} },
          rng,
        );
        state = result.nextState;
      }
      const hex = createHash('sha256')
        .update(JSON.stringify(state, (_key, value) => (value === undefined ? null : value)))
        .digest('hex');
      lines.push(`  '${meta.id}': '${hex}',`);
    }
    console.log(`const GOLDEN_VECTORS: Record<string, string> = {\n${lines.join('\n')}\n};`);
  });
});
