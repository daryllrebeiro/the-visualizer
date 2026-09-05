/**
 * Vector Database Mathematical Algorithms & Distance Metrics
 */

import type { HNSWNode } from './vectordb-types.js';

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function findBestNeighbor(
  query: number[],
  neighborIds: string[],
  nodes: Record<string, HNSWNode>,
): { bestId: string; bestDist: number } | null {
  if (neighborIds.length === 0) return null;
  let bestId = neighborIds[0]!;
  let bestDist = Infinity;

  for (const nId of neighborIds) {
    const node = nodes[nId];
    if (node) {
      const dist = euclideanDistance(query, node.vector);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = nId;
      }
    }
  }

  return { bestId, bestDist };
}

export function quantizeVector(
  vector: number[],
  subspaces: number,
  codebook: Record<number, number[][]>,
): number[] {
  const codes: number[] = [];
  const subDim = Math.floor(vector.length / subspaces);

  for (let s = 0; s < subspaces; s++) {
    const subVec = vector.slice(s * subDim, (s + 1) * subDim);
    const centroids = codebook[s] ?? [];
    let bestCentroidIdx = 0;
    let bestDist = Infinity;

    for (let c = 0; c < centroids.length; c++) {
      const centroid = centroids[c] ?? [];
      const dist = euclideanDistance(subVec, centroid);
      if (dist < bestDist) {
        bestDist = dist;
        bestCentroidIdx = c;
      }
    }
    codes.push(bestCentroidIdx);
  }

  return codes;
}
