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
        // Bi-directional connection (Malkov & Yashunin 2018 heuristic: keep closest neighbors)
        for (const neighborId of currentLayerNeighbors) {
          const neighbor = nextState.hnswGraph.nodes[neighborId];
          const neighborLayer = neighbor?.neighborsByLayer[l];
          if (neighbor && neighborLayer) {
            if (!neighborLayer.includes(nodeId)) {
              if (neighborLayer.length < maxNeighbors) {
                neighborLayer.push(nodeId);
              } else {
                const candNeighbors = [...neighborLayer, nodeId].map((id) => ({
                  id,
                  dist: euclideanDistance(
                    neighbor.vector,
                    id === nodeId ? vector : nextState.hnswGraph.nodes[id]!.vector,
                  ),
                }));
                candNeighbors.sort((a, b) => a.dist - b.dist);
                neighbor.neighborsByLayer[l] = candNeighbors
                  .slice(0, maxNeighbors)
                  .map((c) => c.id);
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
      const efSearch = (event.payload as any).efSearch ?? nextState.hnswGraph.efSearch ?? 16;
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

      // At layer 0, explore using efSearch-bounded candidate beam (Malkov & Yashunin 2018 Algorithm 2)
      const l0Node = nextState.hnswGraph.nodes[currId];
      const startDist = l0Node ? euclideanDistance(queryVector, l0Node.vector) : Infinity;

      const visited = new Set<string>([currId]);
      const C: VectorCandidate[] = [{ nodeId: currId, distance: startDist }];
      const W: VectorCandidate[] = [{ nodeId: currId, distance: startDist }];

      while (C.length > 0) {
        const c = C.shift()!;
        const f = W[W.length - 1]!;

        if (c.distance > f.distance && W.length >= efSearch) {
          break;
        }

        const cNode = nextState.hnswGraph.nodes[c.nodeId];
        const neighbors = cNode?.neighborsByLayer[0] ?? [];

        for (const nId of neighbors) {
          if (!visited.has(nId)) {
            visited.add(nId);
            nextState.activeQuery.visitedNodeIds.push(nId);
            const nNode = nextState.hnswGraph.nodes[nId];
            if (nNode) {
              const d = euclideanDistance(queryVector, nNode.vector);
              nextState.activeQuery.distanceComputationsCount++;

              if (d < f.distance || W.length < efSearch) {
                C.push({ nodeId: nId, distance: d });
                C.sort((a, b) => a.distance - b.distance);

                W.push({ nodeId: nId, distance: d });
                W.sort((a, b) => a.distance - b.distance);

                if (W.length > efSearch) {
                  W.pop();
                }
              }
            }
          }
        }
      }

      nextState.activeQuery.kNearestResults = W.slice(0, k);
      nextState.activeQuery.currentLayer = 0;
      nextState.activeQuery.currentNodeId = W[0]?.nodeId ?? currId;
      nextState.activeQuery.status = 'COMPLETED';

      // Dynamic Recall@k computation against exact brute-force ground truth
      const allBruteForce = Object.values(nextState.hnswGraph.nodes).map((n) => ({
        id: n.id,
        distance: euclideanDistance(queryVector, n.vector),
      }));
      allBruteForce.sort((a, b) => a.distance - b.distance);
      const groundTruthTopK = new Set(allBruteForce.slice(0, k).map((x) => x.id));

      const foundTopK = nextState.activeQuery.kNearestResults.map((r) => r.nodeId);
      const hits = foundTopK.filter((id) => groundTruthTopK.has(id)).length;
      nextState.metrics.recallAtK = Number((hits / k).toFixed(4));
      nextState.metrics.avgDistanceCalcs = nextState.activeQuery.distanceComputationsCount;
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
