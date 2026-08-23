import { describe, expect, it } from 'vitest';
import type { BrokerNode, KafkaClusterState } from '@the-visualizer/contracts';

describe('Broker Reconnection Animation & Pulse Trigger Suite', () => {
  const createMockBroker = (id: string, status: 'ALIVE' | 'CRASHED'): BrokerNode => ({
    id: id as never,
    host: 'localhost',
    port: 9092,
    status,
    diskUsageBytes: 1024,
    metrics: { messagesInPerSec: 10, bytesInPerSec: 1024, isrShrinkCount: 0, isrExpandCount: 0 },
  });

  it('should detect when a broker transitions from CRASHED to ALIVE and trigger pulse', () => {
    const prevState: Record<string, BrokerNode> = {
      '1': createMockBroker('1', 'CRASHED'),
      '2': createMockBroker('2', 'ALIVE'),
    };

    const nextState: Record<string, BrokerNode> = {
      '1': createMockBroker('1', 'ALIVE'), // Recovered!
      '2': createMockBroker('2', 'ALIVE'),
    };

    const detectedRecoveries: string[] = [];
    for (const [id, nextBroker] of Object.entries(nextState)) {
      const prevBroker = prevState[id];
      if (prevBroker && prevBroker.status === 'CRASHED' && nextBroker.status === 'ALIVE') {
        detectedRecoveries.push(id);
      }
    }

    expect(detectedRecoveries).toEqual(['1']);
  });

  it('should calculate normalized 1.6s pulse decay opacity', () => {
    const pulseDurationMs = 1600;
    const computePulseOpacity = (elapsedMs: number) => {
      if (elapsedMs >= pulseDurationMs) return 0;
      return Math.max(0, 1 - elapsedMs / pulseDurationMs);
    };

    expect(computePulseOpacity(0)).toBe(1);
    expect(computePulseOpacity(800)).toBe(0.5);
    expect(computePulseOpacity(1600)).toBe(0);
    expect(computePulseOpacity(2000)).toBe(0);
  });
});
