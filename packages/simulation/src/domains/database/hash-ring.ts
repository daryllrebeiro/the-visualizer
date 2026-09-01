export interface RingToken {
  token: number;
  nodeId: string;
}

export function hashToToken(str: string): number {
  // 32-bit FNV-1a hash algorithm
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0; // Ensure unsigned 32-bit integer [0, 4294967295]
}

export class ConsistentHashRing {
  private ring: RingToken[] = [];
  private readonly vnodesPerNode: number;

  constructor(vnodesPerNode = 3) {
    this.vnodesPerNode = vnodesPerNode;
  }

  public addNode(nodeId: string): void {
    for (let v = 0; v < this.vnodesPerNode; v++) {
      const vnodeKey = `${nodeId}-vnode-${String(v)}`;
      const token = hashToToken(vnodeKey);
      this.ring.push({ token, nodeId });
    }
    this.sortRing();
  }

  public removeNode(nodeId: string): void {
    this.ring = this.ring.filter((item) => item.nodeId !== nodeId);
  }

  public getRingTokens(): readonly RingToken[] {
    return this.ring;
  }

  public setRingTokens(tokens: RingToken[]): void {
    this.ring = [...tokens];
    this.sortRing();
  }

  /**
   * Finds the N replica nodes responsible for a given key by walking clockwise on the ring.
   */
  public findReplicas(
    key: string,
    replicationFactor: number,
    filterDown = false,
    nodes?: Record<string, { status: string }>,
  ): { keyToken: number; primaryNodeId: string; replicaNodeIds: string[] } {
    if (this.ring.length === 0) {
      return { keyToken: 0, primaryNodeId: '', replicaNodeIds: [] };
    }

    const keyToken = hashToToken(key);
    let startIdx = this.bisectRight(keyToken);
    if (startIdx >= this.ring.length) {
      startIdx = 0; // Wrap around clockwise
    }

    const replicaNodeIds: string[] = [];
    const seenNodes = new Set<string>();

    for (let i = 0; i < this.ring.length; i++) {
      const idx = (startIdx + i) % this.ring.length;
      const entry = this.ring[idx];
      if (!entry) continue;

      const nId = entry.nodeId;
      if (seenNodes.has(nId)) continue;

      if (filterDown && nodes && nodes[nId]?.status === 'DOWN') {
        continue;
      }

      seenNodes.add(nId);
      replicaNodeIds.push(nId);

      if (replicaNodeIds.length >= replicationFactor) {
        break;
      }
    }

    return {
      keyToken,
      primaryNodeId: replicaNodeIds[0] ?? '',
      replicaNodeIds,
    };
  }

  private sortRing(): void {
    this.ring.sort((a, b) => a.token - b.token);
  }

  private bisectRight(token: number): number {
    let low = 0;
    let high = this.ring.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const midToken = this.ring[mid]?.token ?? 0;
      if (token < midToken) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low;
  }
}
