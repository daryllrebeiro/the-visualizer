import type { RedisClusterState, RedisNode } from './redis-types.js';

export interface RedisInvariantViolation {
  ruleId: string;
  invariantName: string;
  description: string;
  affectedNodeIds: string[];
}

export class RedisInvariantChecker {
  public check(state: RedisClusterState): RedisInvariantViolation | undefined {
    // 1. Check slot coverage
    const inv1 = this.checkSlotCoverage(state);
    if (inv1) return inv1;

    // 2. Check memory limits
    const inv2 = this.checkMemoryLimits(state);
    if (inv2) return inv2;

    return undefined;
  }

  private checkSlotCoverage(state: RedisClusterState): RedisInvariantViolation | undefined {
    const slotOwners = new Map<number, string>();
    const nodes = Object.values(state.nodes) as RedisNode[];
    const masters = nodes.filter((n) => n.role === 'MASTER' && n.status === 'ALIVE');

    for (const master of masters) {
      for (const range of master.slotRanges) {
        for (let s = range.startSlot; s <= range.endSlot; s++) {
          if (slotOwners.has(s)) {
            const existingOwner = slotOwners.get(s)!;
            return {
              ruleId: 'REDIS_SLOT_COLLISION',
              invariantName: 'Slot Uniqueness',
              description: `Slot ${String(s)} owned by multiple active masters: ${existingOwner} and ${master.id}`,
              affectedNodeIds: [existingOwner, master.id],
            };
          }
          slotOwners.set(s, master.id);
        }
      }
    }
    return undefined;
  }

  private checkMemoryLimits(state: RedisClusterState): RedisInvariantViolation | undefined {
    if (state.evictionPolicy === 'noeviction') return undefined;

    const nodes = Object.values(state.nodes) as RedisNode[];
    for (const node of nodes) {
      if (node.memoryUsedBytes > node.maxMemoryBytes) {
        return {
          ruleId: 'REDIS_MEMORY_OVERFLOW',
          invariantName: 'Memory Limit Enforced',
          description: `Node ${node.id} memory (${String(node.memoryUsedBytes)}B) exceeds maxMemoryBytes (${String(node.maxMemoryBytes)}B) under policy ${state.evictionPolicy}`,
          affectedNodeIds: [node.id],
        };
      }
    }
    return undefined;
  }
}
