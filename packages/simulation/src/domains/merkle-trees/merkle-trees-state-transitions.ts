import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  EMPTY_TRIE_HASH,
  antiEntropyWalk,
  buildMerkleTree,
  flipLastBit,
  generateMerkleProof,
  internalHash,
  leafHash,
  patInsert,
  patNodeHash,
  patWalk,
  verifyMerkleProof,
  verifyPatProof,
} from './merkle-trees-algorithms.js';
import {
  MERKLE_CAPS,
  type MerkleTreesClusterState,
  type MerkleTreesSimEvent,
} from './merkle-trees-types.js';

const DEFAULT_BLOCKS = ['blk-0-alpha', 'blk-1-beta', 'blk-2-gamma', 'blk-3-delta'];

export function createDefaultMerkleTreesCluster(
  clusterId = 'merkle-trees-1',
): MerkleTreesClusterState {
  const primary = buildMerkleTree(DEFAULT_BLOCKS);
  const replica = buildMerkleTree(DEFAULT_BLOCKS);
  return {
    clusterId,
    tick: 0,
    primary,
    replica,
    lastProof: null,
    lastTamper: null,
    lastFlip: null,
    antiEntropy: null,
    patricia: { root: null, rootHash: EMPTY_TRIE_HASH, keyCount: 0 },
    lastPatProof: null,
    hashComputations: 0,
  };
}

function corruptHexChar(hex: string): string {
  const chars = [...hex];
  const last = chars[chars.length - 1] as string;
  const lastVal = parseInt(last, 16);
  chars[chars.length - 1] = ((lastVal + 1) % 16).toString(16);
  return chars.join('');
}

export function pureMerkleTreesTransition(
  state: MerkleTreesClusterState,
  event: MerkleTreesSimEvent,
  rng: DeterministicRNG,
): { nextState: MerkleTreesClusterState; emittedEvents: MerkleTreesSimEvent[] } {
  const nextState: MerkleTreesClusterState = JSON.parse(
    JSON.stringify(state),
  ) as MerkleTreesClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'MERKLE_BUILD': {
      const blocks = event.payload.blocks.slice(0, MERKLE_CAPS.maxBlocksPerBuild);
      if (blocks.length === 0) break;
      nextState.primary = buildMerkleTree(blocks);
      nextState.replica = buildMerkleTree(blocks);
      nextState.hashComputations += nextState.primary.leaves.length * 2 + 32;
      break;
    }

    case 'MERKLE_FLIP_BIT': {
      const idx = event.payload.leafIndex;
      const leaf = nextState.primary.leaves[idx];
      if (!leaf) break;
      const rootBefore = nextState.primary.root;
      leaf.data = flipLastBit(leaf.data);
      leaf.hash = leafHash(leaf.data);
      // Rebuild levels bottom-up.
      const levels: string[][] = [nextState.primary.leaves.map((l) => l.hash)];
      while (levels[levels.length - 1]!.length > 1) {
        const prev = levels[levels.length - 1] as string[];
        const next: string[] = [];
        for (let i = 0; i < prev.length; i += 2) {
          next.push(internalHash(prev[i] as string, prev[i + 1] as string));
        }
        levels.push(next);
      }
      nextState.primary.levels = levels;
      nextState.primary.root = levels[levels.length - 1]![0] as string;
      nextState.hashComputations += levels.length;
      nextState.lastFlip = {
        leafIndex: idx,
        rootBefore,
        rootAfter: nextState.primary.root,
      };
      break;
    }

    case 'MERKLE_PROVE': {
      const idx = event.payload.leafIndex;
      const leaf = nextState.primary.leaves[idx];
      if (!leaf) break;
      const proof = generateMerkleProof(nextState.primary, idx);
      const verified = verifyMerkleProof(nextState.primary.root, leaf.hash, proof);
      nextState.lastProof = { leafIndex: idx, leafData: leaf.data, proof, verified };
      break;
    }

    case 'MERKLE_TAMPER_PROOF': {
      const idx = event.payload.leafIndex;
      const part = event.payload.part;
      const leaf = nextState.primary.leaves[idx];
      if (!leaf || !nextState.lastProof || nextState.lastProof.leafIndex !== idx) {
        // Tamper requires a proof generated first for the same leaf.
        break;
      }
      const proof = nextState.lastProof.proof;
      let verified: boolean;
      if (part === 'LEAF_DATA') {
        // Claim the leaf holds different data than it does.
        verified = verifyMerkleProof(nextState.primary.root, leafHash(flipLastBit(leaf.data)), proof);
      } else if (part === 'SIBLING_HASH') {
        const corrupted = proof.map((step, i) =>
          i === 0 ? { ...step, siblingHash: corruptHexChar(step.siblingHash) } : step,
        );
        verified = verifyMerkleProof(nextState.primary.root, leaf.hash, corrupted);
      } else {
        // Verify against a corrupted root.
        verified = verifyMerkleProof(corruptHexChar(nextState.primary.root), leaf.hash, proof);
      }
      nextState.lastTamper = { leafIndex: idx, part, verified };
      break;
    }

    case 'MERKLE_DIVERGE': {
      const indices = event.payload.leafIndices
        .filter((i) => nextState.primary.leaves[i] !== undefined)
        .slice(0, MERKLE_CAPS.maxDivergentLeaves);
      if (indices.length === 0) break;
      // Divergence is always relative to the primary's CURRENT data:
      // the replica is rebuilt from primary leaves with only the new
      // divergence applied (previous drift is replaced, not accumulated).
      const blocks = nextState.primary.leaves.map((l, i) =>
        indices.includes(i) ? `${l.data}#diverged` : l.data,
      );
      nextState.replica = buildMerkleTree(blocks);
      break;
    }

    case 'MERKLE_ANTI_ENTROPY': {
      nextState.antiEntropy = antiEntropyWalk(nextState.primary, nextState.replica);
      break;
    }

    case 'MERKLE_PAT_INSERT': {
      if (nextState.patricia.keyCount >= MERKLE_CAPS.maxPatKeys) break;
      const { key, value } = event.payload;
      // Distinct-key tracking: walk before insert to detect updates.
      const before = patWalk(nextState.patricia.root, key);
      nextState.patricia.root = patInsert(nextState.patricia.root, key, value);
      nextState.patricia.rootHash = patNodeHash(nextState.patricia.root);
      if (!before.found) {
        nextState.patricia.keyCount += 1;
      }
      break;
    }

    case 'MERKLE_PAT_PROVE_MEMBERSHIP': {
      const key = event.payload.key;
      const walkResult = patWalk(nextState.patricia.root, key);
      const result = verifyPatProof(nextState.patricia.rootHash, walkResult.proof, 'MEMBERSHIP');
      nextState.lastPatProof = {
        key,
        claim: 'MEMBERSHIP',
        verified: result.verified,
        value: result.value,
        note: result.note,
      };
      break;
    }

    case 'MERKLE_PAT_PROVE_ABSENCE': {
      const key = event.payload.key;
      const walkResult = patWalk(nextState.patricia.root, key);
      const result = verifyPatProof(nextState.patricia.rootHash, walkResult.proof, 'ABSENCE');
      nextState.lastPatProof = {
        key,
        claim: 'ABSENCE',
        verified: result.verified,
        value: result.value,
        note: result.note,
      };
      break;
    }

    case 'MERKLE_PAT_FORGE_ABSENCE': {
      // MERKLE-4 attack: present a real proof chain for a PRESENT key
      // and claim absence. Verification must reject.
      const key = event.payload.key;
      const walkResult = patWalk(nextState.patricia.root, key);
      if (!walkResult.found) {
        nextState.lastPatProof = {
          key,
          claim: 'FORGED_ABSENCE',
          verified: false,
          value: null,
          note: 'forge target key is absent — nothing to attack',
        };
        break;
      }
      const result = verifyPatProof(nextState.patricia.rootHash, walkResult.proof, 'ABSENCE');
      nextState.lastPatProof = {
        key,
        claim: 'FORGED_ABSENCE',
        verified: result.verified,
        value: result.value,
        note: result.verified
          ? 'REGRESSION: forged absence proof accepted for a present key'
          : 'forged absence proof rejected — the chain shows the key IS present',
      };
      break;
    }

    case 'TICK' as any:
    case 'MERKLE_TICK': {
      void rng.nextFloat();
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
