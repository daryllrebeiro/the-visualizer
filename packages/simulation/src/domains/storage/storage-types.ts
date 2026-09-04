export type StorageEngineType = 'B_TREE' | 'LSM_TREE';

export interface BTreeNode {
  id: string;
  keys: number[];
  values: string[];
  childrenIds: string[];
  isLeaf: boolean;
  parentId: string | null;
}

export interface BTreeState {
  rootId: string;
  maxDegree: number; // e.g. 4 for textbook, 64-256 for realistic page-size derived
  pageSizeBytes: number; // e.g. 4096 bytes (SQLite standard)
  keySizeBytes: number; // e.g. 16 bytes
  pointerSizeBytes: number; // e.g. 8 bytes
  nodes: Record<string, BTreeNode>;
  totalPageSplits: number;
  totalMerges: number;
  totalRedistributions: number;
  traversalPath: string[];
}

export interface SSTableEntry {
  key: number;
  value: string;
  tombstone: boolean;
  version: number;
  sizeBytes?: number;
}

export interface SSTable {
  id: string;
  level: number;
  minKey: number;
  maxKey: number;
  entries: SSTableEntry[];
  bloomFilterBitset: string;
  bitsPerKey: number;
  hashCount: number;
  sizeBytes: number;
  createdAtTick: number;
}

export type WALSyncPolicy = 'ALWAYS' | 'PERIODIC' | 'BATCH';

export interface LSMTreeState {
  memTableCapacity: number;
  memTable: SSTableEntry[];
  immutableMemTables: SSTableEntry[][];
  wal: SSTableEntry[];
  walUnsyncedCount: number;
  walSyncPolicy: WALSyncPolicy;
  walBatchThreshold: number;
  levels: Record<string, SSTable[]>;
  levelSizeMultiplier: number; // RocksDB 10x multiplier
  bitsPerKey: number; // default: 10 bits/key (RocksDB default)
  hashCount: number; // k = round(ln(2) * bitsPerKey)
  theoreticalFpRate: number; // (1 - e^(-k/b))^k
  totalFlushes: number;
  totalCompactions: number;
  bloomFilterHits: number;
  bloomFilterFalses: number;
  logicalBytesWritten: number;
  physicalBytesWritten: number;
  writeAmplification: number; // physicalBytesWritten / max(1, logicalBytesWritten)
}

export interface StorageEngineClusterState {
  clusterId: string;
  tick: number;
  rngState: number;
  activeEngine: StorageEngineType;
  fidelityMode: 'TEXTBOOK' | 'REALISTIC';
  btree: BTreeState;
  lsm: LSMTreeState;
  totalWrites: number;
  totalReads: number;
}

export type StorageEventType =
  | 'STORAGE_WRITE'
  | 'STORAGE_READ'
  | 'STORAGE_DELETE'
  | 'STORAGE_SWITCH_ENGINE'
  | 'STORAGE_TRIGGER_FLUSH'
  | 'STORAGE_TRIGGER_COMPACTION'
  | 'STORAGE_CONFIGURE_FIDELITY';

export interface StorageSimEvent {
  id: string;
  tick: number;
  type: StorageEventType;
  payload: Record<string, unknown>;
}
