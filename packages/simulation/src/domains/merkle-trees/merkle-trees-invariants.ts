import {
  checkPatSemantics,
  merkleHash,
  patNodeHash,
  patWalk,
  recomputeRoot,
  verifyMerkleProof,
  verifyPatProof,
} from './merkle-trees-algorithms.js';
import { leafHash } from './merkle-trees-algorithms.js';
import type { MerkleTreesClusterState } from './merkle-trees-types.js';

export interface MerkleTreesInvariantViolation {
  ruleId: 'MERKLE-1' | 'MERKLE-2' | 'MERKLE-3' | 'MERKLE-4';
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

const EMPTY_TRIE_HASH = merkleHash('empty-trie', 'EMPTY');

/**
 * State-level checks for the merkle-trees domain.
 *
 * MERKLE-1: recomputed root from leaf data must equal the stored root on
 * both replicas — no data change can hide from the root hash.
 * MERKLE-2: the stored last proof must verify against the recomputed
 * root; the last tamper experiment must have failed.
 * MERKLE-3: anti-entropy comparisons bounded by divergence * depth, and
 * strictly cheaper than a full leaf scan when divergence is sparse.
 * MERKLE-4: the patricia root hash must equal the recomputed trie hash,
 * and the last proof experiment's verification must be consistent with
 * an independent re-verification.
 */
export class MerkleTreesInvariantChecker {
  public check(state: MerkleTreesClusterState): MerkleTreesInvariantViolation | undefined {
    // MERKLE-1: root hash sensitivity on both replicas.
    const primaryRoot = recomputeRoot(state.primary);
    if (primaryRoot !== state.primary.root) {
      return {
        ruleId: 'MERKLE-1',
        invariantName: 'Root Hash Sensitivity',
        description: `Primary root ${state.primary.root} does not match the root recomputed from leaf data (${primaryRoot}) — a data change left the root unchanged`,
        affectedEntities: ['primary'],
      };
    }
    const replicaRoot = recomputeRoot(state.replica);
    if (replicaRoot !== state.replica.root) {
      return {
        ruleId: 'MERKLE-1',
        invariantName: 'Root Hash Sensitivity',
        description: `Replica root ${state.replica.root} does not match the root recomputed from leaf data (${replicaRoot})`,
        affectedEntities: ['replica'],
      };
    }

    // MERKLE-1 (flip record): a recorded bit flip must have changed the root.
    if (state.lastFlip && state.lastFlip.rootBefore === state.lastFlip.rootAfter) {
      return {
        ruleId: 'MERKLE-1',
        invariantName: 'Root Hash Sensitivity',
        description: `Bit flip in leaf ${state.lastFlip.leafIndex} left the root hash unchanged — hash collision path`,
        affectedEntities: [`leaf:${state.lastFlip.leafIndex}`],
      };
    }

    // MERKLE-2: stored proof must verify; tamper must fail.
    if (state.lastProof) {
      const leaf = state.primary.leaves[state.lastProof.leafIndex];
      if (leaf) {
        const recomputed = verifyMerkleProof(primaryRoot, leafHash(leaf.data), state.lastProof.proof);
        if (!recomputed || !state.lastProof.verified) {
          return {
            ruleId: 'MERKLE-2',
            invariantName: 'Proof Verification Soundness',
            description: `Stored proof for leaf ${state.lastProof.leafIndex} failed re-verification against the recomputed root`,
            affectedEntities: [`leaf:${state.lastProof.leafIndex}`],
          };
        }
      }
    }
    if (state.lastTamper && state.lastTamper.verified) {
      return {
        ruleId: 'MERKLE-2',
        invariantName: 'Proof Verification Soundness',
        description: `Tampered proof (${state.lastTamper.part}) was accepted — verification is not sound`,
        affectedEntities: [`leaf:${state.lastTamper.leafIndex}`, state.lastTamper.part],
      };
    }

    // MERKLE-3: anti-entropy localization bounds.
    if (state.antiEntropy) {
      const ae = state.antiEntropy;
      const leafCount = state.primary.leaves.length;
      const depth = Math.max(1, Math.ceil(Math.log2(Math.max(2, leafCount))));
      const d = Math.max(1, ae.divergentLeaves.length);
      // General bound: visited nodes <= 1 + 2 * (differing internal nodes)
      // and differing internals <= D * depth.
      const bound = 1 + 2 * d * depth;
      if (ae.comparisons > bound) {
        return {
          ruleId: 'MERKLE-3',
          invariantName: 'Anti-Entropy Divergence Localization',
          description: `Anti-entropy walk used ${ae.comparisons} comparisons, exceeding divergence bound ${bound} (D=${ae.divergentLeaves.length}, depth=${depth})`,
          affectedEntities: ['primary', 'replica'],
        };
      }
      if (ae.divergentLeaves.length <= Math.floor(leafCount / 8) && ae.comparisons >= ae.fullScanCost) {
        return {
          ruleId: 'MERKLE-3',
          invariantName: 'Anti-Entropy Divergence Localization',
          description: `Sparse divergence (D=${ae.divergentLeaves.length}) required ${ae.comparisons} comparisons — not cheaper than the full scan (${ae.fullScanCost})`,
          affectedEntities: ['primary', 'replica'],
        };
      }
      // Divergent leaves must be exactly the leaves whose data differs.
      const expectedDivergent: number[] = [];
      for (let i = 0; i < Math.min(state.primary.leaves.length, state.replica.leaves.length); i++) {
        if (state.primary.leaves[i]!.data !== state.replica.leaves[i]!.data) {
          expectedDivergent.push(i);
        }
      }
      if (JSON.stringify(expectedDivergent) !== JSON.stringify(ae.divergentLeaves)) {
        return {
          ruleId: 'MERKLE-3',
          invariantName: 'Anti-Entropy Divergence Localization',
          description: `Walk reported divergent leaves [${ae.divergentLeaves.join(',')}] but actual data divergence is [${expectedDivergent.join(',')}]`,
          affectedEntities: ['primary', 'replica'],
        };
      }
    }

    // MERKLE-4: patricia root hash and proof consistency.
    if (state.patricia.root === null) {
      if (state.patricia.rootHash !== EMPTY_TRIE_HASH || state.patricia.keyCount !== 0) {
        return {
          ruleId: 'MERKLE-4',
          invariantName: 'Patricia Trie Root Consistency',
          description: 'Empty trie must hash to the empty-trie sentinel with keyCount 0',
          affectedEntities: ['patricia'],
        };
      }
    } else {
      const recomputedPatRoot = patNodeHash(state.patricia.root);
      if (recomputedPatRoot !== state.patricia.rootHash) {
        return {
          ruleId: 'MERKLE-4',
          invariantName: 'Patricia Trie Root Consistency',
          description: `Patricia root hash ${state.patricia.rootHash} does not match the trie's recomputed hash ${recomputedPatRoot}`,
          affectedEntities: ['patricia'],
        };
      }
    }
    if (state.lastPatProof) {
      // Independent re-verification of the recorded claim.
      const walkAgain = patWalk(state.patricia.root, state.lastPatProof.key);
      const claim =
        state.lastPatProof.claim === 'ABSENCE' || state.lastPatProof.claim === 'FORGED_ABSENCE'
          ? 'ABSENCE'
          : 'MEMBERSHIP';
      const expected = verifyPatProof(state.patricia.rootHash, walkAgain.proof, claim);
      if (state.lastPatProof.verified !== expected.verified) {
        return {
          ruleId: 'MERKLE-4',
          invariantName: 'Patricia Proof Soundness',
          description: `Recorded ${state.lastPatProof.claim} verdict ${state.lastPatProof.verified} for key ${state.lastPatProof.key} disagrees with independent re-verification (${expected.verified})`,
          affectedEntities: ['patricia', state.lastPatProof.key],
        };
      }
      // A forged absence claim on a present key must never verify.
      if (state.lastPatProof.claim === 'FORGED_ABSENCE' && state.lastPatProof.verified) {
        return {
          ruleId: 'MERKLE-4',
          invariantName: 'Patricia Proof-of-Non-Membership Soundness',
          description: `Forged absence proof ACCEPTED for present key ${state.lastPatProof.key} — the distinguishing capability of the Patricia variant is broken`,
          affectedEntities: ['patricia', state.lastPatProof.key],
        };
      }
    }

    return undefined;
  }
}

export { checkPatSemantics };
