/**
 * Merkle tree & Merkle-Patricia trie algorithms — pure functions.
 *
 * The 128-bit hex hash is a SHA-like deterministic stub built from two
 * independent avalanche-mixed FNV-1a streams with domain separation
 * (leaf vs internal vs patricia node vs empty-trie sentinel), so
 * H(leaf-data) can never equal H(left||right) by construction.
 */

import { fnv1a32 } from '../consistent-hashing/consistent-hashing-algorithms.js';
import type {
  MerkleAntiEntropyResult,
  MerkleProofStep,
  MerkleTreeState,
  PatProof,
  PatProofNode,
  PatTrieNode,
} from './merkle-trees-types.js';

function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

/** Domain-separated 128-bit hex hash. Pure. */
export function merkleHash(domain: string, input: string): string {
  return hex32(fnv1a32(`${domain}::${input}::a`, 0x811c9dc5)) + hex32(
    fnv1a32(`${domain}::${input}::b`, 0x9747b28c),
  );
}

export function leafHash(data: string): string {
  return merkleHash('leaf', data);
}

export function internalHash(left: string, right: string): string {
  return merkleHash('node', `${left}|${right}`);
}

export const EMPTY_TRIE_HASH = merkleHash('empty-trie', 'EMPTY');

/** Flip bit 0 of the last character (the single-bit data mutation). */
export function flipLastBit(data: string): string {
  if (data.length === 0) {
    return String.fromCharCode(1);
  }
  const chars = [...data];
  const last = chars[chars.length - 1] as string;
  chars[chars.length - 1] = String.fromCharCode(last.charCodeAt(0) ^ 1);
  return chars.join('');
}

/** Pad leaves to a power of two with empty-data sentinel leaves. */
function padLeaves(blocks: string[]): Array<{ data: string; hash: string }> {
  let size = 1;
  while (size < blocks.length) size <<= 1;
  const leaves: Array<{ data: string; hash: string }> = [];
  for (let i = 0; i < size; i++) {
    const data = blocks[i] ?? '';
    leaves.push({ data, hash: leafHash(data) });
  }
  return leaves;
}

export function buildMerkleTree(blocks: string[]): MerkleTreeState {
  const leaves = padLeaves(blocks.slice(0, 1024));
  const levels: string[][] = [leaves.map((l) => l.hash)];
  while (levels[levels.length - 1]!.length > 1) {
    const prev = levels[levels.length - 1] as string[];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(internalHash(prev[i] as string, prev[i + 1] as string));
    }
    levels.push(next);
  }
  return { leaves, levels, root: levels[levels.length - 1]![0] as string };
}

/** Recompute the root from leaf data (MERKLE-1 checker core). */
export function recomputeRoot(tree: MerkleTreeState): string {
  let level = tree.leaves.map((l) => leafHash(l.data));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(internalHash(level[i] as string, level[i + 1] as string));
    }
    level = next;
  }
  return level[0] as string;
}

/** Generate the sibling-hash proof path for one leaf. */
export function generateMerkleProof(tree: MerkleTreeState, leafIndex: number): MerkleProofStep[] {
  const proof: MerkleProofStep[] = [];
  let idx = leafIndex;
  for (let level = 0; level < tree.levels.length - 1; level++) {
    const siblingIdx = idx ^ 1;
    const siblingHash = (tree.levels[level] as string[])[siblingIdx] as string;
    proof.push({
      siblingHash,
      siblingSide: idx % 2 === 0 ? 'RIGHT' : 'LEFT',
    });
    idx = idx >>> 1;
  }
  return proof;
}

/**
 * Verify a proof: recompute the root from the leaf hash + sibling path.
 * Pure — used by reducer and invariant checker both.
 */
export function verifyMerkleProof(
  root: string,
  leafHashValue: string,
  proof: ReadonlyArray<MerkleProofStep>,
): boolean {
  let h = leafHashValue;
  for (const step of proof) {
    h = step.siblingSide === 'RIGHT' ? internalHash(h, step.siblingHash) : internalHash(step.siblingHash, h);
  }
  return h === root;
}

/**
 * Anti-entropy divergence walk between two replica trees.
 * Descends only where subtree hashes differ; every node comparison is
 * counted. This is the O(divergence * depth) mechanism Dynamo uses for
 * replica repair instead of a full record scan.
 */
export function antiEntropyWalk(
  a: MerkleTreeState,
  b: MerkleTreeState,
): MerkleAntiEntropyResult {
  const comparisons = { count: 0 };
  const divergentLeaves: number[] = [];
  const walkLog: string[] = [];

  const leafCount = Math.min(a.leaves.length, b.leaves.length);
  const maxLevel = a.levels.length - 1;

  const walk = (level: number, idx: number, label: string): void => {
    comparisons.count++;
    const ha = (a.levels[level] as string[])[idx] as string | undefined;
    const hb = (b.levels[level] as string[])[idx] as string | undefined;
    if (ha === undefined || hb === undefined) {
      return;
    }
    if (ha === hb) {
      walkLog.push(`cmp ${label}: equal — subtree pruned`);
      return;
    }
    if (level === 0) {
      walkLog.push(`cmp ${label}: DIVERGENT leaf (data differs)`);
      divergentLeaves.push(idx);
      return;
    }
    walkLog.push(`cmp ${label}: differs — descending`);
    const child = level - 1;
    walk(child, idx * 2, `${label}.L`);
    walk(child, idx * 2 + 1, `${label}.R`);
  };

  walk(maxLevel, 0, 'root');
  divergentLeaves.sort((x, y) => x - y);

  return {
    divergentLeaves,
    comparisons: comparisons.count,
    fullScanCost: leafCount,
    walkLog: walkLog.slice(0, 200),
  };
}

// ── Merkle-Patricia trie (radix-2 with extension compression) ──────────────

/** Fixed 32-bit key path. */
export function patKeyPath(key: string): string {
  return fnv1a32(`pat::${key}`, 0x811c9dc5).toString(2).padStart(32, '0');
}

export function patLeafHash(path: string, value: string): string {
  return merkleHash('pat-leaf', `${path}:${value}`);
}

export function patBranchHash(left: string | null, right: string | null): string {
  return merkleHash('pat-branch', `${left ?? '-'}|${right ?? '-'}`);
}

export function patExtensionHash(prefix: string, child: string): string {
  return merkleHash('pat-ext', `${prefix}:${child}`);
}

export function patNodeHash(node: PatTrieNode): string {
  switch (node.type) {
    case 'leaf':
      return patLeafHash(node.path, node.value);
    case 'branch':
      return patBranchHash(
        node.left ? patNodeHash(node.left) : null,
        node.right ? patNodeHash(node.right) : null,
      );
    case 'extension':
      return patExtensionHash(node.prefix, patNodeHash(node.child));
  }
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function cloneTrie(node: PatTrieNode): PatTrieNode {
  return JSON.parse(JSON.stringify(node)) as PatTrieNode;
}

/** Insert key/value; returns the new trie root (pure — clones first). */
export function patInsert(
  root: PatTrieNode | null,
  key: string,
  value: string,
): PatTrieNode {
  const path = patKeyPath(key);
  if (root === null) {
    return { type: 'leaf', path, value };
  }
  const node = cloneTrie(root);
  return insertInto(node, path, value);
}

function insertInto(node: PatTrieNode, path: string, value: string): PatTrieNode {
  if (node.type === 'leaf') {
    if (node.path === path) {
      // Duplicate key: update value in place.
      return { type: 'leaf', path, value };
    }
    const common = commonPrefixLength(node.path, path);
    // Both paths have equal length (fixed-width key paths), so a strict
    // common prefix guarantees both routing bits exist and differ.
    const oldLeaf: PatTrieNode = { type: 'leaf', path: node.path.slice(common + 1), value: node.value };
    const newLeaf: PatTrieNode = { type: 'leaf', path: path.slice(common + 1), value };
    return attachChildren(
      path.slice(0, common),
      node.path[common] as string,
      oldLeaf,
      path[common] as string,
      newLeaf,
    );
  }
  if (node.type === 'branch') {
    const bit = path[0] as '0' | '1';
    const rest = path.slice(1);
    const child = bit === '0' ? node.left : node.right;
    const newChild: PatTrieNode = child
      ? insertInto(cloneTrie(child), rest, value)
      : { type: 'leaf', path: rest, value };
    if (bit === '0') {
      return { type: 'branch', left: newChild, right: node.right };
    }
    return { type: 'branch', left: node.left, right: newChild };
  }
  // extension: prefix p, child consumes the rest
  const common = commonPrefixLength(node.prefix, path);
  if (common === node.prefix.length) {
    const newChild = insertInto(cloneTrie(node.child), path.slice(common), value);
    return { type: 'extension', prefix: node.prefix, child: newChild };
  }
  // Split the extension: shared prefix -> branch -> [old, new].
  const shared = node.prefix.slice(0, common);
  const restPrefix = node.prefix.slice(common + 1);
  const oldSubtree: PatTrieNode =
    restPrefix.length > 0 ? { type: 'extension', prefix: restPrefix, child: node.child } : cloneTrie(node.child);
  const newLeaf: PatTrieNode = { type: 'leaf', path: path.slice(common + 1), value };
  return attachChildren(
    shared,
    node.prefix[common] as string,
    oldSubtree,
    path[common] as string,
    newLeaf,
  );
}

/**
 * Attach two subtrees under a shared prefix: extension(shared) if
 * shared.length > 0, then a branch routing oldSubtree by oldBit and
 * newSubtree by newBit.
 */
function attachChildren(
  sharedPrefix: string,
  oldBit: string,
  oldSubtree: PatTrieNode,
  newBit: string,
  newSubtree: PatTrieNode,
): PatTrieNode {
  const branch: PatTrieNode =
    oldBit === '0'
      ? { type: 'branch', left: oldSubtree, right: newSubtree }
      : { type: 'branch', left: newSubtree, right: oldSubtree };
  void newBit;
  if (sharedPrefix.length === 0) {
    return branch;
  }
  return { type: 'extension', prefix: sharedPrefix, child: branch };
}

/** Look up a key's leaf (for proof generation). Returns the walk trail. */
export interface PatWalkResult {
  found: boolean;
  value: string | null;
  /** proof carrying chain + boundary */
  proof: PatProof;
}

export function patWalk(root: PatTrieNode | null, key: string): PatWalkResult {
  const keyPath = patKeyPath(key);
  const ancestors: PatProof['ancestors'] = [];
  let node = root;
  let consumed = 0;

  while (node !== null) {
    if (node.type === 'leaf') {
      const matched = node.path === keyPath.slice(consumed);
      const boundary: PatProofNode = { type: 'leaf', path: node.path, value: node.value };
      return {
        found: matched,
        value: matched ? node.value : null,
        proof: { key, keyPath, consumedBits: consumed, boundary, ancestors: [...ancestors] },
      };
    }
    if (node.type === 'branch') {
      const bit = (keyPath[consumed] ?? '0') as '0' | '1';
      const child = bit === '0' ? node.left : node.right;
      const boundary: PatProofNode = {
        type: 'branch',
        leftHash: node.left ? patNodeHash(node.left) : null,
        rightHash: node.right ? patNodeHash(node.right) : null,
      };
      if (child === null) {
        // Absent: no child in the needed direction.
        return {
          found: false,
          value: null,
          proof: { key, keyPath, consumedBits: consumed, boundary, ancestors: [...ancestors] },
        };
      }
      ancestors.unshift({ node: boundary, pathChildIndex: bit === '0' ? 0 : 1 });
      consumed += 1;
      node = child;
      continue;
    }
  // extension: the walk stops where the queried path diverges from the
  // stored prefix. consumedBits points BEFORE the extension (the proof
  // node carries the full prefix).
  const common = commonPrefixLength(node.prefix, keyPath.slice(consumed));
  const boundary: PatProofNode = {
    type: 'extension',
    prefix: node.prefix,
    childHash: patNodeHash(node.child),
  };
  if (common === node.prefix.length) {
    ancestors.unshift({ node: boundary, pathChildIndex: 0 });
    consumed += node.prefix.length;
    node = node.child;
    continue;
  }
  // Absent: the trie continues in a different direction.
  return {
    found: false,
    value: null,
    proof: { key, keyPath, consumedBits: consumed, boundary, ancestors: [...ancestors] },
  };
  }

  // Empty trie.
  return {
    found: false,
    value: null,
    proof: { key, keyPath, consumedBits: 0, boundary: null, ancestors: [] },
  };
}

function hashProofNode(node: PatProofNode): string {
  switch (node.type) {
    case 'leaf':
      return patLeafHash(node.path, node.value);
    case 'branch':
      return patBranchHash(node.leftHash, node.rightHash);
    case 'extension':
      return patExtensionHash(node.prefix, node.childHash);
  }
}

/**
 * Verify a patricia proof against a root hash: recompute the boundary
 * hash from content, plug the running hash into each ancestor's path
 * child slot, recompute upward, and compare against the root.
 */
export function verifyPatChain(rootHash: string, proof: PatProof): boolean {
  if (proof.boundary === null) {
    return rootHash === EMPTY_TRIE_HASH;
  }
  let h = hashProofNode(proof.boundary);
  for (const step of proof.ancestors) {
    if (step.node.type === 'branch') {
      const left = step.pathChildIndex === 0 ? h : step.node.leftHash;
      const right = step.pathChildIndex === 1 ? h : step.node.rightHash;
      h = patBranchHash(left, right);
    } else if (step.node.type === 'extension') {
      h = patExtensionHash(step.node.prefix, h);
    } else {
      // Leaf cannot be an ancestor.
      return false;
    }
  }
  return h === rootHash;
}

/**
 * Semantic check after chain validity:
 * - membership: boundary is a leaf whose path completes the queried path
 * - absence: boundary demonstrably incompatible with the queried path
 *   (different leaf path, null branch child, or diverging extension)
 */
export function checkPatSemantics(proof: PatProof): 'MEMBER' | 'ABSENT' | 'INVALID' {
  const { boundary, keyPath, consumedBits } = proof;
  if (boundary === null) {
    return 'ABSENT'; // empty trie: nothing exists
  }
  const remaining = keyPath.slice(consumedBits);
  if (boundary.type === 'leaf') {
    return boundary.path === remaining ? 'MEMBER' : 'ABSENT';
  }
  if (boundary.type === 'branch') {
    const bit = remaining[0];
    if (bit === undefined) {
      return 'INVALID';
    }
    const childHash = bit === '0' ? boundary.leftHash : boundary.rightHash;
    return childHash === null ? 'ABSENT' : 'INVALID';
  }
  // extension: valid absence iff the stored prefix diverges from the
  // queried path within the prefix's own length (either a differing bit
  // or the path running out inside the prefix).
  const common = commonPrefixLength(boundary.prefix, remaining);
  return common < boundary.prefix.length ? 'ABSENT' : 'INVALID';
}

/** Full verification: chain + semantics. */
export function verifyPatProof(
  rootHash: string,
  proof: PatProof,
  claim: 'MEMBERSHIP' | 'ABSENCE',
): { verified: boolean; value: string | null; note: string } {
  if (!verifyPatChain(rootHash, proof)) {
    return { verified: false, value: null, note: 'proof chain does not recompute to the root hash' };
  }
  const semantics = checkPatSemantics(proof);
  if (claim === 'MEMBERSHIP') {
    if (semantics === 'MEMBER') {
      const boundary = proof.boundary as { type: 'leaf'; path: string; value: string };
      return { verified: true, value: boundary.value, note: 'membership proven: leaf path completes the key path' };
    }
    return { verified: false, value: null, note: `chain valid but semantics=${semantics} — key is not present` };
  }
  if (semantics === 'ABSENT') {
    return { verified: true, value: null, note: 'absence proven: boundary node is incompatible with the key path' };
  }
  return {
    verified: false,
    value: null,
    note: `chain valid but semantics=${semantics} — this proof actually shows the key IS present`,
  };
}
