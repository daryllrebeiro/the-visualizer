import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  EMPTY_TRIE_HASH,
  buildMerkleTree,
  flipLastBit,
  generateMerkleProof,
  leafHash,
  patKeyPath,
  patNodeHash,
  patWalk,
  verifyMerkleProof,
} from './merkle-trees-algorithms.js';
import { MerkleTreesInvariantChecker } from './merkle-trees-invariants.js';
import {
  createDefaultMerkleTreesCluster,
  pureMerkleTreesTransition,
} from './merkle-trees-state-transitions.js';
import type { MerkleTreesClusterState } from './merkle-trees-types.js';

function ev<T extends { id: string; tick: number; type: string; payload: Record<string, unknown> }>(
  state: MerkleTreesClusterState,
  event: T,
  rng: DeterministicRNG,
): MerkleTreesClusterState {
  return pureMerkleTreesTransition(state, event as any, rng).nextState;
}

describe('Merkle Trees Domain Fidelity Test Suite', () => {
  it('MERKLE-1: flipping one bit in any leaf changes the root (property-tested over all 64 leaves)', () => {
    const rng = new DeterministicRNG(3);
    const blocks = Array.from({ length: 64 }, (_, i) => `blk-${i}-data-AAAA`);
    let state = createDefaultMerkleTreesCluster();
    state = ev(state, { id: 'b', tick: 1, type: 'MERKLE_BUILD', payload: { blocks } }, rng);

    for (let leafIndex = 0; leafIndex < 64; leafIndex++) {
      const flipped = ev(
        state,
        { id: `f-${leafIndex}`, tick: 2, type: 'MERKLE_FLIP_BIT', payload: { leafIndex } },
        rng,
      );
      expect(flipped.primary.root).not.toBe(state.primary.root);
    }

    const checker = new MerkleTreesInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('MERKLE-2: valid proof verifies against the correct root; tampered leaf, sibling, and root all fail', () => {
    const rng = new DeterministicRNG(5);
    let state = createDefaultMerkleTreesCluster();
    state = ev(
      state,
      { id: 'b', tick: 1, type: 'MERKLE_BUILD', payload: { blocks: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] } },
      rng,
    );

    const leafIndex = 5;
    const leaf = state.primary.leaves[leafIndex]!;
    const proof = generateMerkleProof(state.primary, leafIndex);

    // Positive direction: valid proof verifies.
    expect(verifyMerkleProof(state.primary.root, leaf.hash, proof)).toBe(true);
    expect(verifyMerkleProof(state.primary.root, leafHash(leaf.data), proof)).toBe(true);

    // Tampered leaf data: same proof, different data claim.
    expect(verifyMerkleProof(state.primary.root, leafHash(flipLastBit(leaf.data)), proof)).toBe(false);

    // Tampered sibling hash: one hex digit corrupted.
    const corruptedSibling = proof.map((step, i) =>
      i === 0 ? { ...step, siblingHash: `x${step.siblingHash.slice(1)}` } : step,
    );
    expect(verifyMerkleProof(state.primary.root, leaf.hash, corruptedSibling)).toBe(false);

    // Tampered root: proof valid but checked against the wrong root.
    const corruptedRoot = `x${state.primary.root.slice(1)}`;
    expect(verifyMerkleProof(corruptedRoot, leaf.hash, proof)).toBe(false);

    // Reducer-level: prove + each tamper mode fails.
    state = ev(state, { id: 'p', tick: 2, type: 'MERKLE_PROVE', payload: { leafIndex } }, rng);
    expect(state.lastProof?.verified).toBe(true);
    for (const part of ['LEAF_DATA', 'SIBLING_HASH', 'ROOT'] as const) {
      state = ev(
        state,
        { id: `t-${part}`, tick: 3, type: 'MERKLE_TAMPER_PROOF', payload: { leafIndex, part } },
        rng,
      );
      expect(state.lastTamper?.verified).toBe(false);
    }

    const checker = new MerkleTreesInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('MERKLE-3: divergence localized in O(divergence * depth) comparisons, not a full scan', () => {
    const rng = new DeterministicRNG(7);
    const blocks = Array.from({ length: 256 }, (_, i) => `blk-${i}-payload`);
    let state = createDefaultMerkleTreesCluster();
    state = ev(state, { id: 'b', tick: 1, type: 'MERKLE_BUILD', payload: { blocks } }, rng);

    // D=1: single divergent leaf.
    state = ev(state, { id: 'd1', tick: 2, type: 'MERKLE_DIVERGE', payload: { leafIndices: [173] } }, rng);
    state = ev(state, { id: 'ae1', tick: 3, type: 'MERKLE_ANTI_ENTROPY', payload: {} }, rng);
    expect(state.antiEntropy?.divergentLeaves).toEqual([173]);
    // 2*log2(256) + 4 = 20 bound; walk uses ~17.
    expect(state.antiEntropy?.comparisons).toBeLessThanOrEqual(20);
    expect(state.antiEntropy?.comparisons).toBeLessThan(state.antiEntropy?.fullScanCost ?? 256);

    // D=8 (clustered): still far below full scan.
    state = ev(
      state,
      { id: 'd8', tick: 4, type: 'MERKLE_DIVERGE', payload: { leafIndices: [8, 9, 10, 11, 12, 13, 14, 15] } },
      rng,
    );
    state = ev(state, { id: 'ae8', tick: 5, type: 'MERKLE_ANTI_ENTROPY', payload: {} }, rng);
    expect(state.antiEntropy?.divergentLeaves).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    // 2*log2(256) + 4*8 = 48 bound for clustered divergence.
    expect(state.antiEntropy?.comparisons).toBeLessThanOrEqual(48);
    expect(state.antiEntropy?.comparisons).toBeLessThan(state.antiEntropy?.fullScanCost ?? 256);

    const checker = new MerkleTreesInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('MERKLE-3: invariant checker catches a fabricated divergence report and an over-budget walk', () => {
    const rng = new DeterministicRNG(11);
    const blocks = Array.from({ length: 64 }, (_, i) => `blk-${i}-x`);
    let state = createDefaultMerkleTreesCluster();
    state = ev(state, { id: 'b', tick: 1, type: 'MERKLE_BUILD', payload: { blocks } }, rng);
    state = ev(state, { id: 'd', tick: 2, type: 'MERKLE_DIVERGE', payload: { leafIndices: [9] } }, rng);
    state = ev(state, { id: 'ae', tick: 3, type: 'MERKLE_ANTI_ENTROPY', payload: {} }, rng);

    // Fabricated report: wrong divergent leaves.
    const tampered = JSON.parse(JSON.stringify(state)) as MerkleTreesClusterState;
    tampered.antiEntropy!.divergentLeaves = [10];
    const checker = new MerkleTreesInvariantChecker();
    const v1 = checker.check(tampered);
    expect(v1).toBeDefined();
    expect(v1?.ruleId).toBe('MERKLE-3');

    // Over-budget walk: comparisons exceeding the divergence bound.
    const tampered2 = JSON.parse(JSON.stringify(state)) as MerkleTreesClusterState;
    tampered2.antiEntropy!.comparisons = 10_000;
    const v2 = checker.check(tampered2);
    expect(v2).toBeDefined();
    expect(v2?.ruleId).toBe('MERKLE-3');
  });

  it('MERKLE-4: membership and non-membership proofs both verify; forged absence is rejected', () => {
    const rng = new DeterministicRNG(13);
    let state = createDefaultMerkleTreesCluster();

    const pairs: Array<[string, string]> = [
      ['account-alice', 'balance-100'],
      ['account-bob', 'balance-250'],
      ['account-carol', 'balance-75'],
      ['tx-0001', 'sent-10'],
      ['tx-0002', 'sent-42'],
    ];
    for (const [key, value] of pairs) {
      state = ev(state, { id: `pi-${key}`, tick: state.tick + 1, type: 'MERKLE_PAT_INSERT', payload: { key, value } }, rng);
    }
    expect(state.patricia.keyCount).toBe(5);

    // Membership proofs verify for every present key.
    for (const [key, value] of pairs) {
      state = ev(
        state,
        { id: `pm-${key}`, tick: state.tick + 1, type: 'MERKLE_PAT_PROVE_MEMBERSHIP', payload: { key } },
        rng,
      );
      expect(state.lastPatProof?.verified).toBe(true);
      expect(state.lastPatProof?.value).toBe(value);
    }

    // Absence proofs verify for genuinely absent keys (leaf divergence,
    // null branch child, extension divergence, and empty-trie cases are
    // exercised by key variety).
    for (const key of ['account-dave', 'tx-9999', 'zzz-never-inserted', 'aaa-also-absent']) {
      state = ev(
        state,
        { id: `pa-${key}`, tick: state.tick + 1, type: 'MERKLE_PAT_PROVE_ABSENCE', payload: { key } },
        rng,
      );
      expect(state.lastPatProof?.verified).toBe(true);
      expect(state.lastPatProof?.value).toBeNull();
    }

    // MERKLE-4 attack: forged absence for a PRESENT key must be rejected.
    state = ev(
      state,
      { id: 'forge', tick: state.tick + 1, type: 'MERKLE_PAT_FORGE_ABSENCE', payload: { key: 'account-bob' } },
      rng,
    );
    expect(state.lastPatProof?.claim).toBe('FORGED_ABSENCE');
    expect(state.lastPatProof?.verified).toBe(false);
    expect(state.lastPatProof?.note).toContain('rejected');

    const checker = new MerkleTreesInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('MERKLE-4: absence proof on an empty trie verifies (the null boundary case)', () => {
    const rng = new DeterministicRNG(17);
    let state = createDefaultMerkleTreesCluster();
    state = ev(
      state,
      { id: 'pa-empty', tick: 1, type: 'MERKLE_PAT_PROVE_ABSENCE', payload: { key: 'anything' } },
      rng,
    );
    expect(state.lastPatProof?.verified).toBe(true);
  });

  it('MERKLE-4: patricia inserts produce distinct key paths and walkable tries at scale', () => {
    const rng = new DeterministicRNG(19);
    let state = createDefaultMerkleTreesCluster();
    const keys = Array.from({ length: 64 }, (_, i) => `scale-key-${i}`);
    for (const key of keys) {
      state = ev(state, { id: `i-${key}`, tick: state.tick + 1, type: 'MERKLE_PAT_INSERT', payload: { key, value: `v-${key}` } }, rng);
    }
    expect(state.patricia.keyCount).toBe(64);

    // All key paths distinct (32-bit paths; birthday bound safe at 64 keys).
    const paths = new Set(keys.map((k) => patKeyPath(k)));
    expect(paths.size).toBe(64);

    // Every present key's walk finds its value; the root hash is stable.
    for (const key of keys) {
      const w = patWalk(state.patricia.root, key);
      expect(w.found).toBe(true);
      expect(w.value).toBe(`v-${key}`);
    }
    expect(state.patricia.rootHash).toBe(patNodeHash(state.patricia.root!));

    // Random absent keys fail the walk.
    for (let i = 0; i < 20; i++) {
      const w = patWalk(state.patricia.root, `absent-${rng.nextInt(0, 1_000_000)}`);
      expect(w.found).toBe(false);
    }
  });

  it('MERKLE-1: invariant checker catches data-vs-root drift (constructed bug state)', () => {
    const rng = new DeterministicRNG(23);
    let state = createDefaultMerkleTreesCluster();
    state = ev(
      state,
      { id: 'b', tick: 1, type: 'MERKLE_BUILD', payload: { blocks: ['x1', 'x2', 'x3', 'x4'] } },
      rng,
    );

    // Simulate a reducer bug: leaf data mutated without rebuilding the tree.
    const tampered = JSON.parse(JSON.stringify(state)) as MerkleTreesClusterState;
    tampered.primary.leaves[2]!.data = 'tampered-without-rebuild';
    const checker = new MerkleTreesInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('MERKLE-1');
    expect(violation?.description).toContain('recomputed');
  });

  it('MERKLE-2: invariant checker catches a forged-acceptance tamper record', () => {
    const rng = new DeterministicRNG(29);
    let state = createDefaultMerkleTreesCluster();
    state = ev(
      state,
      { id: 'b', tick: 1, type: 'MERKLE_BUILD', payload: { blocks: ['y1', 'y2', 'y3', 'y4'] } },
      rng,
    );
    state = ev(state, { id: 'p', tick: 2, type: 'MERKLE_PROVE', payload: { leafIndex: 1 } }, rng);

    const tampered = JSON.parse(JSON.stringify(state)) as MerkleTreesClusterState;
    tampered.lastTamper = { leafIndex: 1, part: 'SIBLING_HASH', verified: true };
    const checker = new MerkleTreesInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('MERKLE-2');
    expect(violation?.description).toContain('accepted');
  });

  it('build/pad semantics: non-power-of-two block counts pad with empty sentinel leaves', () => {
    const tree = buildMerkleTree(['a', 'b', 'c']);
    expect(tree.leaves.length).toBe(4);
    expect(tree.leaves[3]!.data).toBe('');
    expect(tree.levels[tree.levels.length - 1]!.length).toBe(1);
    // The empty leaf's hash is domain-separated from the trie sentinel.
    expect(tree.leaves[3]!.hash).not.toBe(EMPTY_TRIE_HASH);
    // Distinct data always hashes distinctly.
    expect(leafHash('a')).not.toBe(leafHash('b'));
  });

  it('golden determinism: identical event sequences with identical seeds produce identical state', () => {
    const runChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultMerkleTreesCluster();
      const blocks = Array.from({ length: 16 }, (_, i) => `golden-${i}`);
      state = ev(state, { id: 'b', tick: 1, type: 'MERKLE_BUILD', payload: { blocks } }, rng);
      state = ev(state, { id: 'f', tick: 2, type: 'MERKLE_FLIP_BIT', payload: { leafIndex: 7 } }, rng);
      state = ev(state, { id: 'p', tick: 3, type: 'MERKLE_PROVE', payload: { leafIndex: 7 } }, rng);
      state = ev(state, { id: 't', tick: 4, type: 'MERKLE_TAMPER_PROOF', payload: { leafIndex: 7, part: 'SIBLING_HASH' } }, rng);
      state = ev(state, { id: 'd', tick: 5, type: 'MERKLE_DIVERGE', payload: { leafIndices: [3, 11] } }, rng);
      state = ev(state, { id: 'ae', tick: 6, type: 'MERKLE_ANTI_ENTROPY', payload: {} }, rng);
      state = ev(state, { id: 'pi', tick: 7, type: 'MERKLE_PAT_INSERT', payload: { key: 'gk1', value: 'gv1' } }, rng);
      state = ev(state, { id: 'pi2', tick: 8, type: 'MERKLE_PAT_INSERT', payload: { key: 'gk2', value: 'gv2' } }, rng);
      state = ev(state, { id: 'pm', tick: 9, type: 'MERKLE_PAT_PROVE_MEMBERSHIP', payload: { key: 'gk1' } }, rng);
      state = ev(state, { id: 'pa', tick: 10, type: 'MERKLE_PAT_PROVE_ABSENCE', payload: { key: 'gk3' } }, rng);
      state = ev(state, { id: 'pf', tick: 11, type: 'MERKLE_PAT_FORGE_ABSENCE', payload: { key: 'gk2' } }, rng);
      return JSON.stringify(state);
    };
    expect(runChaos()).toBe(runChaos());
  });
});
