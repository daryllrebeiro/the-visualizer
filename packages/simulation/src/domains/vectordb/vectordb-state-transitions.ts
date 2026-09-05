/**
 * Vector Database State Transitions & Simulation Reducer
 */

import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  euclideanDistance,
  findBestNeighbor,
  quantizeVector,
} from './vectordb-algorithms.js';
import type {
  HNSWNode,
  VectorCandidate,
  VectorDBClusterState,
  VectorDBSimEvent,
} from './vectordb-types.js';

export function createDefaultVectorDBCluster(clusterId = 'vectordb-1'): VectorDBClusterState {
  const nodes: Record<string, HNSWNode> = {
    'vec-1': {
      id: 'vec-1',
      vector: [0.1, 0.2, 0.3, 0.4],
      topLayer: 2,
      neighborsByLayer: {
        0: ['vec-2', 'vec-3'],
        1: ['vec-2', 'vec-4'],
        2: ['vec-4'],
      },
    },
    'vec-2': {
      id: 'vec-2',
      vector: [0.2, 0.3, 0.4, 0.5],
      topLayer: 1,
      neighborsByLayer: {
        0: ['vec-1', 'vec-3', 'vec-4'],
        1: ['vec-1', 'vec-4'],
      },
    },
    'vec-3': {
      id: 'vec-3',
      vector: [0.8, 0.7, 0.6, 0.9],
      topLayer: 0,
      neighborsByLayer: {
        0: ['vec-1', 'vec-2', 'vec-5'],
      },
    },
    'vec-4': {
      id: 'vec-4',
      vector: [0.15, 0.25, 0.35, 0.45],
      topLayer: 2,
      neighborsByLayer: {
        0: ['vec-1', 'vec-2'],
        1: ['vec-1', 'vec-2'],
        2: ['vec-1'],
      },
    },
    'vec-5': {
      id: 'vec-5',
      vector: [0.85, 0.75, 0.65, 0.95],
      topLayer: 0,
      neighborsByLayer: {
        0: ['vec-3'],
      },
    },
  };

  const codebook: Record<number, number[][]> = {
    0: [
      [0.1, 0.2],
      [0.8, 0.7],
      [0.2, 0.3],
      [0.9, 0.8],
    ],
    1: [
      [0.3, 0.4],
      [0.6, 0.9],
      [0.4, 0.5],
      [0.7, 0.95],
    ],
  };

  const quantizedVectors: Record<string, number[]> = {};
  for (const [id, n] of Object.entries(nodes)) {
    quantizedVectors[id] = quantizeVector(n.vector, 2, codebook);
  }

  return {
    clusterId,
    tick: 0,
    indexType: 'HNSW',
    hnswGraph: {
      maxLayers: 3,
      M: 4,
      M0: 8,
      efConstruction: 16,
      efSearch: 8,
      entryPointNodeId: 'vec-1',
      nodes,
    },
    ivfClusters: {
      nlist: 2,
      nprobe: 1,
      centroids: [
        { id: 0, vector: [0.15, 0.25, 0.35, 0.45], memberIds: ['vec-1', 'vec-2', 'vec-4'] },
        { id: 1, vector: [0.82, 0.72, 0.62, 0.92], memberIds: ['vec-3', 'vec-5'] },
      ],
    },
    pqCodebook: {
      subspaces: 2,
      centroidsPerSubspace: 4,
      codebook,
      quantizedVectors,
    },
    activeQuery: null,
    metrics: {
      totalVectors: 5,
      recallAtK: 0.96,
      avgDistanceCalcs: 6.2,
    },
  };
}

export function pureVectorDBTransition(
  state: VectorDBClusterState,
  event: VectorDBSimEvent,
  _rng: DeterministicRNG,
): { nextState: VectorDBClusterState; emittedEvents: VectorDBSimEvent[] } {
  const nextState: VectorDBClusterState = JSON.parse(
    JSON.stringify(state),
  ) as VectorDBClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'TICK' as any:
    case 'VEC_TICK': {
      break;
    }

    case 'VEC_INSERT_VECTOR': {
      const { nodeId, vector, topLayer = 0 } = event.payload;
      const neighborsByLayer: Record<number, string[]> = {};

      for (let l = 0; l <= topLayer; l++) {
        // Find closest existing nodes at this layer to connect
        const layerNodes = Object.values(nextState.hnswGraph.nodes).filter(
          (n) => n.topLayer >= l,
        );
        const sorted = layerNodes
          .map((n) => ({ id: n.id, dist: euclideanDistance(vector, n.vector) }))
          .sort((a, b) => a.dist - b.dist);

        const maxNeighbors = l === 0 ? nextState.hnswGraph.M0 : nextState.hnswGraph.M;
        neighborsByLayer[l] = sorted.slice(0, maxNeighbors).map((s) => s.id);

        const currentLayerNeighbors = neighborsByLayer[l] ?? [];
        // Bi-directional connection
        for (const neighborId of currentLayerNeighbors) {
          const neighbor = nextState.hnswGraph.nodes[neighborId];
          const neighborLayer = neighbor?.neighborsByLayer[l];
          if (neighbor && neighborLayer) {
            if (!neighborLayer.includes(nodeId)) {
              if (neighborLayer.length < maxNeighbors) {
                neighborLayer.push(nodeId);
              }
            }
          }
        }
      }

      nextState.hnswGraph.nodes[nodeId] = {
        id: nodeId,
        vector,
        topLayer,
        neighborsByLayer,
      };

      // Quantize
      nextState.pqCodebook.quantizedVectors[nodeId] = quantizeVector(
        vector,
        nextState.pqCodebook.subspaces,
        nextState.pqCodebook.codebook,
      );

      nextState.metrics.totalVectors = Object.keys(nextState.hnswGraph.nodes).length;
      break;
    }

    case 'VEC_QUERY_KNN': {
      const { queryId, queryVector, k = 3 } = event.payload;
      const entryId = nextState.hnswGraph.entryPointNodeId ?? Object.keys(nextState.hnswGraph.nodes)[0]!;
      const entryNode = nextState.hnswGraph.nodes[entryId];
      const initialDist = entryNode ? euclideanDistance(queryVector, entryNode.vector) : 0;

      nextState.activeQuery = {
        queryId,
        queryVector,
        currentLayer: entryNode ? entryNode.topLayer : 0,
        currentNodeId: entryId,
        visitedNodeIds: [entryId],
        candidates: [{ nodeId: entryId, distance: initialDist }],
        kNearestResults: [],
        distanceComputationsCount: 1,
        status: 'SEARCHING_LAYERS',
      };

      // Immediately run step search down to L0
      let currId = entryId;
      let currLayer = nextState.activeQuery.currentLayer;

      while (currLayer > 0) {
        const node = nextState.hnswGraph.nodes[currId];
        const layerNeighbors = node?.neighborsByLayer[currLayer] ?? [];
        const best = findBestNeighbor(queryVector, layerNeighbors, nextState.hnswGraph.nodes);
        nextState.activeQuery.distanceComputationsCount += layerNeighbors.length;

        if (best && best.bestDist < euclideanDistance(queryVector, node!.vector)) {
          currId = best.bestId;
          nextState.activeQuery.visitedNodeIds.push(currId);
        }
        currLayer--;
      }

      // At layer 0, collect efSearch candidates
      const l0Node = nextState.hnswGraph.nodes[currId];
      const l0Neighbors = l0Node?.neighborsByLayer[0] ?? [];
      const allCandidates: VectorCandidate[] = [
        { nodeId: currId, distance: euclideanDistance(queryVector, l0Node!.vector) },
      ];

      for (const nId of l0Neighbors) {
        const n = nextState.hnswGraph.nodes[nId];
        if (n) {
          allCandidates.push({ nodeId: nId, distance: euclideanDistance(queryVector, n.vector) });
          nextState.activeQuery.visitedNodeIds.push(nId);
        }
      }
      nextState.activeQuery.distanceComputationsCount += l0Neighbors.length;

      allCandidates.sort((a, b) => a.distance - b.distance);
      nextState.activeQuery.kNearestResults = allCandidates.slice(0, k);
      nextState.activeQuery.currentLayer = 0;
      nextState.activeQuery.currentNodeId = currId;
      nextState.activeQuery.status = 'COMPLETED';
      break;
    }

    case 'VEC_STEP_SEARCH': {
      // Step fine-grained inspection
      break;
    }

    case 'VEC_DELETE_NODE': {
      const { nodeId } = event.payload;
      delete nextState.hnswGraph.nodes[nodeId];
      delete nextState.pqCodebook.quantizedVectors[nodeId];

      for (const node of Object.values(nextState.hnswGraph.nodes)) {
        for (const neighbors of Object.values(node.neighborsByLayer)) {
          const idx = neighbors.indexOf(nodeId);
          if (idx !== -1) neighbors.splice(idx, 1);
        }
      }
      nextState.metrics.totalVectors = Object.keys(nextState.hnswGraph.nodes).length;
      break;
    }

    case 'VEC_TOGGLE_INDEX_TYPE': {
      nextState.indexType = event.payload.indexType;
      break;
    }
  }

  (nextState as any).rngState = _rng.getState();
  return { nextState, emittedEvents: [] };
}
