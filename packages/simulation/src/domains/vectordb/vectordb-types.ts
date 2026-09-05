/**
 * Vector Database & Approximate Nearest Neighbor (ANN) Simulation Types
 *
 * References:
 * - Malkov & Yashunin (2018): Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs (TPAMI '18)
 * - Jégou, Douze, & Schmid (2011): Product Quantization for Nearest Neighbor Search (TPAMI '11)
 */

export interface HNSWNode {
  id: string;
  vector: number[];
  topLayer: number;
  neighborsByLayer: Record<number, string[]>;
}

export interface HNSWGraphState {
  maxLayers: number;
  M: number;
  M0: number;
  efConstruction: number;
  efSearch: number;
  entryPointNodeId: string | null;
  nodes: Record<string, HNSWNode>;
}

export interface IVFCentroid {
  id: number;
  vector: number[];
  memberIds: string[];
}

export interface IVFClustersState {
  nlist: number;
  nprobe: number;
  centroids: IVFCentroid[];
}

export interface PQCodebookState {
  subspaces: number;
  centroidsPerSubspace: number;
  codebook: Record<number, number[][]>;
  quantizedVectors: Record<string, number[]>;
}

export interface VectorCandidate {
  nodeId: string;
  distance: number;
}

export interface VectorQueryState {
  queryId: string;
  queryVector: number[];
  currentLayer: number;
  currentNodeId: string;
  visitedNodeIds: string[];
  candidates: VectorCandidate[];
  kNearestResults: VectorCandidate[];
  distanceComputationsCount: number;
  status: 'IDLE' | 'SEARCHING_LAYERS' | 'GREEDY_ROUTING' | 'COMPLETED';
}

export interface VectorDBClusterState {
  clusterId: string;
  tick: number;
  indexType: 'HNSW' | 'IVF_PQ';
  hnswGraph: HNSWGraphState;
  ivfClusters: IVFClustersState;
  pqCodebook: PQCodebookState;
  activeQuery: VectorQueryState | null;
  metrics: {
    totalVectors: number;
    recallAtK: number;
    avgDistanceCalcs: number;
  };
}

export type VectorDBSimEvent =
  | { id: string; tick: number; type: 'VEC_TICK'; payload: Record<string, unknown> }
  | {
      id: string;
      tick: number;
      type: 'VEC_INSERT_VECTOR';
      payload: {
        nodeId: string;
        vector: number[];
        topLayer?: number | undefined;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'VEC_QUERY_KNN';
      payload: {
        queryId: string;
        queryVector: number[];
        k?: number | undefined;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'VEC_STEP_SEARCH';
      payload?: Record<string, unknown> | undefined;
    }
  | {
      id: string;
      tick: number;
      type: 'VEC_DELETE_NODE';
      payload: {
        nodeId: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'VEC_TOGGLE_INDEX_TYPE';
      payload: {
        indexType: 'HNSW' | 'IVF_PQ';
      };
    };
