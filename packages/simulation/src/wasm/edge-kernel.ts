/**
 * Portable simulation kernel entry (Phase 3 — WASM/edge readiness).
 *
 * This module is the kernel's portability boundary: it imports ONLY the pure
 * simulation core (registry, PRNG, structural helpers) and touches NO Node
 * builtins — no `node:` modules, no `Buffer`, no `structuredClone`, no
 * `process`. All data crosses the boundary as JSON-compatible values plus a
 * numeric RNG state, which is exactly the shape a future WASM or edge-runtime
 * binding needs.
 *
 * It is bundled by `scripts/build-sim-edge-bundle.mjs` into a single
 * dependency-free file and exercised inside a `vm` sandbox with every host
 * global removed (see the test) to prove portability, not just claim it.
 */

import { DomainRegistry } from '../domains/registry.js';
import { DeterministicRNG } from '../prng/deterministic-rng.js';

export interface KernelTickEvent {
  id: string;
  tick: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface KernelTickResult {
  nextState: unknown;
  rngState: number;
  violation: { name: string; description: string } | null;
}

/** Plain JSON round-trip; deliberately avoids `structuredClone`. */
function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function kernelCreateState(domainId: string): unknown {
  const plugin = DomainRegistry.get(domainId);
  if (!plugin) throw new Error(`Unknown domain: ${domainId}`);
  return jsonClone(plugin.createDefaultState());
}

export function kernelTick(
  domainId: string,
  state: unknown,
  event: KernelTickEvent,
  rngState: number,
): KernelTickResult {
  const plugin = DomainRegistry.get(domainId);
  if (!plugin) throw new Error(`Unknown domain: ${domainId}`);
  const rng = new DeterministicRNG(0);
  rng.restoreState(rngState | 0);

  const result = plugin.reduceState(jsonClone(state), event, rng);
  const check = plugin.validateInvariants(result.nextState);
  return {
    nextState: jsonClone(result.nextState),
    rngState: rng.getState(),
    violation: check.passed || !check.violation ? null : { ...check.violation },
  };
}

export function kernelSnapshot(state: unknown): string {
  return JSON.stringify(state);
}

export function kernelDomainIds(): string[] {
  return DomainRegistry.list().map((m) => m.id);
}
