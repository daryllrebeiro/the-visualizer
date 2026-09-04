import { describe, expect, it } from 'vitest';

import type { SimEventLog, SimTraceBundle } from '../engine/types.js';
import { EventLogParser, createDefaultBaselineState } from './event-log-parser.js';
import { ScenarioGenerator } from './scenario-generator.js';
import { SimulationReconstitutor } from './simulation-reconstitutor.js';

describe('EventLogParser', () => {
  it('parses a raw array of valid SimEvents and fills in baseline state', () => {
    const rawEvents: SimEventLog[] = [
      {
        id: 'evt-1',
        tick: 10,
        type: 'RECORD_PRODUCED',
        payload: { topic: 'orders', partition: 0, key: 'k1', value: 'v1', acks: 1 },
      },
      {
        id: 'evt-2',
        tick: 20,
        type: 'BROKER_STATUS_CHANGED',
        payload: { brokerId: '2', status: 'CRASHED' },
      },
    ];

    const result = EventLogParser.parse(rawEvents);
    expect(result.events.length).toBe(2);
    expect(result.initialState.brokers['1']).toBeDefined();
    expect(result.metadata?.totalTicks).toBe(20);
  });

  it('parses a full SimTraceBundle correctly', () => {
    const clusterId = '123e4567-e89b-12d3-a456-426614174000';
    const baseline = createDefaultBaselineState(clusterId);
    const bundle: SimTraceBundle = {
      version: '1.0',
      exportedAt: 1700000000000,
      clusterId,
      name: 'Test Trace',
      description: 'A test cluster trace',
      initialState: baseline,
      events: [
        {
          id: 'evt-1',
          tick: 5,
          type: 'TOPIC_CREATED',
          payload: { topic: 'payments', partitions: 3 },
        },
      ],
      metadata: {
        totalTicks: 5,
        totalEvents: 1,
      },
    };

    const result = EventLogParser.parse(JSON.stringify(bundle));
    expect(result.initialState.clusterId).toBe(clusterId);
    expect(result.events.length).toBe(1);
    expect(result.metadata?.name).toBe('Test Trace');
  });

  it('rejects invalid JSON or malformed event records', () => {
    expect(() => EventLogParser.parse('invalid-json{')).toThrow('Failed to parse JSON trace input');
    expect(() => EventLogParser.parse([{ invalid: true }])).toThrow('Invalid event at index 0');
  });
});

describe('SimulationReconstitutor', () => {
  it('reconstitutes cluster state transitions step-by-step deterministically', () => {
    const baseline = createDefaultBaselineState();
    const bundle: SimTraceBundle = {
      version: '1.0',
      exportedAt: Date.now(),
      clusterId: baseline.clusterId,
      initialState: baseline,
      events: [
        {
          id: 'e1',
          tick: 1,
          type: 'RECORD_PRODUCED',
          payload: { topic: 'orders', partition: 0, key: 'order-101', value: 'data', acks: 1 },
        },
        {
          id: 'e2',
          tick: 5,
          type: 'BROKER_STATUS_CHANGED',
          payload: { brokerId: '3', status: 'CRASHED' },
        },
        {
          id: 'e3',
          tick: 10,
          type: 'BROKER_STATUS_CHANGED',
          payload: { brokerId: '3', status: 'ALIVE' },
        },
      ],
    };

    const reconstitutor = new SimulationReconstitutor();
    reconstitutor.loadTrace(bundle);

    expect(reconstitutor.totalSteps).toBe(3);
    expect(reconstitutor.currentStepIndex).toBe(0);

    // Initial state check
    expect(reconstitutor.currentState.brokers['3']?.status).toBe('ALIVE');

    // Step 1: Record produced
    const step1 = reconstitutor.stepForward();
    expect(step1).not.toBeNull();
    expect(step1?.stepIndex).toBe(1);
    expect(step1?.tick).toBe(1);
    expect(step1?.state.topics['orders']?.[0]?.highWatermark).toBe(1);

    // Step 2: Broker 3 crashes
    const step2 = reconstitutor.stepForward();
    expect(step2).not.toBeNull();
    expect(step2?.stepIndex).toBe(2);
    expect(step2?.state.brokers['3']?.status).toBe('CRASHED');

    // Step 3: Broker 3 recovers
    const step3 = reconstitutor.stepForward();
    expect(step3).not.toBeNull();
    expect(step3?.stepIndex).toBe(3);
    expect(step3?.state.brokers['3']?.status).toBe('ALIVE');

    // Reached end
    expect(reconstitutor.stepForward()).toBeNull();
  });

  it('supports bidirectional stepping and random-access seeking with reverse patches', () => {
    const baseline = createDefaultBaselineState();
    const bundle: SimTraceBundle = {
      version: '1.0',
      exportedAt: Date.now(),
      clusterId: baseline.clusterId,
      initialState: baseline,
      events: [
        {
          id: 'e1',
          tick: 1,
          type: 'RECORD_PRODUCED',
          payload: { topic: 'orders', partition: 0, key: '1', value: 'a' },
        },
        {
          id: 'e2',
          tick: 2,
          type: 'RECORD_PRODUCED',
          payload: { topic: 'orders', partition: 0, key: '2', value: 'b' },
        },
        {
          id: 'e3',
          tick: 3,
          type: 'BROKER_STATUS_CHANGED',
          payload: { brokerId: '2', status: 'CRASHED' },
        },
      ],
    };

    const reconstitutor = new SimulationReconstitutor();
    reconstitutor.loadTrace(bundle);

    // Seek to step 3
    reconstitutor.seekToStep(3);
    expect(reconstitutor.currentStepIndex).toBe(3);
    expect(reconstitutor.currentState.brokers['2']?.status).toBe('CRASHED');

    // Step back to step 2
    const back1 = reconstitutor.stepBackward();
    expect(back1?.stepIndex).toBe(2);
    expect(back1?.state.brokers['2']?.status).toBe('ALIVE');
    expect(back1?.state.topics['orders']?.[0]?.highWatermark).toBe(2);

    // Step back to step 0 (initial)
    reconstitutor.stepBackward();
    reconstitutor.stepBackward();
    expect(reconstitutor.currentStepIndex).toBe(0);
    expect(reconstitutor.currentState.topics['orders']?.[0]?.highWatermark).toBe(0);

    // Seek by tick
    reconstitutor.seekToTick(2);
    expect(reconstitutor.currentStepIndex).toBe(2);
  });

  it('exports valid SimTraceBundle and generates ScenarioDefinition playbooks', () => {
    const baseline = createDefaultBaselineState();
    const bundle: SimTraceBundle = {
      version: '1.0',
      exportedAt: Date.now(),
      clusterId: baseline.clusterId,
      initialState: baseline,
      events: [
        {
          id: 'e1',
          tick: 10,
          type: 'BROKER_STATUS_CHANGED',
          payload: { brokerId: '1', status: 'CRASHED' },
        },
      ],
    };

    const reconstitutor = new SimulationReconstitutor();
    reconstitutor.loadTrace(bundle);

    const exported = reconstitutor.exportBundle();
    expect(exported.version).toBe('1.0');
    expect(exported.events.length).toBe(1);

    const scenario = ScenarioGenerator.fromBundle(exported);
    expect(scenario.title).toBe('Broker Fault Recovery & Leader Re-election');
    expect(scenario.badge).toBe('Chaos & Resilience');
    expect(scenario.steps.length).toBeGreaterThan(0);
  });
});
