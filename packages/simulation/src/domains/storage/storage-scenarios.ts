import type { ScenarioDefinition } from '../../engine/types.js';

export const STORAGE_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'storage-btree-splits',
    title: 'B+ Tree Page Overflow & Recursive Node Splitting',
    badge: 'B+ Tree (SQLite)',
    description:
      'Demonstrates B+ Tree index growth. When page capacity is exceeded, the page splits into two balanced halves and the median key is pushed up to the parent page, triggering root splits when necessary.',
    steps: [
      '1. Setup: Order-4 B+ Tree initialized with root node [10, 20, 30].',
      '2. Insert Key 25: Exceeds page limit (4 keys) -> Node splits into [10, 20] and [25, 30], promoting median key to new root.',
      '3. Insert Keys 5, 15, 35: Populates leaf pages balanced across branches.',
      '4. Point Lookup 25: Follows traversal path: root -> branch -> leaf in O(log N) time.',
    ],
    actionLabel: '▶ Run B+ Tree Page Split Lab',
    tags: ['storage', 'btree', 'page-split', 'sqlite'],
  },
  {
    id: 'storage-lsm-compaction',
    title: 'LSM-Tree MemTable Flush, Bloom Filters & Leveled Compaction',
    badge: 'LSM-Tree (RocksDB)',
    description:
      'Simulates append-only write paths. High-throughput writes hit the in-memory MemTable and WAL. Once full, the MemTable flushes to an immutable Level 0 SSTable with Bloom filters, followed by merge-compaction into Level 1.',
    steps: [
      '1. High-Speed Ingestion: Rapidly append keys 50, 60, 70 to MemTable.',
      '2. MemTable Threshold Flush: MemTable capacity (4) reached -> Flushed to Level 0 SSTable with 16-bit Bloom filter.',
      '3. Point Read with Bloom Filter: Tests key presence in Bloom filter bitset before touching SSTable payload.',
      '4. Leveled Compaction: Merge Level 0 SSTables into sorted, deduplicated Level 1 SSTable run.',
    ],
    actionLabel: '▶ Run LSM Compaction Lab',
    tags: ['storage', 'lsm', 'sstable', 'bloom-filter', 'compaction'],
  },
];
