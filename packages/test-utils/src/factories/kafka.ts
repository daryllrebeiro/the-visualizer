import type { BrokerNode, KafkaClusterState, TopicPartition } from '@the-visualizer/contracts';

/**
 * Factory functions for building valid Kafka domain objects in tests.
 * All IDs are deterministic by default for reproducible tests.
 */

let brokerCounter = 0;
let partitionCounter = 0;

export function resetFactoryCounters(): void {
  brokerCounter = 0;
  partitionCounter = 0;
}

export function makeBroker(overrides: Partial<BrokerNode> = {}): BrokerNode {
  const id = `broker-${String(++brokerCounter)}` as BrokerNode['id'];
  return {
    id,
    host: `kafka-${id}.local`,
    port: 9092,
    status: 'ALIVE',
    diskUsageBytes: 0,
    maxDiskSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    lastHeartbeatTick: 0,
    ...overrides,
  };
}

export function makePartition(
  topic: string,
  overrides: Partial<TopicPartition> = {},
): TopicPartition {
  const partition = partitionCounter++;
  return {
    topic: topic as TopicPartition['topic'],
    partition: partition as TopicPartition['partition'],
    leaderBrokerId: null,
    leaderEpoch: 0,
    replicas: [],
    isr: [],
    highWatermark: 0,
    minInsyncReplicas: 1,
    uncleanLeaderElectionEnabled: false,
    ...overrides,
  };
}

export function makeClusterState(overrides: Partial<KafkaClusterState> = {}): KafkaClusterState {
  return {
    clusterId: '00000000-0000-0000-0000-000000000001',
    tick: 0,
    rngState: 42,
    brokers: {},
    topics: {},
    consumerGroups: {},
    transactions: {},
    kraft: {
      activeControllerId: null,
      controllerEpoch: 0,
      voters: [],
      metadataOffset: 0,
    },
    ...overrides,
  };
}
