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
  maxDegree: number; // e.g. 4 (max 3 keys before split)
  nodes: Record<string, BTreeNode>;
  totalPageSplits: number;
  traversalPath: string[];
}

export interface SSTableEntry {
  key: number;
  value: string;
  tombstone: boolean;
  version: number;
}

export interface SSTable {
  id: string;
  level: number;
  minKey: number;
  maxKey: number;
  entries: SSTableEntry[];
  bloomFilterBitset: string;
  sizeBytes: number;
  createdAtTick: number;
}

export interface LSMTreeState {
  memTableCapacity: number;
  memTable: SSTableEntry[];
  immutableMemTables: SSTableEntry[][];
  wal: SSTableEntry[];
  levels: Record<string, SSTable[]>;
  totalFlushes: number;
  totalCompactions: number;
  bloomFilterHits: number;
  bloomFilterFalses: number;
}

export interface StorageEngineClusterState {
  clusterId: string;
  tick: number;
  rngState: number;
  activeEngine: StorageEngineType;
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
  | 'STORAGE_TRIGGER_COMPACTION';

export interface StorageSimEvent {
  id: string;
  tick: number;
  type: StorageEventType;
  payload: Record<string, unknown>;
}
