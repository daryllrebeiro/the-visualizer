#!/usr/bin/env node

/**
 * Headless CLI Simulation Runner
 *
 * Runs deterministic simulation ticks directly in the terminal
 * and prints an ASCII summary table.
 *
 * Usage: node scripts/sim-cli.mjs [--domain=kafka|raft|database|redis|kubernetes|rabbitmq|storage|networking] [--ticks=20] [--seed=42]
 */

import { DomainRegistry, DeterministicRNG } from '../packages/simulation/dist/index.js';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const match = args.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split('=')[1] : fallback;
};

const domainId = getArg('domain', 'kafka');
const ticks = parseInt(getArg('ticks', '20'), 10);
const seed = parseInt(getArg('seed', '42'), 10);

console.log(`\n======================================================`);
console.log(`⚡ TheVisualizer Headless Simulation CLI`);
console.log(`   Domain: ${domainId.toUpperCase()} | Ticks: ${ticks} | Seed: ${seed}`);
console.log(`======================================================\n`);

const plugin = DomainRegistry.get(domainId);
if (!plugin) {
  console.error(`❌ Error: Unknown domain "${domainId}". Available domains: ${DomainRegistry.list().map((d) => d.id).join(', ')}`);
  process.exit(1);
}

const rng = new DeterministicRNG(seed);
let state = plugin.createDefaultState();

const startTime = performance.now();

for (let t = 0; t < ticks; t++) {
  const event = {
    id: `cli-tick-${t}`,
    tick: t,
    type: 'TICK',
    payload: {},
  };

  try {
    const res = plugin.reduceState(state, event, rng);
    state = res.nextState;
  } catch {
    // Unhandled tick defaults to state retention
  }
}

const elapsedMs = performance.now() - startTime;
const checkResult = plugin.validateInvariants(state);

console.log(`📊 Simulation Result after ${ticks} ticks (${elapsedMs.toFixed(2)} ms):`);
console.log(`- Final Tick: ${state.tick ?? ticks}`);
console.log(`- Invariant Health: ${checkResult.passed ? '✅ PASSED (All invariants hold)' : `❌ VIOLATION: ${checkResult.violation?.name}`}`);
console.log(`- State Snapshot Keys: ${Object.keys(state).join(', ')}\n`);
