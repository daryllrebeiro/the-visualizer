import { describe, expect, it } from 'vitest';

import type { EventLogItem } from '../../app/ws-client';
import { type InspectableEntity, getEntityEventLog } from './EntityInspector';

describe('Per-Entity Event Log Filtering (getEntityEventLog)', () => {
  const sampleLogs: EventLogItem[] = [
    {
      id: 'evt-1',
      timestamp: 1000,
      tick: 10,
      message: '[producer-1] Dispatched: PRODUCE → orders/p-0 (Broker 1)',
      type: 'INFO',
      eventType: 'RECORD_PRODUCED',
      involvedEntities: [
        { type: 'producer', id: 'producer-1' },
        { type: 'broker', id: '1' },
        { type: 'partition', id: 'orders-0' },
        { type: 'topic', id: 'orders' },
      ],
      payload: { topic: 'orders', partition: 0, key: 'key-1' },
    },
    {
      id: 'evt-2',
      timestamp: 2000,
      tick: 20,
      message: '💥 Chaos triggered: Crashed Broker Node #2',
      type: 'WARN',
      eventType: 'BROKER_STATUS_CHANGED',
      involvedEntities: [
        { type: 'broker', id: '2' },
        { type: 'controller', id: '1' },
      ],
      payload: { brokerId: '2', nextStatus: 'CRASHED' },
    },
    {
      id: 'evt-3',
      timestamp: 3000,
      tick: 30,
      message:
        '[consumer-1] Dispatched: CONSUMER_JOIN on topic "orders" (group "order-processors")',
      type: 'INFO',
      eventType: 'CONSUMER_JOINED',
      involvedEntities: [
        { type: 'consumer', id: 'consumer-1' },
        { type: 'consumerGroup', id: 'order-processors' },
        { type: 'topic', id: 'orders' },
      ],
      payload: { memberId: 'consumer-1', groupId: 'order-processors' },
    },
    {
      id: 'evt-4',
      timestamp: 4000,
      tick: 40,
      message: '[producer-2] Dispatched: PRODUCE → payments/p-1 (Broker 2)',
      type: 'INFO',
      eventType: 'RECORD_PRODUCED',
      involvedEntities: [
        { type: 'producer', id: 'producer-2' },
        { type: 'broker', id: '2' },
        { type: 'partition', id: 'payments-1' },
        { type: 'topic', id: 'payments' },
      ],
    },
  ];

  it('should correctly filter logs for a specific producer', () => {
    const producerEntity: InspectableEntity = {
      type: 'producer',
      producerId: 'producer-1',
      topic: 'orders',
    };
    const filtered = getEntityEventLog(sampleLogs, producerEntity);

    // Should include evt-1 (produced by producer-1) and evt-3 (matches topic orders), but not producer-2 events
    expect(filtered.some((e) => e.id === 'evt-1')).toBe(true);
    expect(filtered.some((e) => e.id === 'evt-4')).toBe(false);
  });

  it('should correctly filter logs for a specific broker', () => {
    const broker1Entity: InspectableEntity = { type: 'broker', brokerId: '1' };
    const filtered1 = getEntityEventLog(sampleLogs, broker1Entity);
    expect(filtered1.length).toBe(1);
    expect(filtered1[0]?.id).toBe('evt-1');

    const broker2Entity: InspectableEntity = { type: 'broker', brokerId: '2' };
    const filtered2 = getEntityEventLog(sampleLogs, broker2Entity);
    expect(filtered2.length).toBe(2);
    expect(filtered2.map((e) => e.id)).toEqual(['evt-2', 'evt-4']);
  });

  it('should correctly filter logs for a specific partition', () => {
    const partitionEntity: InspectableEntity = { type: 'partition', topic: 'orders', partition: 0 };
    const filtered = getEntityEventLog(sampleLogs, partitionEntity);

    expect(filtered.some((e) => e.id === 'evt-1')).toBe(true);
    expect(filtered.some((e) => e.id === 'evt-4')).toBe(false);
  });

  it('should correctly filter logs for a specific consumer and group', () => {
    const consumerEntity: InspectableEntity = {
      type: 'consumer',
      memberId: 'consumer-1',
      groupId: 'order-processors',
    };
    const filtered = getEntityEventLog(sampleLogs, consumerEntity);

    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe('evt-3');
  });

  it('should handle fallback textual matching when involvedEntities is missing', () => {
    const unannotatedLogs: EventLogItem[] = [
      {
        id: 'legacy-1',
        timestamp: 5000,
        message: 'Dispatched: CRASH broker 3',
        type: 'WARN',
      },
      {
        id: 'legacy-2',
        timestamp: 6000,
        message: 'Producer producer-1 sent message to orders',
        type: 'INFO',
      },
    ];

    const broker3Entity: InspectableEntity = { type: 'broker', brokerId: '3' };
    expect(getEntityEventLog(unannotatedLogs, broker3Entity).length).toBe(1);

    const producerEntity: InspectableEntity = {
      type: 'producer',
      producerId: 'producer-1',
      topic: 'orders',
    };
    expect(getEntityEventLog(unannotatedLogs, producerEntity).length).toBe(1);
  });
});
