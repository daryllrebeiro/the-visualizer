import type { LSMTreeState, SSTable, SSTableEntry } from './storage-types.js';

export function createInitialLSMTree(memTableCapacity = 4): LSMTreeState {
  return {
    memTableCapacity,
    memTable: [
      { key: 10, value: 'val_10', tombstone: false, version: 1 },
      { key: 20, value: 'val_20', tombstone: false, version: 1 },
    ],
    immutableMemTables: [],
    wal: [
      { key: 10, value: 'val_10', tombstone: false, version: 1 },
      { key: 20, value: 'val_20', tombstone: false, version: 1 },
    ],
    levels: {
      '0': [],
      '1': [],
      '2': [],
    },
    totalFlushes: 0,
    totalCompactions: 0,
    bloomFilterHits: 0,
    bloomFilterFalses: 0,
  };
}

export function generateBloomFilter(keys: number[], bits = 16): string {
  const bitset = new Array(bits).fill(0);
  for (const k of keys) {
    const h1 = Math.abs(k * 31) % bits;
    const h2 = Math.abs(k * 17 + 5) % bits;
    bitset[h1] = 1;
    bitset[h2] = 1;
  }
  return bitset.join('');
}

export function testBloomFilter(bitsetStr: string, key: number): boolean {
  const bits = bitsetStr.length;
  const h1 = Math.abs(key * 31) % bits;
  const h2 = Math.abs(key * 17 + 5) % bits;
  return bitsetStr[h1] === '1' && bitsetStr[h2] === '1';
}

export function writeLSM(state: LSMTreeState, key: number, value: string, tick: number): void {
  const entry: SSTableEntry = {
    key,
    value,
    tombstone: false,
    version: tick,
  };

  // 1. WAL append
  state.wal.push(entry);

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
}

export function flushMemTable(state: LSMTreeState, tick: number): void {
  if (state.memTable.length === 0) return;

  state.totalFlushes++;
  const entries = [...state.memTable];
  state.memTable = [];

  const keys = entries.map((e) => e.key);
  const minKey = Math.min(...keys);
  const maxKey = Math.max(...keys);

  const sstable: SSTable = {
    id: `sstable-L0-${String(tick)}-${Math.random().toString(36).substring(2, 5)}`,
    level: 0,
    minKey,
    maxKey,
    entries,
    bloomFilterBitset: generateBloomFilter(keys),
    sizeBytes: entries.length * 64,
    createdAtTick: tick,
  };

  if (!state.levels['0']) state.levels['0'] = [];
  state.levels['0'].unshift(sstable); // Newest at front

  // Auto compact if Level 0 has >= 3 SSTables
  if (state.levels['0'].length >= 3) {
    compactLevel(state, 0, tick);
  }
}

export function compactLevel(state: LSMTreeState, fromLevel: number, tick: number): void {
  state.totalCompactions++;
  const fromLvlKey = String(fromLevel);
  const toLvlKey = String(fromLevel + 1);

  const fromTables = state.levels[fromLvlKey] ?? [];
  const toTables = state.levels[toLvlKey] ?? [];

  // Merge all entries
  const map = new Map<number, SSTableEntry>();

  // Oldest to newest merge
  for (const t of [...toTables, ...fromTables].reverse()) {
    for (const e of t.entries) {
      const existing = map.get(e.key);
      if (!existing || e.version >= existing.version) {
        map.set(e.key, e);
      }
    }
  }

  const mergedEntries = Array.from(map.values())
    .filter((e) => !e.tombstone)
    .sort((a, b) => a.key - b.key);

  const keys = mergedEntries.map((e) => e.key);
  const minKey = keys.length > 0 ? Math.min(...keys) : 0;
  const maxKey = keys.length > 0 ? Math.max(...keys) : 0;

  const compactedTable: SSTable = {
    id: `sstable-L${String(fromLevel + 1)}-${String(tick)}-${Math.random().toString(36).substring(2, 5)}`,
    level: fromLevel + 1,
    minKey,
    maxKey,
    entries: mergedEntries,
    bloomFilterBitset: generateBloomFilter(keys),
    sizeBytes: mergedEntries.length * 64,
    createdAtTick: tick,
  };

  state.levels[fromLvlKey] = [];
  state.levels[toLvlKey] = [compactedTable];
}

export function readLSM(state: LSMTreeState, key: number): { value: string | null; sstableId?: string; inMemTable: boolean } {
  // 1. MemTable
  const memEntry = state.memTable.find((e) => e.key === key);
  if (memEntry) {
    return { value: memEntry.tombstone ? null : memEntry.value, inMemTable: true };
  }

  // 2. SSTables level 0 -> 1 -> 2
  for (const lvl of ['0', '1', '2']) {
    const tables = state.levels[lvl] ?? [];
    for (const t of tables) {
      if (key >= t.minKey && key <= t.maxKey) {
        if (testBloomFilter(t.bloomFilterBitset, key)) {
          const entry = t.entries.find((e) => e.key === key);
          if (entry) {
            state.bloomFilterHits++;
            return { value: entry.tombstone ? null : entry.value, sstableId: t.id, inMemTable: false };
          } else {
            state.bloomFilterFalses++;
          }
        }
      }
    }
  }

  return { value: null, inMemTable: false };
}
