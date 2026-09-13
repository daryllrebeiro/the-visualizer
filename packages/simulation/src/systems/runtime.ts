/**
 * Composite SystemRuntime — orchestrates builtin component semantics.
 * DomainPlugin delegation hook: components with `domainId` set reuse the
 * registry reducer for domain-owned transitions; all orchestration state
 * (routing, latency, capacity, failures) lives here, never in React.
 *
 * Determinism: (definition, script) -> identical result. Only DeterministicRNG.
 */
import type { SystemDefinition } from '@the-visualizer/contracts';

import { DeterministicRNG } from '../prng/deterministic-rng.js';
import { canonicalStringify, contentHash, deepClone } from '../shared/primitives.js';
import { buildAdjacency } from './router.js';
import type {
  ComponentRuntimeState,
  SystemEmittedEvent,
  SystemFailureSchedule,
  SystemMetrics,
  SystemRunResult,
  SystemScript,
} from './types.js';

function initialComponentState(type: string, config: Record<string, unknown>): ComponentRuntimeState {
  const data: Record<string, unknown> = {};
  // Seed semantic stores from component config (deterministic, no I/O).
  if (config['seedCache'] !== undefined) data['cache'] = deepClone(config['seedCache']);
  if (config['seedDb'] !== undefined) data['db'] = deepClone(config['seedDb']);
  if (config['inventory'] !== undefined) data['inventory'] = deepClone(config['inventory']);
  if (config['locks'] !== undefined) data['locks'] = deepClone(config['locks']);
  if (config['ledger'] !== undefined) data['ledger'] = deepClone(config['ledger']);
  if (config['store'] !== undefined) data['store'] = deepClone(config['store']);
  if (config['oplog'] !== undefined) data['oplog'] = deepClone(config['oplog']);
  if (type === 'redis' || type === 'cdn') data['cache'] ??= {};
  if (type === 'postgres' || type === 'database-generic') data['db'] ??= {};
  if (type === 'lock') data['locks'] ??= {};
  return { status: 'idle', queueDepth: 0, processed: 0, failed: 0, data, load: 0 };
}

function failureActive(failures: SystemFailureSchedule[], target: string, tick: number): SystemFailureSchedule | null {
  for (const f of failures) {
    if (f.target !== target) continue;
    const end = f.durationTicks === undefined ? Number.MAX_SAFE_INTEGER : f.startTick + f.durationTicks;
    if (tick >= f.startTick && tick < end) return f;
  }
  return null;
}

/**
 * Only forward-work event types are routed between components. Terminal
 * response types (hits, results, acks, rejections, timeouts, responses) are
 * recorded in the trace but never re-enter a component as new work — without
 * this, responses loop back downstream and amplify forever.
 */
const FORWARD_TYPES = new Set([
  'HTTP_REQUEST',
  'USER_ACTION',
  'SERVICE_REQUEST',
  'CACHE_GET',
  'CACHE_SET',
  'DATABASE_QUERY',
  'MESSAGE_PUBLISHED',
]);

function shouldChain(type: string): boolean {
  return FORWARD_TYPES.has(type);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] as number;
}

export function computeMetrics(events: SystemEmittedEvent[], queueDepth: number): SystemMetrics {
  const latencies = events
    .map((e) => e.latencyMs ?? 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const successful = events.filter((e) => e.result === 'SUCCESS').length;
  const failed = events.filter((e) => e.result === 'FAILURE').length;
  const cacheHits = events.filter((e) => e.type === 'CACHE_HIT').length;
  const cacheMisses = events.filter((e) => e.type === 'CACHE_MISS').length;
  const retries = events.filter((e) => e.type === 'RETRY').length;
  const timeouts = events.filter((e) => e.type === 'TIMEOUT').length;
  const totalLat = latencies.reduce((a, b) => a + b, 0);
  return {
    totalEvents: events.length,
    successful,
    failed,
    avgLatencyMs: latencies.length === 0 ? 0 : totalLat / latencies.length,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    cacheHits,
    cacheMisses,
    hitRate: cacheHits + cacheMisses === 0 ? 0 : cacheHits / (cacheHits + cacheMisses),
    retries,
    timeouts,
    queueDepth,
  };
}

interface PendingDelivery {
  deliverAtTick: number;
  event: SystemEmittedEvent;
}

/**
 * Execute a deterministic system script. Pure — no I/O, no wall-clock.
 */
export function runSystemScript(def: SystemDefinition, script: SystemScript): SystemRunResult {
  const rng = new DeterministicRNG(script.seed);
  void rng;
  const adj = buildAdjacency(def.connections as never);
  const failures = script.failures ?? [];
  const states: Record<string, ComponentRuntimeState> = {};
  for (const c of def.components) {
    states[c.id] = initialComponentState(c.type, (c.config ?? {}) as Record<string, unknown>);
  }
  const byId = new Map(def.components.map((c) => [c.id, c]));
  const latencyOf = (source: string, target: string): number => {
    for (const edges of adj.values()) {
      for (const e of edges) {
        if ((e.source === source && e.target === target) || (e.source === target && e.target === source)) {
          return (e.config as { latencyMs?: number }).latencyMs ?? 0;
        }
      }
    }
    return 0;
  };

  const maxInputTick = script.events.reduce((m, e) => Math.max(m, e.tick), 0);
  const maxTicks = script.maxTicks ?? Math.max(maxInputTick + 4, 8);
  const inputsByTick = new Map<number, typeof script.events>();
  for (const e of script.events) {
    const list = inputsByTick.get(e.tick) ?? [];
    list.push(e);
    inputsByTick.set(e.tick, list);
  }

  let seq = 0;
  let simTimeMs = 0;
  const events: SystemEmittedEvent[] = [];
  const frames: SystemRunResult['frames'] = [];
  let violation: SystemRunResult['violation'] = null;
  let pending: PendingDelivery[] = [];

  const emit = (e: Omit<SystemEmittedEvent, 'id'>): SystemEmittedEvent => {
    const full: SystemEmittedEvent = { ...e, id: `sys-${String(seq++)}` };
    events.push(full);
    return full;
  };

  const setStatus = (id: string, s: ComponentRuntimeState['status']): void => {
    const st = states[id];
    if (st) st.status = s;
  };

  const processAt = (compId: string, tick: number, incoming: SystemEmittedEvent): SystemEmittedEvent[] => {
    const comp = byId.get(compId);
    const st = states[compId];
    if (!comp || !st) return [];
    const out: SystemEmittedEvent[] = [];
    const fail = failureActive(failures, compId, tick);
    if (fail && (fail.type === 'crash' || fail.type === 'partition')) {
      st.failed += 1;
      setStatus(compId, 'failure');
      out.push(
        emit({
          tick, simTimeMs, type: 'TIMEOUT', source: compId, target: incoming.source,
          payload: { causation: incoming.id, reason: fail.type }, result: 'FAILURE', causationId: incoming.id,
          explain: `${comp.name} is ${fail.type === 'crash' ? 'down' : 'partitioned'}; request timed out.`,
        }),
      );
      return out;
    }
    let extraLatency = 0;
    if (fail && fail.type === 'latency') extraLatency = Number(fail.config?.['addedMs'] ?? 100);

    const capacity = Number((comp.config as Record<string, unknown>)['capacityPerSec'] ?? 0);
    if (capacity > 0 && st.queueDepth >= capacity) {
      st.failed += 1;
      out.push(
        emit({ tick, simTimeMs, type: 'TIMEOUT', source: compId, target: incoming.source, payload: { causation: incoming.id, reason: 'capacity' }, result: 'FAILURE', causationId: incoming.id, explain: `${comp.name} at capacity; request shed.` }),
      );
      return out;
    }

    const ok = (type: string, target: string | undefined, payload: Record<string, unknown>, latency: number, explain?: string): SystemEmittedEvent => {
      const lat = latency + extraLatency;
      simTimeMs += lat;
      return emit({ tick, simTimeMs, type, source: compId, target, payload, latencyMs: lat, result: 'SUCCESS', causationId: incoming.id, explain });
    };

    st.processed += 1;
    setStatus(compId, 'active');
    switch (comp.type) {
      case 'client': {
        const targets = adj.get(compId) ?? [];
        const next = targets[0];
        if (next) {
          const target = next.source === compId ? next.target : next.source;
          out.push(ok('HTTP_REQUEST', target, incoming.payload, latencyOf(compId, target), 'Client issued request downstream.'));
        }
        break;
      }
      case 'gateway':
      case 'service':
      case 'worker':
      case 'websocket-server': {
        const t = incoming.type;
        // Terminal responses complete the chain — no further emission.
        if (
          t === 'LOCK_ACQUIRED' || t === 'LOCK_REJECTED' || t === 'TIMEOUT' || t === 'RETRY' ||
          t === 'PAYMENT_AUTHORIZED' || t === 'PAYMENT_FAILED' || t === 'INVENTORY_RESERVED' ||
          t === 'INVENTORY_REJECTED' || t === 'CIRCUIT_OPENED' || t === 'COMPONENT_FAILURE' ||
          t === 'COMPONENT_RECOVERY' || t === 'HTTP_RESPONSE' || t === 'SERVICE_RESPONSE'
        ) {
          setStatus(compId, 'success');
          return out;
        }
        if (t === 'HTTP_REQUEST' || t === 'USER_ACTION' || t === 'SERVICE_REQUEST') {
          const key = String(incoming.payload['key'] ?? incoming.payload['productId'] ?? incoming.payload['seat'] ?? 'k');
          void key;
          // Route: prefer explicit target, else first downstream neighbor (never self).
          const explicit = incoming.target && incoming.target !== compId && byId.has(incoming.target) ? incoming.target : undefined;
          const edges = adj.get(compId) ?? [];
          const nextId = explicit ?? (edges[0] ? (edges[0].source === compId ? edges[0].target : edges[0].source) : undefined);
          if (nextId) {
            const nextComp = byId.get(nextId);
            if (nextComp?.type === 'redis' || nextComp?.type === 'cdn') {
              out.push(ok('CACHE_GET', nextId, incoming.payload, latencyOf(compId, nextId), `${comp.name} checks cache before database.`));
            } else if (nextComp?.type === 'postgres' || nextComp?.type === 'database-generic') {
              out.push(ok('DATABASE_QUERY', nextId, incoming.payload, latencyOf(compId, nextId), `${comp.name} queries database.`));
            } else if (nextComp?.type === 'kafka' || nextComp?.type === 'queue' || nextComp?.type === 'rabbitmq') {
              out.push(ok('MESSAGE_PUBLISHED', nextId, incoming.payload, latencyOf(compId, nextId), `${comp.name} publishes event.`));
            } else if (nextComp?.type === 'lock') {
              out.push(ok('SERVICE_REQUEST', nextId, { ...incoming.payload, _lockOp: 'acquire' }, latencyOf(compId, nextId), `${comp.name} attempts distributed lock.`));
            } else {
              out.push(ok('SERVICE_REQUEST', nextId, incoming.payload, latencyOf(compId, nextId), `${comp.name} forwards request.`));
            }
          } else {
            out.push(ok('RESPONSE_SENT', incoming.source, { echo: incoming.payload }, 0, `${comp.name} responded directly.`));
          }
        } else if (t === 'CACHE_HIT' || t === 'DATABASE_RESULT' || t === 'SERVICE_RESPONSE' || t === 'MESSAGE_CONSUMED') {
          out.push(ok('RESPONSE_SENT', incoming.source, incoming.payload, 1, `${comp.name} returns response upstream.`));
        } else if (t === 'CACHE_MISS') {
          // Fall through to database: find db neighbor.
          const edges = adj.get(compId) ?? [];
          const dbEdge = edges.find((e) => {
            const nid = e.source === compId ? e.target : e.source;
            const nc = byId.get(nid);
            return nc?.type === 'postgres' || nc?.type === 'database-generic';
          });
          const dbId = dbEdge ? (dbEdge.source === compId ? dbEdge.target : dbEdge.source) : undefined;
          if (dbId) out.push(ok('DATABASE_QUERY', dbId, incoming.payload, latencyOf(compId, dbId), `Cache miss; ${comp.name} falls back to database.`));
        } else {
          out.push(ok('SERVICE_RESPONSE', incoming.source, incoming.payload, 1, `${comp.name} processed ${t}.`));
        }
        break;
      }
      case 'redis':
      case 'cdn': {
        const cache = (st.data['cache'] ??= {}) as Record<string, unknown>;
        if (incoming.type === 'CACHE_GET' || incoming.type === 'SERVICE_REQUEST' || incoming.type === 'HTTP_REQUEST') {
          const key = String(incoming.payload['key'] ?? incoming.payload['productId'] ?? 'k');
          if (cache[key] !== undefined) {
            out.push(ok('CACHE_HIT', incoming.source, { key, value: cache[key] }, 1, `Key ${key} present in cache.`));
          } else {
            out.push(ok('CACHE_MISS', incoming.source, { key }, 1, `Key ${key} absent; caller must hit database.`));
          }
        } else if (incoming.type === 'CACHE_SET' || (incoming.type === 'DATABASE_RESULT' && incoming.payload['cacheable'] !== false)) {
          const key = String(incoming.payload['key'] ?? incoming.payload['productId'] ?? 'k');
          cache[key] = incoming.payload['value'] ?? incoming.payload;
          out.push(ok('CACHE_SET', incoming.source, { key }, 1, `Stored ${key} in cache.`));
        }
        break;
      }
      case 'postgres':
      case 'database-generic':
      case 'object-store':
      case 'vectordb':
      case 'embedding': {
        const db = (st.data['db'] ??= {}) as Record<string, unknown>;
        if (incoming.type === 'DATABASE_QUERY' || incoming.type === 'SERVICE_REQUEST' || incoming.type === 'HTTP_REQUEST') {
          const failRate = Number(fail?.config?.['errorRate'] ?? (fail?.type === 'error' ? 1 : 0));
          if (failRate >= 1) {
            st.failed += 1;
            out.push(emit({ tick, simTimeMs, type: 'TIMEOUT', source: compId, target: incoming.source, payload: { causation: incoming.id }, result: 'FAILURE', causationId: incoming.id, explain: `${comp.name} request failed (injected error).` }));
          } else {
            const key = String(incoming.payload['key'] ?? incoming.payload['productId'] ?? 'k');
            const value = db[key] ?? { id: key, name: `Product ${key}`, price: 100 };
            st.load += 1;
            out.push(ok('DATABASE_RESULT', incoming.source, { key, value, cacheable: true }, 15, `${comp.name} served query for ${key}.`));
          }
        }
        break;
      }
      case 'kafka':
      case 'queue':
      case 'rabbitmq': {
        out.push(ok('MESSAGE_PUBLISHED', undefined, incoming.payload, 5, `${comp.name} appended event to log.`));
        // Fan out to downstream consumers next tick.
        const edges = adj.get(compId) ?? [];
        for (const e of edges) {
          const nid = e.source === compId ? e.target : e.source;
          if (nid === incoming.source) continue;
          pending.push({
            deliverAtTick: tick + 1,
            event: { id: '', tick: tick + 1, simTimeMs, type: 'MESSAGE_CONSUMED', source: compId, target: nid, payload: incoming.payload, result: 'SUCCESS', causationId: incoming.id, explain: `${byId.get(nid)?.name ?? nid} consumed event.` },
          });
        }
        break;
      }
      case 'lock': {
        // Only acquire/release operations are work; responses addressed here are ignored.
        if (incoming.payload['_lockOp'] !== 'acquire' && incoming.payload['_lockOp'] !== 'release') {
          setStatus(compId, 'success');
          return out;
        }
        const locks = (st.data['locks'] ??= {}) as Record<string, { owner: string; expiresTick: number }>;
        const seat = String(incoming.payload['seat'] ?? incoming.payload['key'] ?? 'k');
        const owner = String(incoming.payload['owner'] ?? incoming.source);
        const existing = locks[seat];
        if (incoming.payload['_lockOp'] === 'release') {
          if (existing && existing.owner === owner) delete locks[seat];
          out.push(ok('LOCK_ACQUIRED', incoming.source, { seat, released: true }, 1, `Lock on ${seat} released.`));
        } else if (!existing || existing.expiresTick <= tick) {
          const ttl = Number((comp.config as Record<string, unknown>)['ttlTicks'] ?? 50);
          locks[seat] = { owner, expiresTick: tick + ttl };
          out.push(ok('LOCK_ACQUIRED', incoming.source, { seat, owner }, 2, `Lock on ${seat} granted to ${owner}.`));
        } else {
          out.push(emit({ tick, simTimeMs, type: 'LOCK_REJECTED', source: compId, target: incoming.source, payload: { seat, owner, heldBy: existing.owner }, result: 'FAILURE', causationId: incoming.id, explain: `${seat} already locked by ${existing.owner}.` }));
        }
        break;
      }
      default: {
        out.push(ok('SERVICE_RESPONSE', incoming.source, incoming.payload, 1, `${comp.name} processed event.`));
        break;
      }
    }
    return out;
  };

  const checkInvariants = (tick: number): { name: string; description: string; tick: number } | null => {
    for (const inv of def.invariants ?? []) {
      if (inv.id === 'inventory-nonnegative') {
        for (const [id, st] of Object.entries(states)) {
          const invMap = st.data['inventory'] as Record<string, number> | undefined;
          if (invMap) {
            for (const [sku, qty] of Object.entries(invMap)) {
              if (qty < 0) return { name: inv.id, description: `Inventory negative for ${sku} on ${id}`, tick };
            }
          }
        }
      }
      if (inv.id === 'seat-single-owner') {
        const owners = new Map<string, Set<string>>();
        for (const e of events) {
          if (e.type === 'SERVICE_RESPONSE' && typeof e.payload['seat'] === 'string' && e.payload['booked'] === true) {
            const seat = e.payload['seat'] as string;
            const set = owners.get(seat) ?? new Set<string>();
            set.add(String(e.payload['owner'] ?? e.source));
            owners.set(seat, set);
            if (set.size > 1) return { name: inv.id, description: `Seat ${seat} allocated to ${set.size} owners`, tick };
          }
        }
      }
      if (inv.id === 'payment-at-most-once') {
        const charges = new Map<string, number>();
        for (const e of events) {
          if (e.type === 'PAYMENT_AUTHORIZED' && typeof e.payload['orderId'] === 'string') {
            const k = e.payload['orderId'] as string;
            charges.set(k, (charges.get(k) ?? 0) + 1);
            if ((charges.get(k) ?? 0) > 1) return { name: inv.id, description: `Order ${k} charged twice`, tick };
          }
        }
      }
    }
    return null;
  };

  for (let tick = 1; tick <= maxTicks; tick++) {
    // Deliver scheduled fan-outs.
    const due = pending.filter((p) => p.deliverAtTick <= tick);
    pending = pending.filter((p) => p.deliverAtTick > tick);
    // Deterministic order: sort by (target, type).
    due.sort((a, b) => {
      const at = `${a.event.target ?? ''}:${a.event.type}`;
      const bt = `${b.event.target ?? ''}:${b.event.type}`;
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
    const chainNow = (produced: SystemEmittedEvent[]): void => {
      for (const p of produced) {
        if (p.target && byId.has(p.target) && shouldChain(p.type)) {
          const lat = latencyOf(p.source, p.target);
          pending.push({ deliverAtTick: tick + 1, event: { ...p, id: '', tick: tick + 1, simTimeMs: simTimeMs + lat } });
        }
      }
    };
    for (const d of due) {
      const target = d.event.target;
      if (!target || !byId.has(target)) continue;
      const stamped: SystemEmittedEvent = { ...d.event, id: `sys-${String(seq++)}`, tick, simTimeMs };
      events.push(stamped);
      chainNow(processAt(target, tick, stamped));
    }
    // Fresh inputs.
    const inputs = [...(inputsByTick.get(tick) ?? [])].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
    for (const input of inputs) {
      const entryId = input.source ?? input.target ?? def.components[0]?.id ?? 'client';
      const entryPayload = { ...(input.payload ?? {}) };
      // Synthesize entry USER_ACTION then route one hop.
      const entry = emit({
        tick, simTimeMs, type: input.type, source: entryId,
        target: input.target, payload: entryPayload, result: 'PENDING',
        explain: undefined,
      });
      const chain = (produced: SystemEmittedEvent[]): void => {
        for (const p of produced) {
          if (p.target && byId.has(p.target) && shouldChain(p.type)) {
            const lat = latencyOf(p.source, p.target);
            pending.push({ deliverAtTick: tick + 1, event: { ...p, id: '', tick: tick + 1, simTimeMs: simTimeMs + lat } });
          }
        }
      };
      if (input.target && byId.has(input.target) && input.source && byId.has(input.source)) {
        const produced = processAt(input.target, tick, { ...entry, source: input.source });
        chain(produced);
      } else if (byId.has(entryId)) {
        const produced = processAt(entryId, tick, entry);
        chain(produced);
      }
    }
    const v = checkInvariants(tick);
    if (v && !violation) {
      violation = v;
      for (const st of Object.values(states)) st.status = st.status === 'failure' ? st.status : 'warning';
    }
    // Snapshot frame (structural share ok — states cloned for frame).
    const snapshot: Record<string, ComponentRuntimeState> = {};
    for (const [id, st] of Object.entries(states)) snapshot[id] = deepClone(st);
    // Settle non-failure actives back to idle/success for next frame readability.
    for (const st of Object.values(states)) {
      if (st.status === 'active') st.status = violation ? 'warning' : 'success';
    }
    const activeEvents = events.filter((e) => e.tick === tick).slice(-12);
    let qd = 0;
    for (const st of Object.values(states)) qd += st.queueDepth;
    frames.push({ tick, simTimeMs, componentStates: snapshot, activeEvents: deepClone(activeEvents), violation: violation ? { name: violation.name, description: violation.description } : null });
    if (violation) break;
  }

  let qd = 0;
  for (const st of Object.values(states)) qd += st.queueDepth;
  const metrics = computeMetrics(events, qd);
  const content = contentHash({ systemId: def.id, seed: script.seed, events, finals: states, metrics });
  void canonicalStringify;
  return { systemId: def.id, seed: script.seed, frames, events, finalStates: deepClone(states), metrics, violation, contentHash: content };
}
