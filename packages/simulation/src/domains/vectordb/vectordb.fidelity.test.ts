import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { VectorDBInvariantChecker } from './vectordb-invariants.js';
import {
  createDefaultVectorDBCluster,
  pureVectorDBTransition,
} from './vectordb-state-transitions.js';
import type { VectorDBClusterState } from './vectordb-types.js';

describe('Domain 12: Vector Database & HNSW / IVF-PQ Fidelity', () => {
  const rng = new DeterministicRNG(303);
  const checker = new VectorDBInvariantChecker();

  it('VEC-1 & VEC-2: maintains HNSW layer subsumption and bounded degree', () => {
    let state = createDefaultVectorDBCluster();
    expect(checker.check(state)).toBeNull();

    // Insert new node at layer 2
    state = pureVectorDBTransition(
      state,
      {
        id: 'ins-1',
        tick: 1,
        type: 'VEC_INSERT_VECTOR',
        payload: {
          nodeId: 'vec-new',
          vector: [0.12, 0.22, 0.32, 0.42],
          topLayer: 2,
        },
      },
      rng,
    ).nextState;

    expect(state.hnswGraph.nodes['vec-new']?.neighborsByLayer[0]).toBeDefined();
    expect(state.hnswGraph.nodes['vec-new']?.neighborsByLayer[1]).toBeDefined();
    expect(state.hnswGraph.nodes['vec-new']?.neighborsByLayer[2]).toBeDefined();
    expect(checker.check(state)).toBeNull();

    // Test VEC-1 violation: simulate layer hole
    const layerHoleState: VectorDBClusterState = JSON.parse(
      JSON.stringify(state),
    ) as VectorDBClusterState;
    delete (layerHoleState.hnswGraph.nodes['vec-new']!.neighborsByLayer as any)[1];
    let violation = checker.check(layerHoleState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('VEC-1');

    // Test VEC-2 violation: simulate degree explosion
    const degreeExplodedState: VectorDBClusterState = JSON.parse(
      JSON.stringify(state),
    ) as VectorDBClusterState;
    degreeExplodedState.hnswGraph.nodes['vec-new']!.neighborsByLayer[1] = [
      'n1',
      'n2',
      'n3',
      'n4',
      'n5',
      'n6',
    ]; // M is 4
    violation = checker.check(degreeExplodedState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('VEC-2');
  });

  it('VEC-3 & VEC-4: verifies distance identity and PQ quantization bounds', () => {
    const state = createDefaultVectorDBCluster();
    expect(checker.check(state)).toBeNull();

    // Simulate invalid quantization index
    const invalidPqState: VectorDBClusterState = JSON.parse(
      JSON.stringify(state),
    ) as VectorDBClusterState;
    invalidPqState.pqCodebook.quantizedVectors['vec-1'] = [999, 0]; // Exceeds centroidsPerSubspace (4)
    const violation = checker.check(invalidPqState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('VEC-4');
  });

  it('executes greedy HNSW k-NN query with bounded distance calculations', () => {
    let state = createDefaultVectorDBCluster();
    state = pureVectorDBTransition(
      state,
      {
        id: 'q-1',
        tick: 1,
        type: 'VEC_QUERY_KNN',
        payload: {
          queryId: 'query-1',
          queryVector: [0.11, 0.21, 0.31, 0.41],
          k: 2,
        },
      },
      rng,
    ).nextState;

    expect(state.activeQuery).not.toBeNull();
    expect(state.activeQuery?.status).toBe('COMPLETED');
    expect(state.activeQuery?.kNearestResults.length).toBe(2);
    // Closest should be vec-1 or vec-4 which have similar coordinates [0.1, 0.2, 0.3, 0.4]
    expect(['vec-1', 'vec-4']).toContain(state.activeQuery?.kNearestResults[0]?.nodeId);
    expect(state.activeQuery?.distanceComputationsCount).toBeGreaterThan(0);
    expect(checker.check(state)).toBeNull();
  });
});
