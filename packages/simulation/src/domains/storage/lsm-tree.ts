import type { LSMTreeState, SSTable, SSTableEntry, WALSyncPolicy } from './storage-types.js';

/**
 * Calculates theoretical Bloom filter false-positive rate:
 * p ≈ (1 - e^(-k * n / m))^k = (1 - e^(-k / b))^k
 * where b = bitsPerKey (m/n), k = hashCount
 * Or if totalBits m and itemCount n are provided directly:
 * p ≈ (1 - e^(-k * n / m))^k
 */
export function calculateTheoreticalBloomFpRate(
  bitsPerKeyOrM: number,
  hashCount: number,
  itemCountN?: number,
): number {
  if (bitsPerKeyOrM <= 0) return 1.0;
  const k = hashCount;
  let exponent: number;
  if (itemCountN !== undefined && itemCountN > 0) {
    exponent = (-k * itemCountN) / bitsPerKeyOrM;
  } else {
    exponent = -k / bitsPerKeyOrM;
  }
  const p = Math.pow(1 - Math.exp(exponent), k);
  return Number(p.toFixed(6));
}

export function optimalHashCount(bitsPerKey: number): number {
  return Math.max(1, Math.round(Math.LN2 * bitsPerKey));
}

export function createInitialLSMTree(
  memTableCapacity = 4,
  bitsPerKey = 10,
  walSyncPolicy: WALSyncPolicy = 'ALWAYS',
  levelSizeMultiplier = 10,
): LSMTreeState {
  const hashCount = optimalHashCount(bitsPerKey);
  const fpRate = calculateTheoreticalBloomFpRate(bitsPerKey, hashCount);

  return {
    memTableCapacity,
    memTable: [
      { key: 10, value: 'val_10', tombstone: false, version: 1, sizeBytes: 64 },
      { key: 20, value: 'val_20', tombstone: false, version: 1, sizeBytes: 64 },
    ],
    immutableMemTables: [],
    wal: [
      { key: 10, value: 'val_10', tombstone: false, version: 1, sizeBytes: 64 },
      { key: 20, value: 'val_20', tombstone: false, version: 1, sizeBytes: 64 },
    ],
    walUnsyncedCount: 0,
    walSyncPolicy,
    walBatchThreshold: 4,
    levels: {
      '0': [],
      '1': [],
      '2': [],
    },
    levelSizeMultiplier,
    bitsPerKey,
    hashCount,
    theoreticalFpRate: fpRate,
    totalFlushes: 0,
    totalCompactions: 0,
    bloomFilterHits: 0,
    bloomFilterFalses: 0,
    logicalBytesWritten: 128,
    physicalBytesWritten: 256, // WAL + MemTable initial allocation
    writeAmplification: 2.0,
  };
}

/**
 * Generates bitset with k independent hashes using Kirsch-Mitzenmacher double hashing:
 * h_i(x) = (h1(x) + i * h2(x)) % m
 */
export function generateBloomFilter(
  keys: number[],
  bitsPerKey = 10,
  hashCount?: number,
): { bitset: string; bits: number; k: number } {
  const n = Math.max(1, keys.length);
  const m = Math.max(16, Math.round(n * bitsPerKey));
  const k = hashCount ?? optimalHashCount(bitsPerKey);
  const bitset = new Array(m).fill(0);

  for (const key of keys) {
    // 32-bit integer hashes
    const h1 = Math.abs((key * 2654435761) ^ (key >> 16)) % m;
    const h2 = Math.abs((key * 2246822519) ^ (key >> 13)) % m || 1;

    for (let i = 0; i < k; i++) {
      const idx = (h1 + i * h2) % m;
      bitset[idx] = 1;
    }
  }

  return { bitset: bitset.join(''), bits: m, k };
}

export function testBloomFilter(bitsetStr: string, key: number, hashCount = 7): boolean {
  const m = bitsetStr.length;
  if (m === 0) return true;

  const h1 = Math.abs((key * 2654435761) ^ (key >> 16)) % m;
  const h2 = Math.abs((key * 2246822519) ^ (key >> 13)) % m || 1;

  for (let i = 0; i < hashCount; i++) {
    const idx = (h1 + i * h2) % m;
    if (bitsetStr[idx] !== '1') {
      return false; // Definitely not present
    }
  }

  return true; // Possibly present
}

export function writeLSM(state: LSMTreeState, key: number, value: string, tick: number): void {
  const entrySizeBytes = 32 + value.length;
  state.logicalBytesWritten += entrySizeBytes;

  const entry: SSTableEntry = {
    key,
    value,
    tombstone: false,
    version: tick,
    sizeBytes: entrySizeBytes,
  };

  // 1. WAL append & sync policy
  state.wal.push(entry);
  state.physicalBytesWritten += entrySizeBytes; // WAL write

  if (state.walSyncPolicy === 'ALWAYS') {
    state.walUnsyncedCount = 0;
  } else if (state.walSyncPolicy === 'BATCH') {
    state.walUnsyncedCount++;
    if (state.walUnsyncedCount >= state.walBatchThreshold) {
      state.walUnsyncedCount = 0;
    }
  } else if (state.walSyncPolicy === 'PERIODIC') {
    state.walUnsyncedCount++;
    if (tick % 5 === 0) {
      state.walUnsyncedCount = 0;
    }
  }

  // 2. MemTable insert sorted
  const existingIdx = state.memTable.findIndex((e) => e.key === key);
  if (existingIdx !== -1) {
    state.memTable[existingIdx] = entry;
  } else {
    state.memTable.push(entry);
    state.memTable.sort((a, b) => a.key - b.key);
  }

  // 3. Check flush threshold
  if (state.memTable.length >= state.memTableCapacity) {
    flushMemTable(state, tick);
  }

  // 4. Update WAF metric
  state.writeAmplification = Number(
    (state.physicalBytesWritten / Math.max(1, state.logicalBytesWritten)).toFixed(2),
  );
}

export function deleteLSM(state: LSMTreeState, key: number, tick: number): void {
  const tombstoneSizeBytes = 32;
  state.logicalBytesWritten += tombstoneSizeBytes;

  const tombstoneEntry: SSTableEntry = {
    key,
    value: '',
    tombstone: true,
    version: tick,
    sizeBytes: tombstoneSizeBytes,
  };

  state.wal.push(tombstoneEntry);
  state.physicalBytesWritten += tombstoneSizeBytes;

  const existingIdx = state.memTable.findIndex((e) => e.key === key);
  if (existingIdx !== -1) {
    state.memTable[existingIdx] = tombstoneEntry;
  } else {
    state.memTable.push(tombstoneEntry);
    state.memTable.sort((a, b) => a.key - b.key);
  }

  if (state.memTable.length >= state.memTableCapacity) {
    flushMemTable(state, tick);
  }

  state.writeAmplification = Number(
    (state.physicalBytesWritten / Math.max(1, state.logicalBytesWritten)).toFixed(2),
  );
}

export function flushMemTable(state: LSMTreeState, tick: number): void {
  if (state.memTable.length === 0) return;

  state.totalFlushes++;
  const entries = [...state.memTable];
  state.memTable = [];

  const keys = entries.map((e) => e.key);
  const minKey = Math.min(...keys);
  const maxKey = Math.max(...keys);

  const { bitset, k } = generateBloomFilter(keys, state.bitsPerKey, state.hashCount);
  const tableSizeBytes = entries.reduce((sum, e) => sum + (e.sizeBytes ?? 64), 0);

  const sstable: SSTable = {
    id: `sstable-L0-${String(tick)}-${String((state.levels['0']?.length ?? 0) + 1)}`,
    level: 0,
    minKey,
    maxKey,
    entries,
    bloomFilterBitset: bitset,
    bitsPerKey: state.bitsPerKey,
    hashCount: k,
    sizeBytes: tableSizeBytes,
    createdAtTick: tick,
  };

  state.physicalBytesWritten += tableSizeBytes; // Flush write to disk
  state.writeAmplification = Number(
    (state.physicalBytesWritten / Math.max(1, state.logicalBytesWritten)).toFixed(2),
  );

  if (!state.levels['0']) state.levels['0'] = [];
  state.levels['0'].unshift(sstable); // Newest at front

  // RocksDB-style L0 trigger: compact if L0 has >= 4 files
  if (state.levels['0'].length >= 4) {
    compactLevel(state, 0, tick);
  }
}

/**
 * Leveled Compaction:
 * RocksDB leveled architecture with configurable 10x size amplification:
 * Level 1 capacity = memTableCapacity * 4
 * Level 2 capacity = Level 1 capacity * levelSizeMultiplier (10x)
 */
export function compactLevel(state: LSMTreeState, fromLevel: number, tick: number): void {
  state.totalCompactions++;
  const fromLvlKey = String(fromLevel);
  const toLvlKey = String(fromLevel + 1);

  const fromTables = state.levels[fromLvlKey] ?? [];
  const toTables = state.levels[toLvlKey] ?? [];

  // Merge all entries from source level and overlapping destination tables
  const map = new Map<number, SSTableEntry>();

  for (const t of [...toTables, ...fromTables].reverse()) {
    for (const e of t.entries) {
      const existing = map.get(e.key);
      if (!existing || e.version >= existing.version) {
        map.set(e.key, e);
      }
    }
  }

  // Tombstones are purged during compaction if beyond L0/L1
  const mergedEntries = Array.from(map.values())
    .filter((e) => fromLevel < 1 || !e.tombstone)
    .sort((a, b) => a.key - b.key);

  const keys = mergedEntries.map((e) => e.key);
  const minKey = keys.length > 0 ? Math.min(...keys) : 0;
  const maxKey = keys.length > 0 ? Math.max(...keys) : 0;

  const { bitset, k } = generateBloomFilter(keys, state.bitsPerKey, state.hashCount);
  const compactedTableSizeBytes = mergedEntries.reduce((sum, e) => sum + (e.sizeBytes ?? 64), 0);

  const compactedTable: SSTable = {
    id: `sstable-L${String(fromLevel + 1)}-${String(tick)}-c${String(state.totalCompactions)}`,
    level: fromLevel + 1,
    minKey,
    maxKey,
    entries: mergedEntries,
    bloomFilterBitset: bitset,
    bitsPerKey: state.bitsPerKey,
    hashCount: k,
    sizeBytes: compactedTableSizeBytes,
    createdAtTick: tick,
  };

  // Compaction read-merge-write writes new SSTable to next level (Write Amplification contribution)
  state.physicalBytesWritten += compactedTableSizeBytes;
  state.writeAmplification = Number(
    (state.physicalBytesWritten / Math.max(1, state.logicalBytesWritten)).toFixed(2),
  );

  state.levels[fromLvlKey] = [];
  if (!state.levels[toLvlKey]) state.levels[toLvlKey] = [];
  state.levels[toLvlKey] = [compactedTable];

  // Cascading compaction if next level exceeds threshold
  const nextLvlMaxCapacity =
    state.memTableCapacity * 4 * Math.pow(state.levelSizeMultiplier, fromLevel);
  if (mergedEntries.length >= nextLvlMaxCapacity && fromLevel < 2) {
    compactLevel(state, fromLevel + 1, tick);
  }
}

export function readLSM(
  state: LSMTreeState,
  key: number,
): { value: string | null; sstableId?: string; inMemTable: boolean } {
  // 1. Active MemTable
  const memEntry = state.memTable.find((e) => e.key === key);
  if (memEntry) {
    return { value: memEntry.tombstone ? null : memEntry.value, inMemTable: true };
  }

  // 2. Immutable MemTables (if flushing)
  for (const imm of state.immutableMemTables) {
    const immEntry = imm.find((e) => e.key === key);
    if (immEntry) {
      return { value: immEntry.tombstone ? null : immEntry.value, inMemTable: true };
    }
  }

  // 3. SSTables level 0 -> 1 -> 2
  for (const lvl of ['0', '1', '2']) {
    const tables = state.levels[lvl] ?? [];
    for (const t of tables) {
      if (key >= t.minKey && key <= t.maxKey) {
        if (testBloomFilter(t.bloomFilterBitset, key, t.hashCount)) {
          const entry = t.entries.find((e) => e.key === key);
          if (entry) {
            state.bloomFilterHits++;
            return {
              value: entry.tombstone ? null : entry.value,
              sstableId: t.id,
              inMemTable: false,
            };
          } else {
            state.bloomFilterFalses++;
          }
        }
      }
    }
  }

  return { value: null, inMemTable: false };
}
