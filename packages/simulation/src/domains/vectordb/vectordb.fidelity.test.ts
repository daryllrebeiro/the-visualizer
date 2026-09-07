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

  it('VEC-5: validates that ef_search controls exploration breadth and produces monotonically increasing recall', () => {
    // Build a graph with 20 vectors arranged in clustered space
    let state = createDefaultVectorDBCluster();
    const clusterRng = new DeterministicRNG(1234);

    for (let i = 6; i <= 25; i++) {
      const v = [
        Number((clusterRng.nextFloat() * 2).toFixed(3)),
        Number((clusterRng.nextFloat() * 2).toFixed(3)),
        Number((clusterRng.nextFloat() * 2).toFixed(3)),
        Number((clusterRng.nextFloat() * 2).toFixed(3)),
      ];
      state = pureVectorDBTransition(
        state,
        {
          id: `ins-${i}`,
          tick: i,
          type: 'VEC_INSERT_VECTOR',
          payload: { nodeId: `vec-${i}`, vector: v, topLayer: i % 3 === 0 ? 1 : 0 },
        },
        clusterRng,
      ).nextState;
    }

    const queryVector = [0.55, 0.75, 1.25, 1.45];
    const k = 5;

    // Run search at efSearch = 1 (greedy narrow search)
    const stateEf1 = pureVectorDBTransition(
      JSON.parse(JSON.stringify(state)),
      {
        id: 'q-ef1',
        tick: 100,
        type: 'VEC_QUERY_KNN',
        payload: { queryId: 'q-ef1', queryVector, k, efSearch: 1 },
      },
      clusterRng,
    ).nextState;

    // Run search at efSearch = 5 (moderate candidate beam)
    const stateEf5 = pureVectorDBTransition(
      JSON.parse(JSON.stringify(state)),
      {
        id: 'q-ef5',
        tick: 101,
        type: 'VEC_QUERY_KNN',
        payload: { queryId: 'q-ef5', queryVector, k, efSearch: 5 },
      },
      clusterRng,
    ).nextState;

    // Run search at efSearch = 25 (wide candidate beam exploring entire cluster)
    const stateEf25 = pureVectorDBTransition(
      JSON.parse(JSON.stringify(state)),
      {
        id: 'q-ef25',
        tick: 102,
        type: 'VEC_QUERY_KNN',
        payload: { queryId: 'q-ef25', queryVector, k, efSearch: 25 },
      },
      clusterRng,
    ).nextState;

    const recallEf1 = stateEf1.metrics.recallAtK;
    const recallEf5 = stateEf5.metrics.recallAtK;
    const recallEf25 = stateEf25.metrics.recallAtK;

    // Recall must be monotonically non-decreasing
    expect(recallEf5).toBeGreaterThanOrEqual(recallEf1);
    expect(recallEf25).toBeGreaterThanOrEqual(recallEf5);

    // Across ef=1 and ef=25, recall must be measurably different (narrow vs wide search)
    expect(recallEf25).toBeGreaterThan(recallEf1);
    expect(recallEf25).toBe(1.0); // Large efSearch finds all true nearest neighbors

    // Distance computation count must increase with efSearch
    expect(stateEf25.activeQuery!.distanceComputationsCount).toBeGreaterThan(
      stateEf1.activeQuery!.distanceComputationsCount,
    );
  });

  describe('VDB-1: Node Deletion & Graph Connectivity (No Orphaned Nodes)', () => {
    it('removes deleted node from all neighbor adjacency lists and leaves no orphaned nodes', () => {
      let state = createDefaultVectorDBCluster();
      // vec-1 is the central hub connected to vec-2, vec-3, vec-4
      state = pureVectorDBTransition(
        state,
        { id: 'del-1', tick: 1, type: 'VEC_DELETE_NODE', payload: { nodeId: 'vec-1' } },
        rng,
      ).nextState;

      expect(state.hnswGraph.nodes['vec-1']).toBeUndefined();
      for (const node of Object.values(state.hnswGraph.nodes)) {
        for (const neighbors of Object.values(node.neighborsByLayer)) {
          expect(neighbors).not.toContain('vec-1');
        }
      }
      // Check that remaining nodes are still connected (no orphaned nodes)
      const orphaned = Object.entries(state.hnswGraph.nodes).filter(([_, n]) => {
        const allNeighbors = Object.values(n.neighborsByLayer).flat();
        return allNeighbors.length === 0;
      });
      expect(orphaned.length).toBe(0);
    });
  });
});

