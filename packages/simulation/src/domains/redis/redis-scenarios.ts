import type { ScenarioDefinition } from '../../engine/types.js';

export const REDIS_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'redis-lru-lfu-shootout',
    title: 'Cache Eviction Shootout: LRU vs. LFU Policies',
    badge: 'Memory Management',
    description:
      'Fills a 512-byte cache node to maximum capacity. Shows how "allkeys-lru" evicts old unread keys, while "allkeys-lfu" preserves frequently accessed hot items even if accessed long ago.',
    steps: [
      '1. Setup: Set eviction policy = allkeys-lru on Node 1 (capacity 512B).',
      '2. Populate: Insert keys K1, K2, K3, K4, K5 (64B each). Read K1 10 times (hot item).',
      '3. Satiate: Insert K6, K7, K8, K9 until memory reaches 512B limit.',
      '4. Evict LRU: Insert K10. Observe K2 (least recently used) evicted.',
      '5. Switch LFU: Switch policy to allkeys-lfu. Insert K11. Observe low-frequency items evicted first while K1 is preserved.',
    ],
    actionLabel: '▶ Run Eviction Shootout',
    tags: ['redis', 'caching', 'lru', 'lfu'],
  },
  {
    id: 'redis-resharding-ask-moved',
    title: 'Live Slot Resharding & MOVED/ASK Redirections',
    badge: 'Cluster Sharding',
    description:
      'Demonstrates online slot migration from Master 1 (slots 0-5460) to Master 2 (slots 5461-10922). Shows how clients receiving -MOVED and -ASK errors dynamically discover new cluster topology.',
    steps: [
      '1. Baseline: Master 1 owns slots 0-5460; Master 2 owns slots 5461-10922.',
      '2. Initiate Reshard: Mark slots 5000-5460 as MIGRATING on Master 1, IMPORTING on Master 2.',
      '3. Redirection Flow: Client queries key in slot 5100 -> receives -ASK redirect to Master 2.',
      '4. Complete Reshard: Finalize ownership update -> subsequent queries seamlessly route with -MOVED update.',
    ],
    actionLabel: '▶ Run Resharding Lab',
    tags: ['redis', 'cluster', 'resharding', 'redirection'],
  },
  {
    id: 'redis-master-failover',
    title: 'Master Failure & Automatic Replica Promotion',
    badge: 'High Availability',
    description:
      'Simulates an abrupt hardware crash on Master 1. Replica Node 4 detects the heartbeat failure and promotes itself to Master, maintaining 100% slot availability across all 16,384 slots.',
    steps: [
      '1. Chaos: Crash Master Node 1 (owner of slots 0-5460).',
      '2. Detection: Replica Node 4 detects node failure.',
      '3. Failover: Replica Node 4 promotes to MASTER for slots 0-5460.',
      '4. Resumption: Cluster continues accepting reads and writes across all 16,384 slots without data loss.',
    ],
    actionLabel: '▶ Run Failover Lab',
    tags: ['redis', 'failover', 'replication'],
  },
];
