import type { SystemDefinition } from '@the-visualizer/contracts';

export const MVP_CACHE_SYSTEM: SystemDefinition = {
  id: 'mvp-cache',
  version: '1.0.0',
  name: 'Cache MVP',
  description: 'User → Gateway → Service → Redis → Database. Proves composite execution.',
  components: [
    { id: 'user', type: 'client', name: 'User', category: 'compute', config: {} },
    { id: 'gateway', type: 'gateway', name: 'API Gateway', category: 'network', config: { latencyMs: 2 } },
    { id: 'service', type: 'service', name: 'Product Service', category: 'compute', config: {} },
    { id: 'redis', type: 'redis', name: 'Redis', category: 'cache', domainId: 'redis', config: { seedCache: { 'product:42': { id: 'product:42', name: 'Widget', price: 42 } }, latencyMs: 1 } },
    { id: 'db', type: 'postgres', name: 'PostgreSQL', category: 'database', domainId: 'database', config: { seedDb: { 'product:42': { id: 'product:42', name: 'Widget', price: 42 }, 'product:7': { id: 'product:7', name: 'Gadget', price: 7 } }, latencyMs: 15 } },
  ],
  connections: [
    { id: 'c1', source: 'user', target: 'gateway', protocol: 'http', direction: 'unidirectional', config: { latencyMs: 1 } },
    { id: 'c2', source: 'gateway', target: 'service', protocol: 'http', direction: 'unidirectional', config: { latencyMs: 2 } },
    { id: 'c3', source: 'service', target: 'redis', protocol: 'tcp', direction: 'unidirectional', config: { latencyMs: 1 } },
    { id: 'c4', source: 'service', target: 'db', protocol: 'database', direction: 'unidirectional', config: { latencyMs: 15 } },
  ],
  scenarios: [
    {
      id: 'cache-hit', name: 'Cache hit', description: 'GET /product/42 served from Redis.',
      seed: 42,
      events: [{ tick: 1, type: 'HTTP_REQUEST', source: 'user', target: 'gateway', payload: { key: 'product:42', method: 'GET', path: '/product/42' } }],
      failures: [], explain: {},
    },
    {
      id: 'cache-miss', name: 'Cache miss', description: 'GET /product/7 misses Redis, falls back to DB.',
      seed: 42,
      events: [{ tick: 1, type: 'HTTP_REQUEST', source: 'user', target: 'gateway', payload: { key: 'product:7', method: 'GET', path: '/product/7' } }],
      failures: [], explain: {},
    },
  ],
  invariants: [{ id: 'cache-coherence', description: 'Cache hits must reference previously seeded or stored keys.' }],
  metadata: {
    version: '1.0.0', tags: ['mvp', 'cache'],
    learn: { what: 'Gateway → service → cache → database fallback.', why: 'Cache absorbs hot reads; misses fall through to the database.', tradeoffs: 'Stale reads vs latency.' },
  },
};
