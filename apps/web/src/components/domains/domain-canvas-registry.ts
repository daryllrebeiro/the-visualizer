import type { DomainKey } from '../../app/domain-options';

/**
 * Canonical canvas routing (Phase 2 strangler, step 1).
 *
 * Three render paths, decided here instead of scattered through the shell:
 *  - `kafka` → the shell's bespoke Kafka component
 *  - PANEL_DOMAINS → the self-contained `NewDomainsPanel`
 *  - everything else with a bespoke visualizer → its canvas
 *  - anything else (`rag`, `agents`, future Plugin-SDK domains) →
 *    the store-driven `GenericDomainCanvas`
 *
 * Adding a domain no longer requires editing a render switch; register it in
 * the engine, list it in `DOMAIN_OPTIONS`, and it renders generically until a
 * bespoke canvas is provided.
 */
export const PANEL_DOMAINS: ReadonlySet<string> = new Set([
  'load-balancer',
  'search-index',
  'task-scheduler',
  'chat-presence',
  'feature-store',
  'model-rollout',
  'llm-eval',
  'consistent-hashing',
  'probabilistic-structures',
  'merkle-trees',
]);

export const GENERIC_DOMAINS: ReadonlySet<string> = new Set(['rag', 'agents']);

export type CanvasKind = 'kafka' | 'panel' | 'bespoke' | 'generic';

export function canvasKindFor(domainId: DomainKey): CanvasKind {
  if (domainId === 'kafka') return 'kafka';
  if (PANEL_DOMAINS.has(domainId)) return 'panel';
  if (GENERIC_DOMAINS.has(domainId)) return 'generic';
  return 'bespoke';
}
