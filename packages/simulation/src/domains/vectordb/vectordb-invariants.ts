/**
 * Vector Database Invariant Checker
 *
 * Invariants:
 * - VEC-1: HNSW Layer Subsumption (node at L_k must exist at all lower layers L_0 ... L_{k-1})
 * - VEC-2: Bounded Node Degree (connections <= M for L > 0 and <= M0 for L_0)
 * - VEC-3: Metric Distance Non-Negativity & Identity
 * - VEC-4: Quantization Index Bound (PQ codes strictly within valid subspace codebook)
 */

import { euclideanDistance } from './vectordb-algorithms.js';
import type { VectorDBClusterState } from './vectordb-types.js';

export interface VectorDBInvariantViolation {
  ruleId: 'VEC-1' | 'VEC-2' | 'VEC-3' | 'VEC-4';
  invariantName: string;
  description: string;
  isPedagogicalFlaw?: boolean | undefined;
}

export class VectorDBInvariantChecker {
  public check(state: VectorDBClusterState): VectorDBInvariantViolation | null {
    const { hnswGraph, pqCodebook } = state;

    // 1. VEC-1: HNSW Layer Subsumption
    for (const [nodeId, node] of Object.entries(hnswGraph.nodes)) {
      for (let l = 0; l <= node.topLayer; l++) {
        if (!node.neighborsByLayer[l]) {
          return {
            ruleId: 'VEC-1',
            invariantName: 'HNSW Layer Subsumption',
            description: `Node "${nodeId}" at top layer ${String(node.topLayer)} is missing entry for lower layer ${String(l)}.`,
          };
        }
      }
    }

    // 2. VEC-2: Bounded Node Degree
    for (const [nodeId, node] of Object.entries(hnswGraph.nodes)) {
      for (const [layerStr, neighbors] of Object.entries(node.neighborsByLayer)) {
        const layer = Number(layerStr);
        const maxAllowed = layer === 0 ? hnswGraph.M0 : hnswGraph.M;
        if (neighbors.length > maxAllowed) {
          return {
            ruleId: 'VEC-2',
            invariantName: 'Bounded Node Degree',
            description: `Node "${nodeId}" has ${String(neighbors.length)} connections at layer ${String(layer)}, exceeding limit ${String(maxAllowed)}.`,
          };
        }
      }
    }

    // 3. VEC-3: Metric Distance Properties
    for (const node of Object.values(hnswGraph.nodes)) {
      const selfDist = euclideanDistance(node.vector, node.vector);
      if (selfDist !== 0) {
        return {
          ruleId: 'VEC-3',
          invariantName: 'Strict Metric Properties',
          description: `Self-distance of node "${node.id}" is non-zero: ${String(selfDist)}.`,
        };
      }
    }

    // 4. VEC-4: Quantization Index Bound
    for (const [nodeId, codes] of Object.entries(pqCodebook.quantizedVectors)) {
      for (let s = 0; s < codes.length; s++) {
        const code = codes[s];
        if (code === undefined || code < 0 || code >= pqCodebook.centroidsPerSubspace) {
          return {
            ruleId: 'VEC-4',
            invariantName: 'Quantization Index Bound',
            description: `Node "${nodeId}" has invalid quantization code ${String(code)} for subspace ${String(s)}.`,
          };
        }
      }
    }

    return null;
  }
}
