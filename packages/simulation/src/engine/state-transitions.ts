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
    case 'BROKER_ADDED':
      handleBrokerAdded(nextState, event);
      break;
    case 'TOPIC_CREATED':
      handleTopicCreated(nextState, event);
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
    case 'REPLICA_LAG_CHECK' as any:
      handleReplicaLagCheck(nextState, event, emittedEvents);
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

    if (status === 'CRASHED') {
      appendMetadataRecord(state, 'FENCE_BROKER_RECORD', { brokerId }, event.tick);
      // If active controller crashed, elect a successor from voters quorum
      triggerKRaftControllerElection(state, brokerId, event.tick, emittedEvents);
      // Trigger partition leadership migration
      triggerLeaderElectionForCrashedBroker(state, brokerId, event.tick, emittedEvents);
    } else if (status === 'ALIVE' || status === 'RECOVERING') {
      appendMetadataRecord(state, 'UNFENCE_BROKER_RECORD', { brokerId }, event.tick);
    }
  }
}

function appendMetadataRecord(
  state: KafkaClusterState,
  type: any,
  data: Record<string, unknown>,
  tick: number,
): void {
  if (!state.kraft.metadataLog) {
    state.kraft.metadataLog = [];
  }
  const offset = state.kraft.metadataOffset ?? state.kraft.metadataLog.length;
  state.kraft.metadataLog.push({
    offset,
    epoch: state.kraft.controllerEpoch,
    type,
    data,
    timestamp: tick,
  });
  state.kraft.metadataOffset = offset + 1;
}

function triggerKRaftControllerElection(
  state: KafkaClusterState,
  crashedBrokerId: string,
  tick: number,
  emittedEvents: SimEvent[],
): void {
  if (state.kraft.activeControllerId !== crashedBrokerId) {
    return;
  }

  const activeVoters = state.kraft.voters.filter(
    (vId) => vId !== crashedBrokerId && state.brokers[vId]?.status === 'ALIVE',
  );

  state.kraft.controllerEpoch += 1;

  if (activeVoters.length > 0) {
    const newControllerId = activeVoters[0]!;
    state.kraft.activeControllerId = newControllerId;

    appendMetadataRecord(
      state,
      'LEADER_CHANGE_RECORD',
      { leaderId: newControllerId, epoch: state.kraft.controllerEpoch },
      tick,
    );

    emittedEvents.push({
      id: `kraft-elect-${String(tick)}`,
      tick,
      type: 'KRAFT_LEADER_ELECTED' as any,
      payload: {
        activeControllerId: newControllerId,
        controllerEpoch: state.kraft.controllerEpoch,
      },
    });
  } else {
    state.kraft.activeControllerId = null;

    emittedEvents.push({
      id: `kraft-quorum-lost-${String(tick)}`,
      tick,
      type: 'KRAFT_LEADER_ELECTED' as any,
      payload: {
        activeControllerId: null,
        controllerEpoch: state.kraft.controllerEpoch,
      },
    });
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
        } else if (partition.uncleanLeaderElectionEnabled) {
          // Unclean leader election: pick any alive replica outside the ISR
          const aliveNonIsr = partition.replicas.find(
            (r) => r.brokerId !== crashedBrokerId && state.brokers[r.brokerId]?.status === 'ALIVE',
          );
          if (aliveNonIsr) {
            partition.leaderBrokerId = aliveNonIsr.brokerId;
            partition.leaderEpoch += 1;
            partition.isr = [aliveNonIsr.brokerId];

            emittedEvents.push({
              id: `unclean-elect-${topicName}-${String(partition.partition)}-${String(tick)}`,
              tick,
              type: 'PARTITION_LEADER_ELECTED',
              payload: {
                topic: topicName,
                partition: partition.partition,
                leaderBrokerId: aliveNonIsr.brokerId,
                leaderEpoch: partition.leaderEpoch,
                unclean: true,
              },
            });

            emittedEvents.push({
              id: `isr-unclean-${topicName}-${String(partition.partition)}-${String(tick)}`,
              tick,
              type: 'ISR_CHANGED',
              payload: {
                topic: topicName,
                partition: partition.partition,
                isr: partition.isr,
                reason: 'Unclean leader election enabled',
              },
            });
          } else {
            partition.leaderBrokerId = null;
            partition.leaderEpoch += 1;
          }
        } else {
          // No active replicas in ISR and unclean election disabled! Partition is offline
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
  // 1. Idempotent Producer Check (KIP-98): reject duplicate sequence numbers
  const producerId = event.payload.producerId as string | undefined;
  const seqNum = event.payload.sequenceNumber as number | undefined;
  if (producerId !== undefined && seqNum !== undefined) {
    const pAny = partition as any;
    pAny.lastProducedSequence ??= {};
    const lastSeq = pAny.lastProducedSequence[producerId];
    if (lastSeq !== undefined && seqNum <= lastSeq) {
      emittedEvents.push({
        id: `dup-${topic}-${String(partitionId)}-${String(event.tick)}`,
        tick: event.tick,
        type: 'RECORD_PRODUCED_DUPLICATE_IGNORED' as any,
        payload: { topic, partition: partitionId, producerId, sequenceNumber: seqNum, lastSeq },
      });
      return;
    }
    pAny.lastProducedSequence[producerId] = seqNum;
  }

  // 2. min.insync.replicas enforcement: block if acks=-1/'all' and |ISR| < minInsyncReplicas
  const acks = event.payload.acks;
  if ((acks === -1 || acks === 'all') && partition.isr.length < (partition.minInsyncReplicas ?? 1)) {
    emittedEvents.push({
      id: `produce-failed-${topic}-${String(partitionId)}-${String(event.tick)}`,
      tick: event.tick,
      type: 'RECORD_PRODUCED_FAILED' as any,
      payload: {
        topic,
        partition: partitionId,
        error: 'NOT_ENOUGH_REPLICAS',
        isrLength: partition.isr.length,
        minInsyncReplicas: partition.minInsyncReplicas,
      },
    });
    return;
  }

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
  let group = state.consumerGroups[groupId];

  // Auto-create group on first join if it doesn't exist
  if (!group) {
    if (event.type !== 'CONSUMER_JOINED') return;
    group = {
      id: groupId as never,
      state: 'Empty',
      protocol: 'range',
      generationId: 0,
      leaderMemberId: null,
      members: {},
      committedOffsets: {},
    };
    state.consumerGroups[groupId] = group;
  }

  if (event.type === 'CONSUMER_JOINED') {
    const memberId = event.payload.memberId as string;
    const clientId = event.payload.clientId as string;
    const topics = (event.payload.topics as string[]) || ['orders'];

    group.members[memberId] = {
      memberId,
      clientId,
      clientHost: '127.0.0.1',
      assignedPartitions: [],
      lastHeartbeatTick: event.tick,
      subscribedTopics: topics,
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
      // Clear all assignments first
      for (const m of membersList) {
        m.assignedPartitions = [];
      }

      // Distribute partitions deterministically per topic
      for (const topic of topics) {
        const parts = state.topics[topic] ?? [];
        const subscribingMembers = membersList.filter(
          (m) => !m.subscribedTopics || m.subscribedTopics.includes(topic)
        );

        if (subscribingMembers.length > 0) {
          const allPartitionsOfTopic = parts.map((p) => ({ topic, partition: p.partition }));
          rng.shuffle(allPartitionsOfTopic);
          for (let i = 0; i < allPartitionsOfTopic.length; i++) {
            const part = allPartitionsOfTopic[i]!;
            const member = subscribingMembers[i % subscribingMembers.length]!;
            member.assignedPartitions.push(part);
          }
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

function handleBrokerAdded(state: any, event: any): void {
  const brokerId = event.payload.brokerId as string;
  const rack = (event.payload.rack as string) || `rack-${String(Object.keys(state.brokers).length)}`;
  if (!state.brokers[brokerId]) {
    state.brokers[brokerId] = {
      id: brokerId,
      rack,
      status: 'ALIVE',
      diskUsageBytes: 0,
      maxDiskSizeBytes: 10 * 1024 * 1024 * 1024,
      lastHeartbeatTick: event.tick,
    };
    // Add to voters list
    if (!state.kraft.voters.includes(brokerId)) {
      state.kraft.voters.push(brokerId);
    }
    appendMetadataRecord(state, 'REGISTER_BROKER_RECORD', { brokerId, rack: rack ?? null }, event.tick);
  }
}

function handleTopicCreated(state: any, event: any): void {
  const topicName = event.payload.topic as string;
  const partitionCount = event.payload.partitions as number;

  if (state.topics[topicName]) return; // Topic already exists

  const aliveBrokers = Object.keys(state.brokers).filter(
    (id) => state.brokers[id]?.status === 'ALIVE',
  );
  if (aliveBrokers.length === 0) return; // No alive brokers to assign

  appendMetadataRecord(state, 'TOPIC_RECORD', { topic: topicName, partitions: partitionCount }, event.tick);

  const partitionsArray: any[] = [];
  for (let p = 0; p < partitionCount; p++) {
    // Round-robin leader assignment
    const leaderIndex = p % aliveBrokers.length;
    const leaderId = aliveBrokers[leaderIndex]!;

    // Replicas: up to 3 brokers if available
    const replicasArray = aliveBrokers.slice(0, 3).map((brokerId) => ({
      brokerId,
      logEndOffset: 0,
      lastCaughtUpTick: event.tick,
      isInSync: true,
    }));

    partitionsArray.push({
      topic: topicName,
      partition: p,
      leaderBrokerId: leaderId,
      leaderEpoch: 1,
      isr: replicasArray.map((r) => r.brokerId),
      replicas: replicasArray,
      highWatermark: 0,
      minInsyncReplicas: 1,
      uncleanLeaderElectionEnabled: false,
    });

    appendMetadataRecord(
      state,
      'PARTITION_RECORD',
      { topic: topicName, partition: p, leader: leaderId, isr: replicasArray.map((r) => r.brokerId) },
      event.tick,
    );
  }

  state.topics[topicName] = partitionsArray;
}

function handleReplicaLagCheck(
  state: KafkaClusterState,
  event: SimEvent,
  emittedEvents: SimEvent[],
): void {
  for (const topicName in state.topics) {
    const partitions = state.topics[topicName];
    if (!partitions) continue;
    for (const partition of partitions) {
      const maxLag = (partition as any).replicaLagTimeMaxTicks ?? 10;
      const newIsr = partition.isr.filter((brokerId) => {
        if (brokerId === partition.leaderBrokerId) return true;
        const replica = partition.replicas.find((r) => r.brokerId === brokerId);
        if (!replica) return false;
        const broker = state.brokers[brokerId];
        if (broker?.status !== 'ALIVE') return false;
        const lagTicks = event.tick - replica.lastCaughtUpTick;
        if (lagTicks > maxLag) {
          replica.isInSync = false;
          return false;
        }
        return true;
      });

      if (newIsr.length !== partition.isr.length) {
        partition.isr = newIsr;
        emittedEvents.push({
          id: `isr-shrink-lag-${topicName}-${String(partition.partition)}-${String(event.tick)}`,
          tick: event.tick,
          type: 'ISR_CHANGED',
          payload: {
            topic: topicName,
            partition: partition.partition,
            isr: partition.isr,
            reason: 'Replica lag exceeded replica.lag.time.max.ms',
          },
        });
      }
    }
  }
}

