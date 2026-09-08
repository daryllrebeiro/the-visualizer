/**
 * Merkle Trees & Distributed Verification — simulation types.
 *
 * References:
 * - Merkle (1979): Secrecy, Authentication, and Public Key Systems;
 *   Merkle (1987) CRYPTO '87 — bottom-up tree-hash construction
 * - DeCandia et al. (2007): Dynamo (SOSP '07) — anti-entropy Merkle
 *   comparison for replica repair
 * - Git object model — content-addressed tree hashing
 * - Ethereum Merkle-Patricia trie — prefix trie + Merkle hashing,
 *   membership AND non-membership proofs
 *
 * Hash: SHA-like deterministic stub (128-bit hex from two independent
 * avalanche-mixed FNV streams, domain-separated leaf/internal/patricia
 * nodes). Pure integer arithmetic; never identity.
 */

export interface MerkleTreeState {
  /** data blocks; length padded to a power of two for the binary tree */
  leaves: Array<{ data: string; hash: string }>;
  /**
   * level hash arrays: levels[0] = leaf hashes, levels[i] = parents of
   * levels[i-1]; levels[last] = [root]
   */
  levels: string[][];
  root: string;
}

export interface MerkleProofStep {
  /** sibling hash at this level */
  siblingHash: string;
  /** which side the sibling sits on relative to the path */
  siblingSide: 'LEFT' | 'RIGHT';
}

export interface MerkleAntiEntropyResult {
  /** leaf indices where primary and replica data diverge */
  divergentLeaves: number[];
  /** hash comparisons actually performed (instrumented) */
  comparisons: number;
  /** cost of the naive full leaf-by-leaf scan (for the comparison display) */
  fullScanCost: number;
  /** human-readable walk log for the divergence visualization */
  walkLog: string[];
}

/** Simplified Merkle-Patricia trie over fixed 32-bit key paths. */
export type PatTrieNode =
  | { type: 'leaf'; path: string; value: string }
  | { type: 'branch'; left: PatTrieNode | null; right: PatTrieNode | null }
  | { type: 'extension'; prefix: string; child: PatTrieNode };

export interface PatriciaTrieState {
  root: PatTrieNode | null;
  /** cached root hash (recomputed on every mutation) */
  rootHash: string;
  keyCount: number;
}

/** Self-contained proof node (hashes for non-path children included). */
export type PatProofNode =
  | { type: 'leaf'; path: string; value: string }
  | { type: 'branch'; leftHash: string | null; rightHash: string | null }
  | { type: 'extension'; prefix: string; childHash: string };

export interface PatProof {
  key: string;
  /** 32-bit binary path of the queried key */
  keyPath: string;
  /** path bits consumed before reaching the boundary node */
  consumedBits: number;
  /** boundary node content (null = empty trie proof) */
  boundary: PatProofNode | null;
  /** parent chain bottom-up; pathChildIndex is where the running hash plugs in */
  ancestors: Array<{ node: PatProofNode; pathChildIndex: 0 | 1 }>;
}

export interface MerkleTreesClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  primary: MerkleTreeState;
  replica: MerkleTreeState;
  /** last generated proof and its verification result */
  lastProof: {
    leafIndex: number;
    leafData: string;
    proof: MerkleProofStep[];
    verified: boolean;
  } | null;
  /** last tamper experiment: which part was corrupted, verification must fail */
  lastTamper: {
    leafIndex: number;
    part: 'LEAF_DATA' | 'SIBLING_HASH' | 'ROOT';
    verified: boolean;
  } | null;
  /** last bit-flip experiment with before/after roots (MERKLE-1) */
  lastFlip: {
    leafIndex: number;
    rootBefore: string;
    rootAfter: string;
  } | null;
  antiEntropy: MerkleAntiEntropyResult | null;
  patricia: PatriciaTrieState;
  /** last patricia proof experiment */
  lastPatProof: {
    key: string;
    claim: 'MEMBERSHIP' | 'ABSENCE' | 'FORGED_ABSENCE';
    verified: boolean;
    value: string | null;
    note: string;
  } | null;
  /** instrumented hash computations (MERKLE-3 powers the comparison counter) */
  hashComputations: number;
}

export type MerkleTreesSimEvent =
  | { id: string; tick: number; type: 'MERKLE_TICK'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: 'MERKLE_BUILD'; payload: { blocks: string[] } }
  | { id: string; tick: number; type: 'MERKLE_FLIP_BIT'; payload: { leafIndex: number } }
  | { id: string; tick: number; type: 'MERKLE_PROVE'; payload: { leafIndex: number } }
  | {
      id: string;
      tick: number;
      type: 'MERKLE_TAMPER_PROOF';
      payload: { leafIndex: number; part: 'LEAF_DATA' | 'SIBLING_HASH' | 'ROOT' };
    }
  | { id: string; tick: number; type: 'MERKLE_DIVERGE'; payload: { leafIndices: number[] } }
  | { id: string; tick: number; type: 'MERKLE_ANTI_ENTROPY'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: 'MERKLE_PAT_INSERT'; payload: { key: string; value: string } }
  | { id: string; tick: number; type: 'MERKLE_PAT_PROVE_MEMBERSHIP'; payload: { key: string } }
  | { id: string; tick: number; type: 'MERKLE_PAT_PROVE_ABSENCE'; payload: { key: string } }
  | { id: string; tick: number; type: 'MERKLE_PAT_FORGE_ABSENCE'; payload: { key: string } };

/** Resource caps (hard-clamped; surfaced in UI when hit). */
export const MERKLE_CAPS = {
  maxLeaves: 1_024,
  maxBlocksPerBuild: 1_024,
  maxDivergentLeaves: 128,
  maxPatKeys: 256,
  maxProofSteps: 16,
} as const;
