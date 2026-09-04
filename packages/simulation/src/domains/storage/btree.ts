import type { BTreeNode, BTreeState } from './storage-types.js';

export function deriveBTreeOrder(
  pageSizeBytes = 4096,
  keySizeBytes = 16,
  pointerSizeBytes = 8,
): number {
  return Math.max(3, Math.floor(pageSizeBytes / (keySizeBytes + pointerSizeBytes)));
}

export function createInitialBTree(
  maxDegree = 4,
  pageSizeBytes = 4096,
  keySizeBytes = 16,
  pointerSizeBytes = 8,
): BTreeState {
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
    pageSizeBytes,
    keySizeBytes,
    pointerSizeBytes,
    nodes: { 'node-root': rootNode },
    totalPageSplits: 0,
    totalMerges: 0,
    totalRedistributions: 0,
    traversalPath: [],
  };
}

export function searchBTree(
  state: BTreeState,
  key: number,
): { value: string | null; path: string[] } {
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

  const newNodeId = `node-split-${String(state.totalPageSplits)}-${node.id}-r`;
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
    if (state.nodes[cId]) state.nodes[cId].parentId = newNodeId;
  }

  node.keys = node.keys.slice(0, mid);
  node.values = node.values.slice(0, mid);
  if (!node.isLeaf) {
    node.childrenIds = node.childrenIds.slice(0, mid + 1);
  }

  state.nodes[newNodeId] = rightNode;

  if (!node.parentId) {
    // Creating new root
    const newRootId = `node-root-${String(state.totalPageSplits)}`;
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

/**
 * Real B+Tree Deletion:
 * Removes key, then handles underflow (< ceil(M/2) - 1 keys) via:
 * 1. Key redistribution from left or right sibling
 * 2. Node merging if siblings cannot lend, cascading upward to root
 */
export function deleteBTree(state: BTreeState, key: number): boolean {
  const { path } = searchBTree(state, key);
  state.traversalPath = path;

  const leafId = path[path.length - 1];
  if (!leafId) return false;

  const leaf = state.nodes[leafId];
  if (!leaf?.isLeaf) return false;

  const idx = leaf.keys.indexOf(key);
  if (idx === -1) return false;

  leaf.keys.splice(idx, 1);
  leaf.values.splice(idx, 1);

  // If root, simple underflow check
  if (!leaf.parentId) {
    return true;
  }

  const minKeys = Math.max(1, Math.ceil(state.maxDegree / 2) - 1);
  if (leaf.keys.length < minKeys) {
    handleUnderflow(state, leaf.id, minKeys);
  }

  return true;
}

function handleUnderflow(state: BTreeState, nodeId: string, minKeys: number): void {
  const node = state.nodes[nodeId];
  if (!node?.parentId) return;

  const parent = state.nodes[node.parentId];
  if (!parent) return;

  const childIndex = parent.childrenIds.indexOf(nodeId);
  if (childIndex === -1) return;

  const leftSiblingId = childIndex > 0 ? parent.childrenIds[childIndex - 1] : null;
  const rightSiblingId =
    childIndex < parent.childrenIds.length - 1 ? parent.childrenIds[childIndex + 1] : null;

  const leftSibling = leftSiblingId ? state.nodes[leftSiblingId] : null;
  const rightSibling = rightSiblingId ? state.nodes[rightSiblingId] : null;

  // 1. Try borrowing from left sibling (redistribution)
  if (leftSibling && leftSibling.keys.length > minKeys) {
    state.totalRedistributions++;
    const borrowedKey = leftSibling.keys.pop()!;
    const borrowedVal = leftSibling.values.pop()!;
    node.keys.unshift(borrowedKey);
    node.values.unshift(borrowedVal);

    if (!node.isLeaf && leftSibling.childrenIds.length > 0) {
      const borrowedChild = leftSibling.childrenIds.pop()!;
      node.childrenIds.unshift(borrowedChild);
      if (state.nodes[borrowedChild]) state.nodes[borrowedChild].parentId = node.id;
    }

    // Update parent separator
    parent.keys[childIndex - 1] = node.keys[0]!;
    return;
  }

  // 2. Try borrowing from right sibling (redistribution)
  if (rightSibling && rightSibling.keys.length > minKeys) {
    state.totalRedistributions++;
    const borrowedKey = rightSibling.keys.shift()!;
    const borrowedVal = rightSibling.values.shift()!;
    node.keys.push(borrowedKey);
    node.values.push(borrowedVal);

    if (!node.isLeaf && rightSibling.childrenIds.length > 0) {
      const borrowedChild = rightSibling.childrenIds.shift()!;
      node.childrenIds.push(borrowedChild);
      if (state.nodes[borrowedChild]) state.nodes[borrowedChild].parentId = node.id;
    }

    // Update parent separator
    parent.keys[childIndex] = rightSibling.keys[0]!;
    return;
  }

  // 3. Sibling cannot lend -> Merge with sibling
  state.totalMerges++;
  if (leftSibling && leftSiblingId) {
    // Merge node into leftSibling
    leftSibling.keys.push(...node.keys);
    leftSibling.values.push(...node.values);
    if (!node.isLeaf) {
      for (const cId of node.childrenIds) {
        if (state.nodes[cId]) state.nodes[cId].parentId = leftSibling.id;
      }
      leftSibling.childrenIds.push(...node.childrenIds);
    }

    // Remove separator and child pointer from parent
    parent.keys.splice(childIndex - 1, 1);
    parent.childrenIds.splice(childIndex, 1);
    delete state.nodes[node.id];
  } else if (rightSibling && rightSiblingId) {
    // Merge rightSibling into node
    node.keys.push(...rightSibling.keys);
    node.values.push(...rightSibling.values);
    if (!node.isLeaf) {
      for (const cId of rightSibling.childrenIds) {
        if (state.nodes[cId]) state.nodes[cId].parentId = node.id;
      }
      node.childrenIds.push(...rightSibling.childrenIds);
    }

    // Remove separator and child pointer from parent
    parent.keys.splice(childIndex, 1);
    parent.childrenIds.splice(childIndex + 1, 1);
    delete state.nodes[rightSibling.id];
  }

  // 4. Check if parent now underflows
  if (!parent.parentId) {
    // Parent is root; if root has 0 keys and 1 child, make child root
    if (parent.keys.length === 0 && parent.childrenIds.length === 1) {
      const newRootId = parent.childrenIds[0]!;
      state.rootId = newRootId;
      if (state.nodes[newRootId]) state.nodes[newRootId].parentId = null;
      delete state.nodes[parent.id];
    }
  } else if (parent.keys.length < minKeys) {
    handleUnderflow(state, parent.id, minKeys);
  }
}
