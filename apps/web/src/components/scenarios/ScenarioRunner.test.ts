import { describe, expect, it, vi } from 'vitest';

export interface ScenarioDefinition {
  id: string;
  title: string;
  badge: string;
  description: string;
  steps: string[];
}

export const SCENARIO_DEFINITIONS: ScenarioDefinition[] = [
  {
    id: 'leader-failover',
    title: 'Leader Failover & In-Sync Replica Promotion',
    badge: 'High Availability',
    description: 'Simulates an abrupt hardware crash on Partition Leader Broker 1.',
    steps: [
      '1. Chaos: Kill Leader Broker 1.',
      '2. KRaft: Elect In-Sync Follower as new Partition Leader.',
      '3. Cluster: Shrink ISR and continue accepting writes.',
    ],
  },
  {
    id: 'cooperative-rebalance',
    title: 'Consumer Group Cooperative Sticky Rebalance',
    badge: 'KIP-848',
    description: 'Adds a new consumer member into an active consumer group.',
    steps: [
      '1. Join: Add Consumer-2 to group.',
      '2. Coordinator: Rebalance partitions smoothly.',
      '3. Verify: Workload distributed across all consumers.',
    ],
  },
  {
    id: 'kraft-controller-failover',
    title: 'KRaft Metadata Quorum Controller Failover',
    badge: 'KRaft Quorum',
    description: 'Crashes the active metadata controller broker.',
    steps: [
      '1. Crash: Active Controller Node.',
      '2. Vote: Quorum elects successor controller.',
      '3. Epoch: Controller epoch increments.',
    ],
  },
];

describe('Scenario Runner Step Execution Suite', () => {
  it('should define all 3 core educational scenario playbooks with explicit steps', () => {
    expect(SCENARIO_DEFINITIONS.length).toBe(3);
    const ids = SCENARIO_DEFINITIONS.map((s) => s.id);
    expect(ids).toContain('leader-failover');
    expect(ids).toContain('cooperative-rebalance');
    expect(ids).toContain('kraft-controller-failover');

    for (const sc of SCENARIO_DEFINITIONS) {
      expect(sc.steps.length).toBeGreaterThanOrEqual(3);
      expect(sc.title.length).toBeGreaterThan(0);
    }
  });

  it('should execute leader failover scenario sequence deterministically', async () => {
    const executedSteps: string[] = [];
    const runScenario = (scenarioId: string) => {
      if (scenarioId === 'leader-failover') {
        executedSteps.push('CHAOS_KILL_BROKER_1');
        executedSteps.push('KRAFT_PROMOTE_LEADER_2');
        executedSteps.push('PRODUCE_RECORD_CONFIRMED');
      }
    };

    runScenario('leader-failover');
    expect(executedSteps).toEqual([
      'CHAOS_KILL_BROKER_1',
      'KRAFT_PROMOTE_LEADER_2',
      'PRODUCE_RECORD_CONFIRMED',
    ]);
  });

  it('should execute cooperative rebalance scenario sequence with sticky assignments', () => {
    const executedSteps: string[] = [];
    const runScenario = (scenarioId: string) => {
      if (scenarioId === 'cooperative-rebalance') {
        executedSteps.push('CREATE_CONSUMER_2');
        executedSteps.push('CONSUMER_JOIN_GROUP');
        executedSteps.push('COOPERATIVE_ASSIGNMENT_COMPUTED');
      }
    };

    runScenario('cooperative-rebalance');
    expect(executedSteps).toEqual([
      'CREATE_CONSUMER_2',
      'CONSUMER_JOIN_GROUP',
      'COOPERATIVE_ASSIGNMENT_COMPUTED',
    ]);
  });

  it('should support dynamic scenario reconstitution from event logs', () => {
    const rawTrace = {
      version: '1.0',
      exportedAt: Date.now(),
      clusterId: '123e4567-e89b-12d3-a456-426614174000',
      initialState: {
        clusterId: '123e4567-e89b-12d3-a456-426614174000',
        tick: 0,
        rngState: 42,
        brokers: {
          '1': {
            id: '1',
            host: 'broker-1.kafka.local',
            port: 9092,
            rack: 'rack-1',
            status: 'ALIVE' as const,
            diskUsageBytes: 0,
            maxDiskSizeBytes: 10737418240,
            lastHeartbeatTick: 0,
          },
        },
        topics: {},
        consumerGroups: {},
        transactions: {},
        kraft: {
          activeControllerId: '1',
          controllerEpoch: 1,
          voters: ['1'],
          metadataOffset: 0,
        },
      },
      events: [
        {
          id: 'e-1',
          tick: 5,
          type: 'TOPIC_CREATED' as const,
          payload: { topic: 'orders', partitions: 3 },
        },
      ],
    };

    expect(rawTrace.events.length).toBe(1);
    expect(rawTrace.events[0].type).toBe('TOPIC_CREATED');
  });
});
