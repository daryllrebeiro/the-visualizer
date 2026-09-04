'use client';

import React, { useState } from 'react';

import { EventLogParser, type ParsedTraceResult } from '@the-visualizer/simulation';

interface TraceImportModalProps {
  onLoadTrace: (trace: ParsedTraceResult, rawJson: string) => void;
  onClose: () => void;
}

export function TraceImportModal({
  onLoadTrace,
  onClose,
}: TraceImportModalProps): React.JSX.Element {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<ParsedTraceResult | null>(null);

  const handleValidate = (text: string): void => {
    setJsonText(text);
    setError(null);
    setParsedPreview(null);

    if (!text.trim()) return;

    try {
      const parsed = EventLogParser.parse(text);
      setParsedPreview(parsed);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleValidate(content);
    };
    reader.readAsText(file);
  };

  const handleLoadSample = (): void => {
    const sampleTrace = {
      version: '1.0',
      exportedAt: Date.now(),
      clusterId: '11111111-2222-3333-4444-555555555555',
      name: 'Sample High Availability Trace',
      description: 'Leader broker crash followed by automatic partition failover & ISR shrink',
      initialState: {
        clusterId: '11111111-2222-3333-4444-555555555555',
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
            maxDiskSizeBytes: 10737418240,
            lastHeartbeatTick: 0,
          },
          '2': {
            id: '2',
            host: 'broker-2.kafka.local',
            port: 9092,
            rack: 'rack-1',
            status: 'ALIVE',
            diskUsageBytes: 0,
            maxDiskSizeBytes: 10737418240,
            lastHeartbeatTick: 0,
          },
          '3': {
            id: '3',
            host: 'broker-3.kafka.local',
            port: 9092,
            rack: 'rack-2',
            status: 'ALIVE',
            diskUsageBytes: 0,
            maxDiskSizeBytes: 10737418240,
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
      },
      events: [
        {
          id: 'e-1',
          tick: 5,
          type: 'RECORD_PRODUCED',
          payload: {
            topic: 'orders',
            partition: 0,
            key: 'order-101',
            value: 'item_payload',
            acks: 1,
          },
        },
        {
          id: 'e-2',
          tick: 15,
          type: 'BROKER_STATUS_CHANGED',
          payload: { brokerId: '1', status: 'CRASHED' },
        },
        {
          id: 'e-3',
          tick: 25,
          type: 'RECORD_PRODUCED',
          payload: {
            topic: 'orders',
            partition: 0,
            key: 'order-102',
            value: 'item_payload_2',
            acks: 1,
          },
        },
      ],
      metadata: {
        totalTicks: 25,
        totalEvents: 3,
      },
    };

    const str = JSON.stringify(sampleTrace, null, 2);
    handleValidate(str);
  };

  return (
    <div className="inspector-backdrop" onClick={onClose}>
      <div
        className="scenario-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px' }}
      >
        <header className="scenario-modal__header">
          <div>
            <span className="inspector-badge inspector-badge--primary">RECONSTITUTION ENGINE</span>
            <h2 className="scenario-modal__title">Import Historical Event Trace</h2>
          </div>
          <button onClick={onClose} className="inspector-close-btn" aria-label="Close modal">
            ✕
          </button>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 0' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>
            Ingest a serialized JSON event log (<code>SimTraceBundle</code> or{' '}
            <code>SimEventLog[]</code>) to deterministically reconstitute cluster topology,
            partition offsets, ISR history, and packet flows without requiring a live gateway
            connection.
          </p>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="btn btn--secondary" style={{ cursor: 'pointer', margin: 0 }}>
              📁 Choose JSON File
              <input
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
            </label>
            <button type="button" onClick={handleLoadSample} className="btn btn--outline">
              ⚡ Load Sample Trace
            </button>
          </div>

          <textarea
            value={jsonText}
            onChange={(e) => handleValidate(e.target.value)}
            placeholder="Paste raw SimTraceBundle JSON or SimEventLog array here..."
            rows={8}
            style={{
              width: '100%',
              backgroundColor: '#0f172a',
              color: '#e2e8f0',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              border: error ? '1px solid #f43f5e' : '1px solid #334155',
              borderRadius: '6px',
              padding: '12px',
              resize: 'vertical',
            }}
          />

          {error && (
            <div
              style={{
                backgroundColor: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid #f43f5e',
                borderRadius: '6px',
                padding: '10px 14px',
                color: '#fb7185',
                fontSize: '0.85rem',
              }}
            >
              <strong>Validation Error:</strong> {error}
            </div>
          )}

          {parsedPreview && (
            <div
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '6px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ fontWeight: 600, color: '#4ade80' }}>
                ✓ Trace Validated Successfully
              </div>
              <div style={{ color: '#cbd5e1' }}>
                <strong>Name:</strong> {parsedPreview.metadata?.name ?? 'Kafka Execution Trace'}
              </div>
              <div style={{ color: '#cbd5e1' }}>
                <strong>Total Events:</strong> {parsedPreview.events.length} &nbsp;|&nbsp;{' '}
                <strong>Total Ticks:</strong> {parsedPreview.metadata?.totalTicks ?? 0}{' '}
                &nbsp;|&nbsp; <strong>Brokers:</strong>{' '}
                {Object.keys(parsedPreview.initialState.brokers).length}
              </div>
            </div>
          )}

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}
          >
            <button type="button" onClick={onClose} className="btn btn--outline">
              Cancel
            </button>
            <button
              type="button"
              disabled={!parsedPreview}
              onClick={() => {
                if (parsedPreview) {
                  onLoadTrace(parsedPreview, jsonText);
                  onClose();
                }
              }}
              className="btn btn--primary"
            >
              ▶ Reconstitute & Replay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
