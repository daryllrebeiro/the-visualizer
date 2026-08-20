import type { KafkaClusterState } from '@the-visualizer/contracts';

import {
  makeClusterState,
  makeBroker,
  makePartition,
  resetFactoryCounters,
} from '../factories/kafka.js';

/** A minimal 3-broker cluster with one topic, 3 partitions, RF=3 */
export function threeNodeCluster(): KafkaClusterState {
  resetFactoryCounters();

  const b1 = makeBroker({ rack: 'rack-a' });
  const b2 = makeBroker({ rack: 'rack-b' });
  const b3 = makeBroker({ rack: 'rack-c' });

  const p0 = makePartition('orders', {
    leaderBrokerId: b1.id,
    leaderEpoch: 1,
    replicas: [
      { brokerId: b1.id, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
      { brokerId: b2.id, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
      { brokerId: b3.id, logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
    ],
    isr: [b1.id, b2.id, b3.id],
    minInsyncReplicas: 2,
  });

  return makeClusterState({
    brokers: { [b1.id]: b1, [b2.id]: b2, [b3.id]: b3 },
    topics: { orders: [p0] },
    kraft: {
      activeControllerId: b1.id,
      controllerEpoch: 1,
      voters: [b1.id, b2.id, b3.id],
      metadataOffset: 1,
    },
  });
}
