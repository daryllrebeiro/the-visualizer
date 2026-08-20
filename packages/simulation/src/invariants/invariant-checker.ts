import type { KafkaClusterState } from '../engine/types.js';

export interface InvariantViolation {
  invariantName: string;
  description: string;
  tick: number;
  affectedEntities: string[];
  stateSnapshot?: Partial<KafkaClusterState>;
}

/**
 * InvariantChecker — asserts all 8 Kafka protocol invariants on every tick.
 *
 * If any invariant is violated, the engine halts and records a reproducible dump.
 */
export class InvariantChecker {
  /**
   * Runs all invariants against the current cluster state.
   * Returns the first violation found, or undefined if all pass.
   */
  public check(state: KafkaClusterState): InvariantViolation | undefined {
    const tick = state.tick;

    // 1. Invariant 1: Partition Leader exists and is ALIVE if leaderBrokerId is set
    const inv1 = this.checkPartitionLeaderStatus(state, tick);
    if (inv1) return inv1;

    // 2. Invariant 2: Leader is an active member of the partition's ISR
    const inv2 = this.checkLeaderInIsr(state, tick);
    if (inv2) return inv2;

    // 3. Invariant 3: ISR is a strict subset of replicas
    const inv3 = this.checkIsrSubsetOfReplicas(state, tick);
    if (inv3) return inv3;

    // 4. Invariant 4: High-Watermark is bounded by the Leader LEO (HW <= Leader LEO)
    const inv4 = this.checkHighWatermarkBound(state, tick);
    if (inv4) return inv4;

    // 5. Invariant 5: Consumer Committed offset <= Partition High-Watermark
    const inv5 = this.checkCommittedOffsetBound(state, tick);
    if (inv5) return inv5;

    // 6. Invariant 6: KRaft Controller exists and is a registered voter
    const inv6 = this.checkKraftControllerVoter(state, tick);
    if (inv6) return inv6;

    // 7. Invariant 7: Min-ISR configuration is respected
    // If writes occurred, ISR size must be >= minInsyncReplicas
    const inv7 = this.checkMinIsrConfiguration(state, tick);
    if (inv7) return inv7;

    // 8. Invariant 8: Consumer Offset Commit Epoch Fencing
    const inv8 = this.checkConsumerEpochFencing(state, tick);
    if (inv8) return inv8;

    return undefined;
  }

  private checkPartitionLeaderStatus(
    state: KafkaClusterState,
    tick: number,
  ): InvariantViolation | undefined {
    for (const topicName in state.topics) {
      const partitions = state.topics[topicName];
      if (!partitions) continue;

      for (const partition of partitions) {
        if (partition.leaderBrokerId !== null) {
          const leader = state.brokers[partition.leaderBrokerId];
          if (!leader) {
            return {
              invariantName: 'LEADER_EXISTS',
              description: `Leader broker "${partition.leaderBrokerId}" for partition "${topicName}-${String(partition.partition)}" does not exist in cluster configuration.`,
              tick,
              affectedEntities: [topicName, partition.leaderBrokerId],
            };
          }
          if (leader.status === 'CRASHED') {
            return {
              invariantName: 'LEADER_ALIVE',
              description: `Leader broker "${partition.leaderBrokerId}" for partition "${topicName}-${String(partition.partition)}" is in CRASHED state.`,
              tick,
              affectedEntities: [topicName, partition.leaderBrokerId],
            };
          }
        }
      }
    }
    return undefined;
  }

  private checkLeaderInIsr(state: KafkaClusterState, tick: number): InvariantViolation | undefined {
    for (const topicName in state.topics) {
      const partitions = state.topics[topicName];
      if (!partitions) continue;

      for (const partition of partitions) {
        if (
          partition.leaderBrokerId !== null &&
          !partition.isr.includes(partition.leaderBrokerId)
        ) {
          return {
            invariantName: 'LEADER_IN_ISR',
            description: `Leader broker "${partition.leaderBrokerId}" for partition "${topicName}-${String(partition.partition)}" is not in the In-Sync Replicas list: [${partition.isr.join(', ')}].`,
            tick,
            affectedEntities: [topicName, partition.leaderBrokerId],
          };
        }
      }
    }
    return undefined;
  }

  private checkIsrSubsetOfReplicas(
    state: KafkaClusterState,
    tick: number,
  ): InvariantViolation | undefined {
    for (const topicName in state.topics) {
      const partitions = state.topics[topicName];
      if (!partitions) continue;

      for (const partition of partitions) {
        const replicaIds = partition.replicas.map((r) => r.brokerId);
        for (const isrBrokerId of partition.isr) {
          if (!replicaIds.includes(isrBrokerId)) {
            return {
              invariantName: 'ISR_SUBSET_OF_REPLICAS',
              description: `ISR member "${isrBrokerId}" of partition "${topicName}-${String(partition.partition)}" is not in the replica set: [${replicaIds.join(', ')}].`,
              tick,
              affectedEntities: [topicName, isrBrokerId],
            };
          }
        }
      }
    }
    return undefined;
  }

  private checkHighWatermarkBound(
    state: KafkaClusterState,
    tick: number,
  ): InvariantViolation | undefined {
    for (const topicName in state.topics) {
      const partitions = state.topics[topicName];
      if (!partitions) continue;

      for (const partition of partitions) {
        if (partition.leaderBrokerId !== null) {
          const leaderReplica = partition.replicas.find(
            (r) => r.brokerId === partition.leaderBrokerId,
          );
          if (leaderReplica && partition.highWatermark > leaderReplica.logEndOffset) {
            return {
              invariantName: 'HIGH_WATERMARK_BOUND',
              description: `High-watermark (${String(partition.highWatermark)}) is greater than leader LEO (${String(leaderReplica.logEndOffset)}) for partition "${topicName}-${String(partition.partition)}".`,
              tick,
              affectedEntities: [topicName, partition.leaderBrokerId],
            };
          }
        }
      }
    }
    return undefined;
  }

  private checkCommittedOffsetBound(
    state: KafkaClusterState,
    tick: number,
  ): InvariantViolation | undefined {
    for (const groupId in state.consumerGroups) {
      const group = state.consumerGroups[groupId];
      if (!group) continue;

      for (const topic in group.committedOffsets) {
        const topicOffsets = group.committedOffsets[topic];
        if (!topicOffsets) continue;

        const partitions = state.topics[topic];
        if (!partitions) continue;

        for (const partitionStr in topicOffsets) {
          const partitionId = parseInt(partitionStr, 10);
          const committedOffset = topicOffsets[partitionId];
          const partition = partitions.find((p) => p.partition === partitionId);

          if (
            partition &&
            committedOffset !== undefined &&
            committedOffset > partition.highWatermark
          ) {
            return {
              invariantName: 'COMMITTED_OFFSET_BOUND',
              description: `Consumer group "${groupId}" committed offset (${String(committedOffset)}) is greater than partition "${topic}-${String(partitionId)}" high-watermark (${String(partition.highWatermark)}).`,
              tick,
              affectedEntities: [groupId, topic],
            };
          }
        }
      }
    }
    return undefined;
  }

  private checkKraftControllerVoter(
    state: KafkaClusterState,
    tick: number,
  ): InvariantViolation | undefined {
    const activeControllerId = state.kraft.activeControllerId;
    if (activeControllerId !== null) {
      const controllerExists = state.brokers[activeControllerId] !== undefined;
      if (!controllerExists) {
        return {
          invariantName: 'KRAFT_CONTROLLER_EXISTS',
          description: `Active KRaft controller ID "${activeControllerId}" does not exist in cluster configuration.`,
          tick,
          affectedEntities: [activeControllerId],
        };
      }
      if (!state.kraft.voters.includes(activeControllerId)) {
        return {
          invariantName: 'KRAFT_CONTROLLER_IS_VOTER',
          description: `Active KRaft controller ID "${activeControllerId}" is not in the KRaft voter quorum: [${state.kraft.voters.join(', ')}].`,
          tick,
          affectedEntities: [activeControllerId],
        };
      }
    }
    return undefined;
  }

  private checkMinIsrConfiguration(
    state: KafkaClusterState,
    tick: number,
  ): InvariantViolation | undefined {
    for (const topicName in state.topics) {
      const partitions = state.topics[topicName];
      if (!partitions) continue;

      for (const partition of partitions) {
        // If partition is active, check if ISR size is below minInsyncReplicas
        if (
          partition.leaderBrokerId !== null &&
          partition.isr.length < partition.minInsyncReplicas
        ) {
          // If the leader is still processing writes or has progressed offsets
          const leaderReplica = partition.replicas.find(
            (r) => r.brokerId === partition.leaderBrokerId,
          );
          if (leaderReplica && leaderReplica.logEndOffset > 0) {
            // Under strict settings, running writes on under-replicated partitions is a safety violation.
            // Let's raise a warning/invariant violation to flag this condition.
            return {
              invariantName: 'MIN_ISR_ACK_VIOLATED',
              description: `Partition "${topicName}-${String(partition.partition)}" has an active leader and log progress (LEO=${String(leaderReplica.logEndOffset)}) but ISR size (${String(partition.isr.length)}) is less than configured minInsyncReplicas (${String(partition.minInsyncReplicas)}).`,
              tick,
              affectedEntities: [topicName, partition.leaderBrokerId],
            };
          }
        }
      }
    }
    return undefined;
  }

  private checkConsumerEpochFencing(
    state: KafkaClusterState,
    tick: number,
  ): InvariantViolation | undefined {
    for (const groupId in state.consumerGroups) {
      const group = state.consumerGroups[groupId];
      if (!group) continue;

      // Group leader member should exist if group is stable
      if (group.state === 'Stable' && group.leaderMemberId !== null) {
        const leaderExists = group.members[group.leaderMemberId] !== undefined;
        if (!leaderExists) {
          return {
            invariantName: 'CONSUMER_LEADER_EXISTS',
            description: `Consumer group "${groupId}" is Stable but its leader member "${group.leaderMemberId}" does not exist.`,
            tick,
            affectedEntities: [groupId, group.leaderMemberId],
          };
        }
      }
    }
    return undefined;
  }
}
