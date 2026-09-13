import type { ChallengeDefinition } from '@the-visualizer/contracts';

import { runSystemScript } from './runtime.js';
import type { SystemRunResult } from './types.js';
import { getSystem } from './registry.js';

export interface ChallengeCheckResult {
  id: string;
  label: string;
  pass: boolean;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  detail?: string | undefined;
}

export interface ChallengeEvaluation {
  challengeId: string;
  score: number;
  checks: ChallengeCheckResult[];
  feedback: string[];
  run: SystemRunResult | null;
}

/** Rule-based deterministic evaluation. No LLM. */
export function evaluateChallenge(challenge: ChallengeDefinition, candidate: { components: Array<{ type: string }>; connections: unknown[] }): ChallengeEvaluation {
  const checks: ChallengeCheckResult[] = [];
  const types = new Set(candidate.components.map((c) => c.type));
  for (const c of challenge.checks) {
    let pass = true;
    let detail = '';
    if (c.id === 'has-concurrency-control') {
      pass = types.has('lock');
      detail = pass ? 'Lock present.' : 'No lock/concurrency control found.';
    } else if (c.id === 'has-cache') {
      pass = types.has('redis') || types.has('cdn');
      detail = pass ? 'Cache present.' : 'No cache layer.';
    } else if (c.id === 'has-messaging') {
      pass = types.has('kafka') || types.has('queue') || types.has('rabbitmq');
      detail = pass ? 'Messaging present.' : 'No async messaging.';
    } else if (c.id === 'no-single-db' || c.id === 'db-redundant') {
      const dbs = candidate.components.filter((x) => x.type === 'postgres' || x.type === 'database-generic').length;
      pass = dbs !== 1;
      detail = dbs === 1 ? 'Single database is a SPOF.' : `${String(dbs)} database nodes.`;
    } else if (c.id === 'prevents-double-alloc') {
      const sys = getSystem(challenge.systemId);
      if (sys) {
        const race = sys.scenarios.find((s: { id: string }) => s.id === 'double-race');
        if (race) {
          const run = runSystemScript(sys, { seed: race.seed, events: race.events, failures: [] });
          const rejected = run.events.filter((e) => e.type === 'LOCK_REJECTED').length;
          pass = rejected >= 1 && !run.violation;
          detail = pass ? 'Race admits exactly one owner.' : 'Race not contained.';
        }
      }
    } else {
      pass = true;
      detail = 'Informational check.';
    }
    checks.push({ id: c.id, label: c.label, pass, severity: c.severity, detail });
  }
  const errors = checks.filter((c) => c.severity === 'ERROR');
  const passed = errors.filter((c) => c.pass).length;
  const score = errors.length === 0 ? 100 : Math.round((passed / errors.length) * 100);
  const feedback = checks.filter((c) => !c.pass).map((c) => `${c.severity}: ${c.label} — ${c.detail ?? ''}`);
  return { challengeId: challenge.id, score, checks, feedback, run: null };
}

export const BOOKING_CHALLENGE: ChallengeDefinition = {
  id: 'booking-no-double-alloc',
  title: 'Build ticket booking that prevents double booking',
  description: '10,000 concurrent users, 1,000 seats, 99.9% availability.',
  systemId: 'ticket-booking',
  scenarioIds: ['double-race'],
  constraints: { users: 10000, seats: 1000, availability: 0.999 },
  checks: [
    { id: 'has-concurrency-control', label: 'Has concurrency control', severity: 'ERROR' },
    { id: 'prevents-double-alloc', label: 'Prevents duplicate allocation', severity: 'ERROR' },
    { id: 'no-single-db', label: 'Database is not a single point of failure', severity: 'WARNING' },
  ],
};
