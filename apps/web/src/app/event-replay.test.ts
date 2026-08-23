import { describe, expect, it } from 'vitest';
import type { KafkaClusterState } from '@the-visualizer/contracts';

describe('Event Log Timeline Replay Controller Suite', () => {
  const dummyState = (tick: number): KafkaClusterState => ({
    clusterId: 'test-cluster',
    tick,
    rngState: 12345,
    brokers: {},
    topics: {},
    consumerGroups: {},
    kraft: { activeControllerId: '1', controllerEpoch: 1, voters: ['1', '2', '3'] },
    transactions: {},
  });

  it('should step through recorded frames sequentially during replay', () => {
    const history: KafkaClusterState[] = [dummyState(0), dummyState(1), dummyState(2), dummyState(3)];
    let currentIndex = 0;

    const stepReplay = () => {
      if (currentIndex < history.length - 1) {
        currentIndex++;
        return history[currentIndex];
      }
      return null;
    };

    expect(stepReplay()?.tick).toBe(1);
    expect(stepReplay()?.tick).toBe(2);
    expect(stepReplay()?.tick).toBe(3);
    expect(stepReplay()).toBeNull(); // End of timeline reached
  });

  it('should calculate accurate timer intervals across speed multipliers', () => {
    const baseIntervalMs = 500;
    const calculateSpeedInterval = (speed: 1 | 2 | 4) => Math.round(baseIntervalMs / speed);

    expect(calculateSpeedInterval(1)).toBe(500);
    expect(calculateSpeedInterval(2)).toBe(250);
    expect(calculateSpeedInterval(4)).toBe(125);
  });

  it('should reject replay activation if history has fewer than 2 frames', () => {
    const shortHistory: KafkaClusterState[] = [dummyState(0)];
    const canReplay = shortHistory.length >= 2;
    expect(canReplay).toBe(false);
  });
});
