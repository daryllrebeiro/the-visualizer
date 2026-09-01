import type { BTreeNode, BTreeState } from './storage-types.js';

export function createInitialBTree(maxDegree = 4): BTreeState {
  const rootNode: BTreeNode = {
    id: 'node-root',
    keys: [10, 20, 30],
    values: ['val_10', 'val_20', 'val_30'],
    childrenIds: [],
    isLeaf: true,
    parentId: null,
  };

  return {
    rootId: 'node-root',
    maxDegree,
    nodes: { 'node-root': rootNode },
    totalPageSplits: 0,
    traversalPath: [],
  };
}

export function searchBTree(state: BTreeState, key: number): { value: string | null; path: string[] } {
  const path: string[] = [];
  let currId = state.rootId;

  while (currId && state.nodes[currId]) {
    path.push(currId);
    const node = state.nodes[currId]!;

    if (node.isLeaf) {
      const idx = node.keys.indexOf(key);
      return {
        value: idx !== -1 ? (node.values[idx] ?? null) : null,
        path,
      };
    }

    // Find branch child
    let childIdx = 0;
    while (childIdx < node.keys.length && key >= node.keys[childIdx]!) {
      childIdx++;
    }
    currId = node.childrenIds[childIdx] ?? '';
  }

  return { value: null, path };
}

export function insertBTree(state: BTreeState, key: number, value: string): void {
  // 1. Find leaf
  let currId = state.rootId;
  const path: string[] = [];

  while (currId && state.nodes[currId]) {
    path.push(currId);
    const node = state.nodes[currId]!;
    if (node.isLeaf) break;

    let childIdx = 0;
    while (childIdx < node.keys.length && key >= node.keys[childIdx]!) {
      childIdx++;
    }
    currId = node.childrenIds[childIdx] ?? '';
  }

  state.traversalPath = path;
  const leaf = state.nodes[currId];
  if (!leaf) return;

  // 2. Insert into leaf sorted
  let insertIdx = 0;
  while (insertIdx < leaf.keys.length && leaf.keys[insertIdx]! < key) {
    insertIdx++;
  }

  if (insertIdx < leaf.keys.length && leaf.keys[insertIdx] === key) {
    leaf.values[insertIdx] = value;
    return;
  }

  leaf.keys.splice(insertIdx, 0, key);
  leaf.values.splice(insertIdx, 0, value);

  // 3. Handle split if overflow
  if (leaf.keys.length >= state.maxDegree) {
    splitNode(state, leaf.id);
  }
}

function splitNode(state: BTreeState, nodeId: string): void {
  state.totalPageSplits++;
  const node = state.nodes[nodeId];
  if (!node) return;

  const mid = Math.floor(node.keys.length / 2);
  const promotedKey = node.keys[mid]!;
  const promotedValue = node.values[mid]!;

  const newNodeId = `node-${String(Date.now())}-${Math.random().toString(36).substring(2, 5)}`;
  const rightNode: BTreeNode = {
    id: newNodeId,
    keys: node.keys.slice(mid + (node.isLeaf ? 0 : 1)),
    values: node.values.slice(mid + (node.isLeaf ? 0 : 1)),
    childrenIds: node.isLeaf ? [] : node.childrenIds.slice(mid + 1),
    isLeaf: node.isLeaf,
    parentId: node.parentId,
  };

  // Update children parentIds if internal
  for (const cId of rightNode.childrenIds) {
    if (state.nodes[cId]) state.nodes[cId]!.parentId = newNodeId;
  }

  node.keys = node.keys.slice(0, mid);
  node.values = node.values.slice(0, mid);
  if (!node.isLeaf) {
    node.childrenIds = node.childrenIds.slice(0, mid + 1);
  }

  state.nodes[newNodeId] = rightNode;

  if (!node.parentId) {
    // Creating new root
    const newRootId = `node-root-${String(Date.now())}`;
    const newRoot: BTreeNode = {
      id: newRootId,
      keys: [promotedKey],
      values: [promotedValue],
      childrenIds: [node.id, newNodeId],
      isLeaf: false,
      parentId: null,
    };
    node.parentId = newRootId;
    rightNode.parentId = newRootId;
    state.nodes[newRootId] = newRoot;
    state.rootId = newRootId;
  } else {
    const parent = state.nodes[node.parentId];
    if (parent) {
      let pIdx = 0;
      while (pIdx < parent.keys.length && parent.keys[pIdx]! < promotedKey) {
        pIdx++;
      }
      parent.keys.splice(pIdx, 0, promotedKey);
      parent.values.splice(pIdx, 0, promotedValue);
      parent.childrenIds.splice(pIdx + 1, 0, newNodeId);

      if (parent.keys.length >= state.maxDegree) {
        splitNode(state, parent.id);
      }
    }
  }
}
