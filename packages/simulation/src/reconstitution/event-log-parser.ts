import type { KafkaClusterState, SimEventLog, SimTraceBundle } from '../engine/types.js';

export interface ParsedTraceResult {
  initialState: KafkaClusterState;
  events: SimEventLog[];
  metadata?:
    | {
        clusterId: string;
        totalTicks: number;
        totalEvents: number;
        exportedAt?: number | undefined;
        name?: string | undefined;
        description?: string | undefined;
      }
    | undefined;
}

/**
 * Creates a standard baseline 3-broker cluster state if one is not provided in legacy event logs.
 */
export function createDefaultBaselineState(clusterId?: string): KafkaClusterState {
  const cid = clusterId ?? '00000000-0000-0000-0000-000000000001';
  return {
    clusterId: cid,
    tick: 0,
    rngState: 42,
    brokers: {
      '1': {
        id: '1',
        host: 'broker-1.kafka.local',
        port: 9092,
        rack: 'rack-1',
        status: 'ALIVE',
        diskUsageBytes: 0,
        maxDiskSizeBytes: 10_737_418_240, // 10 GB
        lastHeartbeatTick: 0,
      },
      '2': {
        id: '2',
        host: 'broker-2.kafka.local',
        port: 9092,
        rack: 'rack-1',
        status: 'ALIVE',
        diskUsageBytes: 0,
        maxDiskSizeBytes: 10_737_418_240,
        lastHeartbeatTick: 0,
      },
      '3': {
        id: '3',
        host: 'broker-3.kafka.local',
        port: 9092,
        rack: 'rack-2',
        status: 'ALIVE',
        diskUsageBytes: 0,
        maxDiskSizeBytes: 10_737_418_240,
        lastHeartbeatTick: 0,
      },
    },
    topics: {
      orders: [
        {
          topic: 'orders',
          partition: 0,
          leaderBrokerId: '1',
          leaderEpoch: 1,
          replicas: [
            { brokerId: '1', logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
            { brokerId: '2', logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
            { brokerId: '3', logEndOffset: 0, lastCaughtUpTick: 0, isInSync: true },
          ],
          isr: ['1', '2', '3'],
          highWatermark: 0,
          minInsyncReplicas: 2,
          uncleanLeaderElectionEnabled: false,
        },
      ],
    },
    consumerGroups: {},
    transactions: {},
    kraft: {
      activeControllerId: '1',
      controllerEpoch: 1,
      voters: ['1', '2', '3'],
      metadataOffset: 0,
      metadataLog: [],
    },
  };
}

/**
 * EventLogParser — validates, normalizes, and extracts deterministic state traces.
 */
export class EventLogParser {
  /**
   * Ingests a raw JSON string or JS object/array.
   */
  public static parse(input: string | unknown): ParsedTraceResult {
    let raw: unknown;
    if (typeof input === 'string') {
      try {
        raw = JSON.parse(input);
      } catch (err) {
        throw new Error(`Failed to parse JSON trace input: ${(err as Error).message}`);
      }
    } else {
      raw = input;
    }

    if (!raw || typeof raw !== 'object') {
      throw new Error('Trace input must be a valid JSON object or array');
    }

    // Check if input matches full SimTraceBundle
    if (!Array.isArray(raw) && 'initialState' in (raw as Record<string, unknown>)) {
      const bundle = raw as SimTraceBundle;
      if (!bundle.clusterId || typeof bundle.clusterId !== 'string') {
        throw new Error('Invalid SimTraceBundle: missing or invalid clusterId');
      }
      if (!bundle.initialState || typeof bundle.initialState !== 'object') {
        throw new Error('Invalid SimTraceBundle: missing or invalid initialState');
      }
      if (!Array.isArray(bundle.events)) {
        throw new Error('Invalid SimTraceBundle: events must be an array');
      }

      for (let i = 0; i < bundle.events.length; i++) {
        this.validateEventRecord(bundle.events[i], i);
      }

      const sortedEvents = this.normalizeAndSortEvents(bundle.events);
      const lastEv = sortedEvents[sortedEvents.length - 1];
      const maxTick = lastEv ? lastEv.tick : bundle.initialState.tick;

      return {
        initialState: bundle.initialState,
        events: sortedEvents,
        metadata: {
          clusterId: bundle.clusterId,
          totalTicks: bundle.metadata?.totalTicks ?? maxTick,
          totalEvents: bundle.events.length,
          exportedAt: bundle.exportedAt,
          name: bundle.name,
          description: bundle.description,
        },
      };
    }

    // Otherwise, treat as an array of SimEvent / SimEventLog
    const eventArray = Array.isArray(raw) ? raw : (raw as { events?: unknown[] }).events;
    if (!Array.isArray(eventArray)) {
      throw new Error('Trace input is neither a SimTraceBundle nor an array of SimEvents');
    }

    const validatedEvents: SimEventLog[] = [];
    for (let i = 0; i < eventArray.length; i++) {
      const ev = eventArray[i] as SimEventLog;
      this.validateEventRecord(ev, i);
      validatedEvents.push(ev);
    }

    const sortedEvents = this.normalizeAndSortEvents(validatedEvents);
    const baselineState = createDefaultBaselineState();
    const lastEv = sortedEvents[sortedEvents.length - 1];
    const maxTick = lastEv ? lastEv.tick : 0;

    return {
      initialState: baselineState,
      events: sortedEvents,
      metadata: {
        clusterId: baselineState.clusterId,
        totalTicks: maxTick,
        totalEvents: sortedEvents.length,
        exportedAt: Date.now(),
      },
    };
  }

  private static validateEventRecord(ev: unknown, index: number): void {
    if (!ev || typeof ev !== 'object') {
      throw new Error(`Invalid event at index ${index}: expected an object`);
    }
    const e = ev as Record<string, unknown>;
    if (!e['id'] || typeof e['id'] !== 'string') {
      throw new Error(`Invalid event at index ${index}: missing or invalid id`);
    }
    if (typeof e['tick'] !== 'number' || e['tick'] < 0) {
      throw new Error(`Invalid event at index ${index}: tick must be non-negative number`);
    }
    if (!e['type'] || typeof e['type'] !== 'string') {
      throw new Error(`Invalid event at index ${index}: missing or invalid type`);
    }
    if (!e['payload'] || typeof e['payload'] !== 'object') {
      throw new Error(`Invalid event at index ${index}: payload must be an object`);
    }
  }

  /**
   * Sorts events monotonically by tick, preserving original index ordering for co-temporal events.
   */
  private static normalizeAndSortEvents(events: SimEventLog[]): SimEventLog[] {
    return [...events].sort((a, b) => a.tick - b.tick);
  }
}
