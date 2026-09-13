import type { SystemConnection } from '@the-visualizer/contracts';

const COMPAT: Record<string, Set<string>> = {
  http: new Set(['http']),
  grpc: new Set(['grpc', 'http']),
  websocket: new Set(['websocket', 'event']),
  tcp: new Set(['tcp', 'database', 'http']),
  kafka: new Set(['kafka', 'event', 'queue']),
  queue: new Set(['queue', 'event', 'kafka']),
  database: new Set(['database', 'tcp']),
  event: new Set(['event', 'queue', 'kafka', 'websocket', 'http']),
};

export function protocolsCompatible(from: string, to: string): boolean {
  const allowed = COMPAT[from];
  if (!allowed) return false;
  return allowed.has(to);
}

export function buildAdjacency(connections: SystemConnection[]): Map<string, SystemConnection[]> {
  const adj = new Map<string, SystemConnection[]>();
  for (const c of connections) {
    const list = adj.get(c.source) ?? [];
    list.push(c);
    adj.set(c.source, list);
    if (c.direction === 'bidirectional') {
      const rev = adj.get(c.target) ?? [];
      rev.push(c);
      adj.set(c.target, rev);
    }
  }
  // Deterministic iteration: sort each adjacency list by connection id.
  for (const list of adj.values()) list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return adj;
}

export function findRoute(
  adj: Map<string, SystemConnection[]>,
  source: string,
  target: string,
): SystemConnection[] {
  if (source === target) return [];
  // BFS with deterministic neighbor order (adjacency pre-sorted).
  const prev = new Map<string, SystemConnection>();
  const visited = new Set<string>([source]);
  const queue: string[] = [source];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    if (cur === target) break;
    for (const edge of adj.get(cur) ?? []) {
      const next = edge.source === cur ? edge.target : edge.source;
      if (visited.has(next)) continue;
      visited.add(next);
      prev.set(next, edge);
      queue.push(next);
    }
  }
  if (!visited.has(target)) return [];
  const path: SystemConnection[] = [];
  let cur = target;
  while (cur !== source) {
    const e = prev.get(cur);
    if (!e) break;
    path.unshift(e);
    cur = e.source === cur ? e.target : e.source;
    if (path.length > 64) break;
  }
  return path;
}
