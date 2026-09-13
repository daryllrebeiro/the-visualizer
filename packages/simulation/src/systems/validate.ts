import type { SystemDefinition } from '@the-visualizer/contracts';

import type { ValidationIssue } from './types.js';

export function validateSystem(def: SystemDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set(def.components.map((c) => c.id));
  const hasIncoming = new Set<string>();
  const hasOutgoing = new Set<string>();
  for (const conn of def.connections) {
    hasOutgoing.add(conn.source);
    hasIncoming.add(conn.target);
    if (conn.direction === 'bidirectional') {
      hasIncoming.add(conn.source);
      hasOutgoing.add(conn.target);
    }
  }
  for (const c of def.components) {
    if (c.type === 'service' && !hasIncoming.has(c.id)) {
      issues.push({ severity: 'ERROR', code: 'service-no-input', message: `Service ${c.name} has no input connection.`, componentId: c.id });
    }
    if ((c.type === 'postgres' || c.type === 'database-generic') && !hasIncoming.has(c.id)) {
      issues.push({ severity: 'ERROR', code: 'db-no-connection', message: `Database ${c.name} has no incoming connection.`, componentId: c.id });
    }
    if (c.type === 'service' && !(c.config as Record<string, unknown>)['retryPolicy'] && !(def.connections.find((k) => k.source === c.id)?.config as { retryPolicy?: unknown } | undefined)?.retryPolicy) {
      issues.push({ severity: 'WARNING', code: 'service-no-retry', message: `Service ${c.name} has no retry policy; transient failures will be customer-visible.`, componentId: c.id });
    }
    if (!ids.has(c.id)) {
      issues.push({ severity: 'ERROR', code: 'unknown-component', message: `Unknown component ${c.id}.`, componentId: c.id });
    }
  }
  // Single point of failure note (educational, never blocking).
  const dbs = def.components.filter((c) => c.type === 'postgres' || c.type === 'database-generic');
  if (dbs.length === 1) {
    issues.push({ severity: 'EDUCATIONAL_TRADEOFF', code: 'single-db', message: `Single database ${dbs[0]?.name ?? ''} is a single point of failure; read replicas trade cost for availability.` });
  }
  return issues;
}
