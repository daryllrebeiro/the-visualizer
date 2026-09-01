import type {
  KafkaClusterState,
  ScenarioDefinition,
  SimEventLog,
  SimTraceBundle,
} from '../engine/types.js';

export interface ScenarioGeneratorOptions {
  id?: string | undefined;
  title?: string | undefined;
  badge?: string | undefined;
  description?: string | undefined;
  actionLabel?: string | undefined;
  tags?: string[] | undefined;
}

/**
 * ScenarioGenerator — Converts recorded or reconstituted traces into reusable educational scenarios.
 */
export class ScenarioGenerator {
  /**
   * Generates a ScenarioDefinition from a SimTraceBundle.
   */
  public static fromBundle(
    bundle: SimTraceBundle,
    options?: ScenarioGeneratorOptions,
  ): ScenarioDefinition {
    const customTitle = bundle.name && bundle.name !== 'Reconstituted Kafka Simulation Trace' ? bundle.name : undefined;
    return this.fromEventsAndState(bundle.initialState, bundle.events, {
      id: options?.id ?? `scenario-${Date.now()}`,
      title: options?.title ?? customTitle,
      description: options?.description ?? bundle.description,
      ...(options?.badge ? { badge: options.badge } : {}),
      ...(options?.actionLabel ? { actionLabel: options.actionLabel } : {}),
      ...(options?.tags ? { tags: options.tags } : {}),
    });
  }

  /**
   * Generates a ScenarioDefinition from initial state and an event list.
   */
  public static fromEventsAndState(
    initialState: KafkaClusterState,
    events: SimEventLog[],
    options?: ScenarioGeneratorOptions,
  ): ScenarioDefinition {
    const detectedMilestones = this.extractMilestones(events);
    const badge = options?.badge ?? this.inferBadge(events);
    const title = options?.title ?? this.inferTitle(events);
    const description =
      options?.description ??
      `Replayable scenario containing ${events.length} simulated event operations across cluster ${initialState.clusterId}.`;

    const steps =
      detectedMilestones.length > 0
        ? detectedMilestones
        : [`1. Initial State: ${Object.keys(initialState.brokers).length} active brokers.`, `2. Process ${events.length} sequential event transitions.`];

    return {
      id: options?.id ?? `scenario-${Date.now()}`,
      title,
      badge,
      description,
      steps,
      actionLabel: options?.actionLabel ?? '▶ Replay Scenario Trace',
      initialState,
      events,
      tags: options?.tags ?? this.inferTags(events),
    };
  }

  private static extractMilestones(events: SimEventLog[]): string[] {
    const milestones: string[] = [];
    let stepNum = 1;

    for (const ev of events) {
      if (milestones.length >= 6) break; // Limit to 6 key steps for UI readability
      const p = ev.payload as {
        brokerId?: string | undefined;
        status?: string | undefined;
        leaderBrokerId?: string | undefined;
        topic?: string | undefined;
        partition?: number | undefined;
        groupId?: string | undefined;
        memberId?: string | undefined;
        partitions?: number | undefined;
      };

      if (ev.type === 'BROKER_STATUS_CHANGED') {
        milestones.push(
          `${stepNum++}. Chaos: Broker ${p.brokerId ?? ''} transitioned to ${p.status ?? ''} at tick ${String(ev.tick)}.`,
        );
      } else if (ev.type === 'PARTITION_LEADER_ELECTED') {
        milestones.push(
          `${stepNum++}. KRaft: Broker ${p.leaderBrokerId ?? ''} elected leader for ${p.topic ?? ''}-${String(p.partition ?? 0)}.`,
        );
      } else if (ev.type === 'REBALANCE_STARTED' || ev.type === 'CONSUMER_JOINED') {
        milestones.push(
          `${stepNum++}. Consumer: Group ${p.groupId ?? ''} initiated rebalance with member ${p.memberId ?? ''}.`,
        );
      } else if (ev.type === 'TOPIC_CREATED') {
        milestones.push(
          `${stepNum++}. Topic: Created topic '${p.topic ?? ''}' with ${String(p.partitions ?? 1)} partitions.`,
        );
      }
    }

    return milestones;
  }

  private static inferBadge(events: SimEventLog[]): string {
    const types = new Set(events.map((e) => e.type));
    if (types.has('BROKER_STATUS_CHANGED') || types.has('CHAOS_APPLIED')) {
      return 'Chaos & Resilience';
    }
    if (types.has('CONSUMER_JOINED') || types.has('REBALANCE_STARTED')) {
      return 'Consumer Protocol';
    }
    if (types.has('TRANSACTION_STARTED') || types.has('TRANSACTION_COMMITTED')) {
      return 'Exactly-Once Semantics';
    }
    return 'Topology & Flow';
  }

  private static inferTitle(events: SimEventLog[]): string {
    const types = new Set(events.map((e) => e.type));
    if (types.has('BROKER_STATUS_CHANGED')) {
      return 'Broker Fault Recovery & Leader Re-election';
    }
    if (types.has('CONSUMER_JOINED') || types.has('REBALANCE_STARTED')) {
      return 'Dynamic Consumer Group Cooperative Rebalance';
    }
    if (types.has('TRANSACTION_STARTED')) {
      return 'Transactional Two-Phase Commit Processing';
    }
    return 'Sequential Cluster Event Trace';
  }

  private static inferTags(events: SimEventLog[]): string[] {
    const tags = new Set<string>(['kafka', 'reconstitution']);
    for (const ev of events) {
      if (ev.type.startsWith('BROKER')) tags.add('brokers');
      if (ev.type.startsWith('CONSUMER') || ev.type.startsWith('REBALANCE')) tags.add('consumer-groups');
      if (ev.type.startsWith('TRANSACTION')) tags.add('transactions');
      if (ev.type.startsWith('RECORD')) tags.add('records');
    }
    return Array.from(tags);
  }
}
