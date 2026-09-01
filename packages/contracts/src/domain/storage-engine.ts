import { z } from 'zod';

export const StorageEngineTypeSchema = z.enum(['B_TREE', 'LSM_TREE']);
export type StorageEngineType = z.infer<typeof StorageEngineTypeSchema>;

export const BTreeNodeSchema = z.object({
  id: z.string().min(1),
  keys: z.array(z.number().int()),
  values: z.array(z.string()),
  childrenIds: z.array(z.string()).default([]),
  isLeaf: z.boolean(),
  parentId: z.string().nullable().default(null),
});
export type BTreeNode = z.infer<typeof BTreeNodeSchema>;

export const BTreeStateSchema = z.object({
  rootId: z.string(),
  maxDegree: z.number().int().min(3).default(4), // order B (max keys = maxDegree - 1)
  nodes: z.record(z.string(), BTreeNodeSchema),
  totalPageSplits: z.number().int().nonnegative().default(0),
  traversalPath: z.array(z.string()).default([]),
});
export type BTreeState = z.infer<typeof BTreeStateSchema>;

export const SSTableEntrySchema = z.object({
  key: z.number().int(),
  value: z.string(),
  tombstone: z.boolean().default(false),
  version: z.number().int().nonnegative(),
});
export type SSTableEntry = z.infer<typeof SSTableEntrySchema>;

export const SSTableSchema = z.object({
  id: z.string().min(1),
  level: z.number().int().nonnegative(), // 0 = Level 0 (flushed from memtable), 1 = Level 1 ...
  minKey: z.number().int(),
  maxKey: z.number().int(),
  entries: z.array(SSTableEntrySchema),
  bloomFilterBitset: z.string(), // binary representation
  sizeBytes: z.number().int().positive(),
  createdAtTick: z.number().nonnegative(),
});
export type SSTable = z.infer<typeof SSTableSchema>;

export const LSMTreeStateSchema = z.object({
  memTableCapacity: z.number().int().positive().default(4),
  memTable: z.array(SSTableEntrySchema).default([]),
  immutableMemTables: z.array(z.array(SSTableEntrySchema)).default([]),
  wal: z.array(SSTableEntrySchema).default([]),
  levels: z.record(z.string(), z.array(SSTableSchema)).default({
    '0': [],
    '1': [],
    '2': [],
  }),
  totalFlushes: z.number().int().nonnegative().default(0),
  totalCompactions: z.number().int().nonnegative().default(0),
  bloomFilterHits: z.number().int().nonnegative().default(0),
  bloomFilterFalses: z.number().int().nonnegative().default(0),
});
export type LSMTreeState = z.infer<typeof LSMTreeStateSchema>;

export const StorageEngineClusterStateSchema = z.object({
  clusterId: z.string(),
  tick: z.number().nonnegative(),
  rngState: z.number().int(),
  activeEngine: StorageEngineTypeSchema.default('B_TREE'),
  btree: BTreeStateSchema,
  lsm: LSMTreeStateSchema,
  totalWrites: z.number().int().nonnegative().default(0),
  totalReads: z.number().int().nonnegative().default(0),
});
export type StorageEngineClusterState = z.infer<typeof StorageEngineClusterStateSchema>;
