import type { SystemDefinition } from '@the-visualizer/contracts';

export const ECOMMERCE_SYSTEM: SystemDefinition = {
  id: 'ecommerce',
  version: '1.0.0',
  name: 'E-commerce',
  description: 'Frontend → gateway → product/cart/order services → redis/postgres → kafka → payment/inventory/notification.',
  components: [
    { id: 'user', type: 'client', name: 'User', category: 'compute', config: {} },
    { id: 'frontend', type: 'service', name: 'Frontend', category: 'compute', config: {} },
    { id: 'gateway', type: 'gateway', name: 'API Gateway', category: 'network', config: {} },
    { id: 'product', type: 'service', name: 'Product Service', category: 'compute', config: {} },
    { id: 'cart', type: 'service', name: 'Cart Service', category: 'compute', config: {} },
    { id: 'order', type: 'service', name: 'Order Service', category: 'compute', config: { retryPolicy: { maxRetries: 3, baseBackoffMs: 100 } } },
    { id: 'redis', type: 'redis', name: 'Redis', category: 'cache', domainId: 'redis', config: { seedCache: { 'product:42': { id: 'product:42', name: 'Widget', price: 42 } } } },
    { id: 'db', type: 'postgres', name: 'PostgreSQL', category: 'database', domainId: 'database', config: { seedDb: { 'product:42': { id: 'product:42', name: 'Widget', price: 42 } }, inventory: { 'sku-42': 10 } } },
    { id: 'kafka', type: 'kafka', name: 'Kafka', category: 'messaging', domainId: 'kafka', config: {} },
    { id: 'payment', type: 'service', name: 'Payment Service', category: 'compute', config: { ledger: {} } },
    { id: 'inventory', type: 'service', name: 'Inventory Service', category: 'compute', config: { inventory: { 'sku-42': 10 } } },
    { id: 'notify', type: 'worker', name: 'Notification Worker', category: 'compute', config: {} },
  ],
  connections: [
    { id: 'e1', source: 'user', target: 'frontend', protocol: 'http', direction: 'unidirectional', config: { latencyMs: 1 } },
    { id: 'e2', source: 'frontend', target: 'gateway', protocol: 'http', direction: 'unidirectional', config: { latencyMs: 2 } },
    { id: 'e3', source: 'gateway', target: 'product', protocol: 'http', direction: 'unidirectional', config: { latencyMs: 2 } },
    { id: 'e4', source: 'gateway', target: 'cart', protocol: 'http', direction: 'unidirectional', config: { latencyMs: 2 } },
    { id: 'e5', source: 'gateway', target: 'order', protocol: 'http', direction: 'unidirectional', config: { latencyMs: 2 } },
    { id: 'e6', source: 'product', target: 'redis', protocol: 'tcp', direction: 'unidirectional', config: { latencyMs: 1 } },
    { id: 'e7', source: 'product', target: 'db', protocol: 'database', direction: 'unidirectional', config: { latencyMs: 15 } },
    { id: 'e8', source: 'cart', target: 'redis', protocol: 'tcp', direction: 'unidirectional', config: { latencyMs: 1 } },
    { id: 'e9', source: 'order', target: 'db', protocol: 'database', direction: 'unidirectional', config: { latencyMs: 15 } },
    { id: 'e10', source: 'order', target: 'kafka', protocol: 'kafka', direction: 'unidirectional', config: { latencyMs: 5 } },
    { id: 'e11', source: 'kafka', target: 'payment', protocol: 'kafka', direction: 'unidirectional', config: { latencyMs: 5 } },
    { id: 'e12', source: 'kafka', target: 'inventory', protocol: 'kafka', direction: 'unidirectional', config: { latencyMs: 5 } },
    { id: 'e13', source: 'kafka', target: 'notify', protocol: 'kafka', direction: 'unidirectional', config: { latencyMs: 5 } },
  ],
  scenarios: [
    { id: 'browse', name: 'Browse product', description: 'User → product API → cache → DB fallback.', seed: 42, events: [{ tick: 1, type: 'HTTP_REQUEST', source: 'user', target: 'gateway', payload: { key: 'product:42', path: '/products/42' } }], failures: [], explain: {} },
    { id: 'cache-hit', name: 'Cache hit', description: 'Redis serves hot product.', seed: 42, events: [{ tick: 1, type: 'HTTP_REQUEST', source: 'user', target: 'gateway', payload: { key: 'product:42' } }], failures: [], explain: {} },
    { id: 'cache-miss', name: 'Cache miss', description: 'Miss → DB → SET.', seed: 42, events: [{ tick: 1, type: 'HTTP_REQUEST', source: 'user', target: 'gateway', payload: { key: 'product:7' } }], failures: [], explain: {} },
    { id: 'checkout', name: 'Checkout', description: 'Cart → order → kafka → payment/inventory/notify.', seed: 42, events: [{ tick: 1, type: 'HTTP_REQUEST', source: 'user', target: 'order', payload: { key: 'product:42', orderId: 'o-1', sku: 'sku-42' } }], failures: [], explain: {} },
    { id: 'redis-down', name: 'What if Redis disappears?', description: 'Cache unavailable; DB absorbs load.', seed: 42, events: [{ tick: 1, type: 'HTTP_REQUEST', source: 'user', target: 'gateway', payload: { key: 'product:42' } }], failures: [{ target: 'redis', type: 'crash', startTick: 1, durationTicks: 10, config: {} }], explain: { redis: 'Without Redis every read reaches PostgreSQL; latency rises with DB load.' } },
  ],
  invariants: [
    { id: 'inventory-nonnegative', description: 'Inventory cannot go negative.' },
    { id: 'payment-at-most-once', description: 'A successful payment cannot be charged twice.' },
  ],
  metadata: {
    version: '1.0.0', tags: ['flagship', 'ecommerce'],
    learn: { what: 'Reads fan out to cache then DB; writes flow through orders into Kafka consumers.', why: 'Cache trims p99; Kafka decouples payment, inventory, notifications.', tradeoffs: 'Cache staleness, consumer lag, single-DB SPOF.' },
  },
};

export const TICKET_BOOKING_SYSTEM: SystemDefinition = {
  id: 'ticket-booking',
  version: '1.0.0',
  name: 'Ticket Booking',
  description: 'Concurrency flagship: two users race for seat A12, with and without distributed lock.',
  components: [
    { id: 'users', type: 'client', name: 'Users', category: 'compute', config: {} },
    { id: 'gateway', type: 'gateway', name: 'API Gateway', category: 'network', config: {} },
    { id: 'booking', type: 'service', name: 'Booking Service', category: 'compute', config: { retryPolicy: { maxRetries: 2, baseBackoffMs: 50 } } },
    { id: 'lock', type: 'lock', name: 'Redis Lock', category: 'compute', domainId: 'distributed-lock', config: { ttlTicks: 50 } },
    { id: 'db', type: 'postgres', name: 'PostgreSQL', category: 'database', domainId: 'database', config: { seedDb: {} } },
    { id: 'payment', type: 'service', name: 'Payment', category: 'compute', config: {} },
  ],
  connections: [
    { id: 't1', source: 'users', target: 'gateway', protocol: 'http', direction: 'unidirectional', config: { latencyMs: 1 } },
    { id: 't2', source: 'gateway', target: 'booking', protocol: 'http', direction: 'unidirectional', config: { latencyMs: 2 } },
    { id: 't3', source: 'booking', target: 'lock', protocol: 'tcp', direction: 'unidirectional', config: { latencyMs: 2 } },
    { id: 't4', source: 'booking', target: 'db', protocol: 'database', direction: 'unidirectional', config: { latencyMs: 15 } },
    { id: 't5', source: 'booking', target: 'payment', protocol: 'http', direction: 'unidirectional', config: { latencyMs: 50 } },
  ],
  scenarios: [
    { id: 'normal-booking', name: 'Normal booking', description: 'Single user books A12.', seed: 42, events: [{ tick: 1, type: 'HTTP_REQUEST', source: 'users', target: 'booking', payload: { seat: 'A12', owner: 'alice' } }], failures: [], explain: {} },
    { id: 'double-race', name: 'Double booking race', description: 'Alice and Bob race for A12; lock admits one.', seed: 42, events: [{ tick: 1, type: 'HTTP_REQUEST', source: 'users', target: 'booking', payload: { seat: 'A12', owner: 'alice' } }, { tick: 1, type: 'HTTP_REQUEST', source: 'users', target: 'booking', payload: { seat: 'A12', owner: 'bob' } }], failures: [], explain: { lock: 'The lock serializes the race; loser receives LOCK_REJECTED.' } },
    { id: 'lock-expiry', name: 'Lock expiry', description: 'Late retry after TTL succeeds.', seed: 42, events: [{ tick: 1, type: 'HTTP_REQUEST', source: 'users', target: 'booking', payload: { seat: 'A12', owner: 'alice' } }, { tick: 60, type: 'HTTP_REQUEST', source: 'users', target: 'booking', payload: { seat: 'A12', owner: 'bob' } }], failures: [], explain: {} },
    { id: 'payment-failure', name: 'Payment failure', description: 'Booking rolls back on payment error.', seed: 42, events: [{ tick: 1, type: 'HTTP_REQUEST', source: 'users', target: 'booking', payload: { seat: 'A12', owner: 'alice' } }], failures: [{ target: 'payment', type: 'error', startTick: 1, durationTicks: 10, config: {} }], explain: {} },
  ],
  invariants: [{ id: 'seat-single-owner', description: 'A seat cannot have two successful owners.' }],
  metadata: {
    version: '1.0.0', tags: ['flagship', 'concurrency'],
    learn: { what: 'Two requests converge on one seat; the lock grants exactly one.', why: 'Check-then-act without atomicity double-books; the lock makes allocation atomic.', tradeoffs: 'Lock expiry trades availability for correctness; stale locks need fencing.' },
  },
};

export const COLLAB_DOCS_SYSTEM: SystemDefinition = {
  id: 'collab-docs',
  version: '1.0.0',
  name: 'Collaborative Docs',
  description: 'Collaborative document system inspired by real-time editors. Clients → websocket → engine → op-log + store.',
  components: [
    { id: 'alice', type: 'client', name: 'Client A', category: 'compute', config: {} },
    { id: 'bob', type: 'client', name: 'Client B', category: 'compute', config: {} },
    { id: 'ws', type: 'websocket-server', name: 'WebSocket Layer', category: 'network', config: {} },
    { id: 'engine', type: 'service', name: 'Collaboration Engine', category: 'compute', config: { oplog: [], store: { doc: '' } } },
    { id: 'oplog', type: 'queue', name: 'Operation Log', category: 'messaging', config: {} },
    { id: 'store', type: 'database-generic', name: 'Document Store', category: 'storage', config: { seedDb: { doc: { text: '' } } } },
  ],
  connections: [
    { id: 'd1', source: 'alice', target: 'ws', protocol: 'websocket', direction: 'unidirectional', config: { latencyMs: 2 } },
    { id: 'd2', source: 'bob', target: 'ws', protocol: 'websocket', direction: 'unidirectional', config: { latencyMs: 2 } },
    { id: 'd3', source: 'ws', target: 'engine', protocol: 'event', direction: 'unidirectional', config: { latencyMs: 2 } },
    { id: 'd4', source: 'engine', target: 'oplog', protocol: 'queue', direction: 'unidirectional', config: { latencyMs: 1 } },
    { id: 'd5', source: 'engine', target: 'store', protocol: 'database', direction: 'unidirectional', config: { latencyMs: 5 } },
  ],
  scenarios: [
    { id: 'type', name: 'User types', description: 'Alice inserts text; engine appends to op-log and store.', seed: 42, events: [{ tick: 1, type: 'USER_ACTION', source: 'alice', target: 'ws', payload: { op: 'insert', pos: 0, text: 'hello' } }], failures: [], explain: {} },
    { id: 'concurrent-edit', name: 'Concurrent edit', description: 'Alice and Bob insert concurrently; engine orders and merges.', seed: 42, events: [{ tick: 1, type: 'USER_ACTION', source: 'alice', target: 'ws', payload: { op: 'insert', pos: 0, text: 'hello' } }, { tick: 1, type: 'USER_ACTION', source: 'bob', target: 'ws', payload: { op: 'insert', pos: 0, text: 'world' } }], failures: [], explain: { engine: 'Concurrent ops are ordered by arrival tick then merged; replicas converge after sync.' } },
    { id: 'reconnect', name: 'Reconnect', description: 'Offline edits replay from op-log on reconnect.', seed: 42, events: [{ tick: 1, type: 'USER_ACTION', source: 'alice', target: 'ws', payload: { op: 'insert', pos: 0, text: 'offline' } }, { tick: 5, type: 'USER_ACTION', source: 'bob', target: 'ws', payload: { op: 'sync' } }], failures: [{ target: 'ws', type: 'partition', startTick: 2, durationTicks: 2, config: {} }], explain: {} },
  ],
  invariants: [{ id: 'replicas-converge', description: 'All replicas converge after synchronization.' }],
  metadata: {
    version: '1.0.0', tags: ['flagship', 'realtime'],
    learn: { what: 'Edits become ordered ops; the log is the source of truth.', why: 'Ordering + merge (OT/CRDT-style) resolves conflicts without locking.', tradeoffs: 'Eventual consistency: replicas diverge briefly, converge after sync.' },
  },
};
