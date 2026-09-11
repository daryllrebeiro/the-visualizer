import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { DomainRegistry, DeterministicRNG } from '../index.js';
import { kernelCreateState, kernelDomainIds, kernelSnapshot, kernelTick } from './edge-kernel.js';

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walkTs(full, out);
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('WASM-ready kernel: zero Node builtins in the portable path', () => {
  it('imports no node: modules and references no Node globals', () => {
    const dirs = [
      'packages/simulation/src/wasm',
      'packages/simulation/src/prng',
      'packages/simulation/src/shared',
      'packages/simulation/src/domains',
      'packages/simulation/src/timeline',
      'packages/simulation/src/learn',
    ];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of walkTs(dir)) {
        const src = readFileSync(file, 'utf8');
        const hits: string[] = [];
        if (/(^|\s)from\s+['"]node:/m.test(src)) hits.push('node: import');
        if (/\brequire\(\s*['"]node:/.test(src)) hits.push('node: require');
        if (/(?<![A-Za-z0-9_$.])process\.(env|exit|argv|cwd|hrtime)/.test(src)) hits.push('process.*');
        if (/(?<![A-Za-z0-9_$.])Buffer\.(from|alloc|concat|isBuffer)/.test(src)) hits.push('Buffer.*');
        if (hits.length > 0) offenders.push(`${file} [${hits.join(', ')}]`);
      }
    }
    console.log(`WASM-PATH scanned files, offenders=${offenders.length}: ${offenders.join(' | ').slice(0, 400)}`);
    expect(offenders).toEqual([]);
  });
});

describe('WASM-ready kernel: functional equivalence with the registry path', () => {
  it('ticks identically for multiple domains', () => {
    for (const domainId of ['rate-limiter', 'raft', 'kafka']) {
      const state = kernelCreateState(domainId);
      const pluginState = (DomainRegistry.get(domainId) as { createDefaultState: () => unknown }).createDefaultState();
      expect(kernelSnapshot(state)).toBe(JSON.stringify(pluginState));

      const tickType = `${domainId.toUpperCase().replace(/-/g, '_')}_TICK`;
      let edgeState: unknown = state;
      let edgeRng = 12345;
      const plugin = DomainRegistry.get(domainId) as {
        reduceState: (s: unknown, e: unknown, r: DeterministicRNG) => { nextState: unknown };
      };
      let refState: unknown = pluginState;
      const refRng = new DeterministicRNG(12345);

      for (let t = 1; t <= 10; t++) {
        const event = { id: `k${String(t)}`, tick: t, type: tickType, payload: {} };
        const res = kernelTick(domainId, edgeState, event, edgeRng);
        edgeState = res.nextState;
        edgeRng = res.rngState;
        refState = plugin.reduceState(refState, event, refRng).nextState;
        expect(kernelSnapshot(edgeState), `${domainId} tick ${String(t)}`).toBe(JSON.stringify(refState));
      }
      expect(edgeRng).toBe(refRng.getState());
    }
    console.log('WASM-EQUIV 3 domains x 10 ticks identical');
  });

  it('exposes all registered domains', () => {
    expect(kernelDomainIds()).toEqual(DomainRegistry.list().map((m) => m.id));
  });
});

// Sandbox proof: the edge bundle executes with every host global removed.
const BUNDLE = resolve('dist-edge/sim-kernel.js');

describe.skipIf(!existsSync(BUNDLE))('WASM-ready kernel: runs in a host-global-free sandbox', () => {
  it('ticks without process, Buffer, require, or structuredClone', () => {
    const code = readFileSync(BUNDLE, 'utf8');
    const sandbox: Record<string, unknown> = {
      Math,
      JSON,
      Object,
      Array,
      Number,
      String,
      Boolean,
      Error,
      TypeError,
      RangeError,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Symbol,
      BigInt,
      Promise,
      console: { log: () => undefined, warn: () => undefined, error: () => undefined },
    };
    runInNewContext(`${code}\nthis.__result = SimKernel.kernelTick('raft', SimKernel.kernelCreateState('raft'), { id: 'k1', tick: 1, type: 'RAFT_TICK', payload: {} }, 12345);`, sandbox);
    const result = sandbox['__result'] as { nextState: unknown; rngState: number; violation: unknown };
    expect(result).toBeDefined();
    expect(typeof result.rngState).toBe('number');
    expect(result.nextState).toBeDefined();
    console.log('WASM-SANDBOX raft tick ok, no host globals required');
  });
});
