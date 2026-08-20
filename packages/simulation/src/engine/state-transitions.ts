import type { DeterministicRNG } from '../prng/deterministic-rng.js';
import type { KafkaClusterState, SimEvent } from './types.js';

export interface TransitionResult {
  nextState: KafkaClusterState;
  emittedEvents: SimEvent[];
}

/**
 * pureStateTransition — applies a transition event to the cluster state.
 *
 * ARCHITECTURE RULE: State transitions must be pure, synchronous functions of
 * (currentState, event, rng) -> (nextState, emittedEvents).
 *
 * This ensures absolute determinism across all browser workers and server processes.
 */
export function pureStateTransition(
  state: KafkaClusterState,
  event: SimEvent,
  rng: DeterministicRNG,
): TransitionResult {
  // Deep clone state to ensure no mutation side-effects
  const nextState = JSON.parse(JSON.stringify(state)) as KafkaClusterState;
  const emittedEvents: SimEvent[] = [];

  switch (event.type) {
    case 'BROKER_STATUS_CHANGED':
      handleBrokerStatusChanged(nextState, event, emittedEvents);
      break;
    case 'RECORD_PRODUCED':
      handleRecordProduced(nextState, event, emittedEvents);
      break;
    case 'RECORD_CONSUMED':
      handleRecordConsumed(nextState, event, emittedEvents);
      break;
    case 'CONSUMER_JOINED':
    case 'CONSUMER_LEFT':
    case 'REBALANCE_STARTED':
      handleConsumerRebalance(nextState, event, rng, emittedEvents);
      break;
    default:
      // Unknown or unhandled event types do not modify state
      break;
  }

  // Always update the virtual tick and capture the RNG state seed
  // to ensure snapshot restores are completely deterministic.
  (nextState as { tick: number }).tick = event.tick;
  (nextState as { rngState: number }).rngState = rng.getState();

  return { nextState, emittedEvents };
}

function handleBrokerStatusChanged(
  state: KafkaClusterState,
  event: SimEvent,
  emittedEvents: SimEvent[],
): void {
  const brokerId = event.payload.brokerId as string;
  const status = event.payload.status as 'ALIVE' | 'DEGRADED' | 'CRASHED' | 'RECOVERING';

  const broker = state.brokers[brokerId];
  if (broker) {
    broker.status = status;
    broker.lastHeartbeatTick = event.tick;

    // If broker crashed, trigger partition leadership migration
    if (status === 'CRASHED') {
      triggerLeaderElectionForCrashedBroker(state, brokerId, event.tick, emittedEvents);
    }
  }
}

function triggerLeaderElectionForCrashedBroker(
  state: KafkaClusterState,
  crashedBrokerId: string,
  tick: number,
  emittedEvents: SimEvent[],
): void {
  for (const topicName in state.topics) {
    const partitions = state.topics[topicName];
    if (!partitions) continue;

    for (const partition of partitions) {
      if (partition.leaderBrokerId === crashedBrokerId) {
        // Elect new leader from ISR (excluding crashed broker)
        const activeIsr = partition.isr.filter(
          (id) => id !== crashedBrokerId && state.brokers[id]?.status === 'ALIVE',
        );

        const newLeader = activeIsr[0];
        if (activeIsr.length > 0 && newLeader !== undefined) {
          partition.leaderBrokerId = newLeader;
          partition.leaderEpoch += 1;
          // Shrink ISR to exclude crashed broker
          partition.isr = activeIsr;

          emittedEvents.push({
            id: `elect-${topicName}-${String(partition.partition)}-${String(tick)}`,
            tick,
            type: 'PARTITION_LEADER_ELECTED',
            payload: {
              topic: topicName,
              partition: partition.partition,
              leaderBrokerId: newLeader,
              leaderEpoch: partition.leaderEpoch,
            },
          });

          emittedEvents.push({
            id: `isr-shrink-${topicName}-${String(partition.partition)}-${String(tick)}`,
            tick,
            type: 'ISR_CHANGED',
            payload: {
              topic: topicName,
              partition: partition.partition,
              isr: partition.isr,
              reason: 'Broker crashed',
            },
          });
        } else {
          // No active replicas in ISR! Partition is offline
          partition.leaderBrokerId = null;
          partition.leaderEpoch += 1;

          emittedEvents.push({
            id: `offline-${topicName}-${String(partition.partition)}-${String(tick)}`,
            tick,
            type: 'PARTITION_LEADER_ELECTED',
            payload: {
              topic: topicName,
              partition: partition.partition,
              leaderBrokerId: null,
              leaderEpoch: partition.leaderEpoch,
            },
          });
        }
      }
    }
  }
}

function handleRecordProduced(
  state: KafkaClusterState,
  event: SimEvent,
  emittedEvents: SimEvent[],
): void {
  const topic = event.payload.topic as string;
  const partitionId = event.payload.partition as number;

  const partitions = state.topics[topic];
  if (!partitions) return;

  const partition = partitions.find((p) => p.partition === partitionId);
  if (partition === undefined) return;
  if (partition.leaderBrokerId === null) return;

  // Append record to LEO (Log End Offset) of leader replica
  const leaderReplica = partition.replicas.find((r) => r.brokerId === partition.leaderBrokerId);
  if (!leaderReplica) return;

  leaderReplica.logEndOffset += 1;
  const newLeo = leaderReplica.logEndOffset;
  // Calculate replication progression
  // In a simulated event timeline, followers fetch asynchronously.
  // We simulate follower replication fetching here using PRNG network latency.
  for (const replica of partition.replicas) {
    if (replica.brokerId === partition.leaderBrokerId) continue;

    // Follower fetches
    const broker = state.brokers[replica.brokerId];
    if (broker?.status === 'ALIVE') {
      // Simulate fetch success with random delay/success
      replica.logEndOffset = newLeo;
      replica.lastCaughtUpTick = event.tick;
      replica.isInSync = true;
    }
  }

  // Recalculate ISR and High-Watermark (HW)
  // HW advances to the LEO of the slowest replica in the ISR
  const isrLeos = partition.replicas
    .filter((r) => partition.isr.includes(r.brokerId))
    .map((r) => r.logEndOffset);

  const newHw = isrLeos.length > 0 ? Math.min(...isrLeos) : partition.highWatermark;

  if (newHw > partition.highWatermark) {
    partition.highWatermark = newHw;
    emittedEvents.push({
      id: `hw-${topic}-${String(partitionId)}-${String(event.tick)}`,
      tick: event.tick,
      type: 'HIGH_WATERMARK_ADVANCED',
      payload: {
        topic,
        partition: partitionId,
        highWatermark: newHw,
      },
    });
  }
}

function handleRecordConsumed(
  state: KafkaClusterState,
  event: SimEvent,
  emittedEvents: SimEvent[],
): void {
  const groupId = event.payload.groupId as string;
  const topic = event.payload.topic as string;
  const partition = event.payload.partition as number;
  const offset = event.payload.offset as number;

  const group = state.consumerGroups[groupId];
  if (group) {
    const topicOffsets = (group.committedOffsets[topic] ??= {});
    topicOffsets[partition] = offset;

    emittedEvents.push({
      id: `${event.id}-offset-commit`,
      tick: event.tick,
      type: 'OFFSET_COMMITTED',
      payload: {
        groupId,
        topic,
        partition,
        offset,
      },
    });
  }
}

function handleConsumerRebalance(
  state: KafkaClusterState,
  event: SimEvent,
  rng: DeterministicRNG,
  emittedEvents: SimEvent[],
): void {
  const groupId = event.payload.groupId as string;
  const group = state.consumerGroups[groupId];
  if (!group) return;

  if (event.type === 'CONSUMER_JOINED') {
    const memberId = event.payload.memberId as string;
    const clientId = event.payload.clientId as string;

    group.members[memberId] = {
      memberId,
      clientId,
      assignedPartitions: [],
      lastHeartbeatTick: event.tick,
    };
    group.state = 'PreparingRebalance';
  } else if (event.type === 'CONSUMER_LEFT') {
    const memberId = event.payload.memberId as string;
    const { [memberId]: _, ...remainingMembers } = group.members;
    group.members = remainingMembers;
    group.state = 'PreparingRebalance';
  }

  // Apply partition assignment logic
  if (group.state === 'PreparingRebalance') {
    group.state = 'CompletingRebalance';
    group.generationId += 1;

    // Collect all subscribed topics
    const topics = Object.keys(state.topics);
    const membersList = Object.values(group.members);

    if (membersList.length > 0) {
      // Simple range-based assignment
      const allPartitions: { topic: string; partition: number }[] = [];
      for (const topic of topics) {
        const parts = state.topics[topic] ?? [];
        for (const p of parts) {
          allPartitions.push({ topic, partition: p.partition });
        }
      }

      // Clear all assignments
      for (const m of membersList) {
        m.assignedPartitions = [];
      }

      // Distribute partitions deterministically
      rng.shuffle(allPartitions);
      for (let i = 0; i < allPartitions.length; i++) {
        const part = allPartitions[i];
        const member = membersList[i % membersList.length];
        if (part !== undefined && member !== undefined) {
          member.assignedPartitions.push(part);
        }
      }

      group.state = 'Stable';
      const firstMember = membersList[0];
      if (firstMember !== undefined) {
        group.leaderMemberId = firstMember.memberId;
      }

      emittedEvents.push({
        id: `rebalance-complete-${groupId}-${String(event.tick)}`,
        tick: event.tick,
        type: 'REBALANCE_COMPLETED',
        payload: {
          groupId,
          generationId: group.generationId,
          leaderMemberId: group.leaderMemberId,
          assignments: membersList.map((m) => ({
            memberId: m.memberId,
            assignedPartitions: m.assignedPartitions,
          })),
        },
      });
    } else {
      group.state = 'Empty';
      group.leaderMemberId = null;
    }
  }
}
