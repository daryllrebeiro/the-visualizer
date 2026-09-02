'use client';

import React, { useMemo, useState } from 'react';
import type { KafkaClusterState } from '@the-visualizer/contracts';
import { kafkaMurmur2, toPositive } from '@the-visualizer/simulation';
import type { EventLogItem } from '../../app/ws-client';
import { VirtualizedEventTimeline } from '../events/VirtualizedEventTimeline';

export type InspectableEntity =
  | { type: 'partition'; topic: string; partition: number }
  | { type: 'broker'; brokerId: string }
  | { type: 'consumer'; memberId: string; groupId: string }
  | { type: 'producer'; producerId: string; topic: string };

export function getEntityEventLog(globalLog: EventLogItem[], entity: InspectableEntity): EventLogItem[] {
  return globalLog.filter((e) => {
    if (e.involvedEntities && e.involvedEntities.length > 0) {
      return e.involvedEntities.some((ref) => {
        if (entity.type === 'producer') {
          return (ref.type === 'producer' && ref.id === entity.producerId) ||
                 (ref.type === 'topic' && ref.id === entity.topic);
        }
        if (entity.type === 'broker') {
          return ref.type === 'broker' && ref.id === entity.brokerId;
        }
        if (entity.type === 'consumer') {
          return (ref.type === 'consumer' && ref.id === entity.memberId) ||
                 (ref.type === 'consumer' && ref.id === entity.groupId) ||
                 (ref.type === 'consumerGroup' && ref.id === entity.groupId);
        }
        if (entity.type === 'partition') {
          return (ref.type === 'partition' && ref.id === `${entity.topic}-${String(entity.partition)}`) ||
                 (ref.type === 'topic' && ref.id === entity.topic);
        }
        return false;
      });
    }

    // Fallback search across log message text if involvedEntities was omitted
    const msg = e.message.toLowerCase();
    if (entity.type === 'producer') {
      return msg.includes(entity.producerId.toLowerCase()) || (msg.includes('producer') && msg.includes(entity.topic.toLowerCase()));
    }
    if (entity.type === 'broker') {
      return msg.includes(`broker ${entity.brokerId}`) || msg.includes(`broker #${entity.brokerId}`) || msg.includes(`broker "${entity.brokerId}"`);
    }
    if (entity.type === 'consumer') {
      return msg.includes(entity.memberId.toLowerCase()) || (msg.includes('consumer') && msg.includes(entity.groupId.toLowerCase()));
    }
    if (entity.type === 'partition') {
      return msg.includes(`${entity.topic}-${String(entity.partition)}`) || (msg.includes(entity.topic) && msg.includes(`p-${String(entity.partition)}`));
    }
    return false;
  });
}

interface EntityInspectorProps {
  entity: InspectableEntity | null;
  state: KafkaClusterState | null;
  eventLogs?: EventLogItem[];
  onClose: () => void;
  onCrashBroker?: ((brokerId: string) => void) | undefined;
  onRecoverBroker?: ((brokerId: string) => void) | undefined;
  onProduceKey?: ((topic: string, key: string, value: string) => void) | undefined;
}

export function EntityInspector({
  entity,
  state,
  eventLogs = [],
  onClose,
  onCrashBroker,
  onRecoverBroker,
  onProduceKey,
}: EntityInspectorProps): React.JSX.Element | null {
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'segments' | 'replicas' | 'partitioner'>('overview');
  const [testKey, setTestKey] = useState('user-1001');
  const [testVal, setTestVal] = useState('order_created');

  const entityTitle = useMemo(() => {
    if (!entity) return '';
    if (entity.type === 'partition') return `Partition ${entity.topic}-${String(entity.partition)}`;
    if (entity.type === 'broker') return `Broker Node ${entity.brokerId}`;
    if (entity.type === 'consumer') return `Consumer ${entity.memberId.substring(0, 12)}...`;
    if (entity.type === 'producer') return `Producer ${entity.producerId}`;
    return '';
  }, [entity]);

  const entityLogs = useMemo(() => {
    if (!entity) return [];
    return getEntityEventLog(eventLogs, entity);
  }, [eventLogs, entity]);

  if (!entity || !state) return null;

  return (
    <div className="inspector-backdrop" onClick={onClose}>
      <aside className="inspector-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <header className="inspector-header">
          <div className="inspector-header__title-row">
            <span className="inspector-badge inspector-badge--primary">
              {entity.type.toUpperCase()}
            </span>
            <h2 className="inspector-title">{entityTitle}</h2>
            <button onClick={onClose} className="inspector-close-btn" aria-label="Close Inspector">
              ✕
            </button>
          </div>

          {/* Navigation Tabs */}
          <nav className="inspector-tabs">
            <button
              className={`inspector-tab ${activeTab === 'overview' ? 'inspector-tab--active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              📊 Overview
            </button>
            <button
              className={`inspector-tab ${activeTab === 'events' ? 'inspector-tab--active' : ''}`}
              onClick={() => setActiveTab('events')}
            >
              📜 Event Log ({entityLogs.length})
            </button>
            {entity.type === 'partition' && (
              <>
                <button
                  className={`inspector-tab ${activeTab === 'segments' ? 'inspector-tab--active' : ''}`}
                  onClick={() => setActiveTab('segments')}
                >
                  📁 Log Segments (.log)
                </button>
                <button
                  className={`inspector-tab ${activeTab === 'replicas' ? 'inspector-tab--active' : ''}`}
                  onClick={() => setActiveTab('replicas')}
                >
                  🔄 ISR & Replicas
                </button>
              </>
            )}
            {entity.type === 'producer' && (
              <button
                className={`inspector-tab ${activeTab === 'partitioner' ? 'inspector-tab--active' : ''}`}
                onClick={() => setActiveTab('partitioner')}
              >
                🧮 Murmur2 Partitioner
              </button>
            )}
          </nav>
        </header>

        {/* Drawer Body */}
        <div className="inspector-body">
          {/* ── Per-Entity Virtualized Event Log View ── */}
          {activeTab === 'events' && (
            <div className="inspector-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 className="inspector-section__title" style={{ margin: 0 }}>
                  Entity Timeline History
                </h3>
                <button
                  onClick={() => setActiveTab('overview')}
                  className="btn btn--ghost"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                >
                  ← Back to Overview
                </button>
              </div>
              <p className="inspector-text-muted" style={{ margin: '0 0 8px 0', fontSize: '11px' }}>
                Real-time chronological timeline filtered specifically for <strong>{entityTitle}</strong>.
              </p>
              <div style={{ flex: 1, minHeight: '380px', display: 'flex' }}>
                <VirtualizedEventTimeline
                  events={entityLogs}
                  entityTitle={entityTitle}
                  emptyMessage={`No events recorded for ${entityTitle} yet. Events will append live as operations occur.`}
                />
              </div>
            </div>
          )}

          {/* ── Partition Overview ── */}
          {activeTab !== 'events' && entity.type === 'partition' && (
            <PartitionContent
              topicName={entity.topic}
              partitionId={entity.partition}
              state={state}
              activeTab={activeTab}
              onViewEvents={() => setActiveTab('events')}
            />
          )}

          {/* ── Broker Overview ── */}
          {activeTab !== 'events' && entity.type === 'broker' && (
            <BrokerContent
              brokerId={entity.brokerId}
              state={state}
              onCrashBroker={onCrashBroker}
              onRecoverBroker={onRecoverBroker}
              onViewEvents={() => setActiveTab('events')}
            />
          )}

          {/* ── Consumer Overview ── */}
          {activeTab !== 'events' && entity.type === 'consumer' && (
            <ConsumerContent
              memberId={entity.memberId}
              groupId={entity.groupId}
              state={state}
              onViewEvents={() => setActiveTab('events')}
            />
          )}

          {/* ── Producer Overview & Partitioner ── */}
          {activeTab !== 'events' && entity.type === 'producer' && (
            <ProducerContent
              producerId={entity.producerId}
              topic={entity.topic}
              state={state}
              activeTab={activeTab}
              testKey={testKey}
              setTestKey={setTestKey}
              testVal={testVal}
              setTestVal={setTestVal}
              onProduceKey={onProduceKey}
              onViewEvents={() => setActiveTab('events')}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function PartitionContent({
  topicName,
  partitionId,
  state,
  activeTab,
  onViewEvents,
}: {
  topicName: string;
  partitionId: number;
  state: KafkaClusterState;
  activeTab: string;
  onViewEvents: () => void;
}): React.JSX.Element {
  const partitions = state.topics[topicName] ?? [];
  const part = partitions.find((p) => p.partition === partitionId);

  if (!part) {
    return <p className="inspector-empty">Partition not found in active cluster state.</p>;
  }

  if (activeTab === 'segments') {
    return (
      <div className="inspector-section">
        <h3 className="inspector-section__title">Physical Log Segments on Disk</h3>
        <p className="inspector-text-muted">
          Kafka partitions are stored on the broker as rolled <code>.log</code> files with sparse <code>.index</code> offsets:
        </p>
        <div className="segment-list">
          <div className="segment-card segment-card--active">
            <div className="segment-card__header">
              <span className="segment-filename">00000000000000000000.log (Active Segment)</span>
              <span className="segment-badge segment-badge--green">OPEN (RW)</span>
            </div>
            <div className="segment-stats-grid">
              <div><strong>Base Offset:</strong> 0</div>
              <div><strong>High Watermark:</strong> {String(part.highWatermark)}</div>
              <div><strong>Estimated Size:</strong> ~{String(part.highWatermark * 128)} Bytes</div>
              <div><strong>Index Entries:</strong> {String(Math.ceil(part.highWatermark / 4))} entries</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'replicas') {
    return (
      <div className="inspector-section">
        <h3 className="inspector-section__title">In-Sync Replicas (ISR) Matrix</h3>
        <table className="inspector-table">
          <thead>
            <tr>
              <th>Broker ID</th>
              <th>Role</th>
              <th>Status</th>
              <th>In-Sync (ISR)?</th>
            </tr>
          </thead>
          <tbody>
            {part.replicas.map((rep) => {
              const isLeader = part.leaderBrokerId === rep.brokerId;
              const isInIsr = part.isr.includes(rep.brokerId);
              const broker = state.brokers[rep.brokerId];
              return (
                <tr key={rep.brokerId}>
                  <td><strong>Broker {rep.brokerId}</strong></td>
                  <td>
                    {isLeader ? (
                      <span className="badge badge--amber">👑 Leader</span>
                    ) : (
                      <span className="badge badge--blue">Follower</span>
                    )}
                  </td>
                  <td>{broker?.status ?? 'UNKNOWN'}</td>
                  <td>
                    {isInIsr ? (
                      <span className="badge badge--green">✓ In-Sync</span>
                    ) : (
                      <span className="badge badge--red">✗ Lagging</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="inspector-section">
      <div className="inspector-stat-grid">
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">Leader Broker</div>
          <div className="inspector-stat-value">Broker {part.leaderBrokerId ?? 'None'}</div>
        </div>
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">Leader Epoch</div>
          <div className="inspector-stat-value">{String(part.leaderEpoch)}</div>
        </div>
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">High Watermark (HW)</div>
          <div className="inspector-stat-value text-blue">{String(part.highWatermark)}</div>
        </div>
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">Min In-Sync Replicas</div>
          <div className="inspector-stat-value">{String(part.minInsyncReplicas)} / {String(part.replicas.length)}</div>
        </div>
      </div>

      <div className="inspector-actions-row" style={{ marginTop: '12px' }}>
        <button onClick={onViewEvents} className="btn btn--indigo btn--full">
          📜 View Partition Event Log
        </button>
      </div>
    </div>
  );
}

function BrokerContent({
  brokerId,
  state,
  onCrashBroker,
  onRecoverBroker,
  onViewEvents,
}: {
  brokerId: string;
  state: KafkaClusterState;
  onCrashBroker?: ((id: string) => void) | undefined;
  onRecoverBroker?: ((id: string) => void) | undefined;
  onViewEvents: () => void;
}): React.JSX.Element {
  const broker = state.brokers[brokerId];
  if (!broker) return <p className="inspector-empty">Broker not found.</p>;

  const isController = state.kraft.activeControllerId === brokerId;
  const isAlive = broker.status === 'ALIVE';

  return (
    <div className="inspector-section">
      <div className="inspector-stat-grid">
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">KRaft Metadata Role</div>
          <div className="inspector-stat-value">
            {isController ? '👑 Active Controller' : 'Voter Broker'}
          </div>
        </div>
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">Broker Status</div>
          <div className={`inspector-stat-value ${isAlive ? 'text-green' : 'text-red'}`}>
            {broker.status}
          </div>
        </div>
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">Host & Port</div>
          <div className="inspector-stat-value">{broker.host}:{String(broker.port)}</div>
        </div>
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">Disk Storage Usage</div>
          <div className="inspector-stat-value">{(broker.diskUsageBytes / 1024).toFixed(1)} KB</div>
        </div>
      </div>

      <div className="inspector-actions-row">
        {isAlive ? (
          <button onClick={() => onCrashBroker?.(brokerId)} className="btn btn--red">
            💥 Simulate Broker Crash
          </button>
        ) : (
          <button onClick={() => onRecoverBroker?.(brokerId)} className="btn btn--emerald">
            🔄 Recover Broker Node
          </button>
        )}
        <button onClick={onViewEvents} className="btn btn--indigo">
          📜 View Broker Event Log
        </button>
      </div>
    </div>
  );
}

function ConsumerContent({
  memberId,
  groupId,
  state,
  onViewEvents,
}: {
  memberId: string;
  groupId: string;
  state: KafkaClusterState;
  onViewEvents: () => void;
}): React.JSX.Element {
  const group = state.consumerGroups[groupId];
  const member = group?.members[memberId];

  if (!group || !member) return <p className="inspector-empty">Consumer member not found.</p>;

  return (
    <div className="inspector-section">
      <div className="inspector-stat-grid">
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">Consumer Group</div>
          <div className="inspector-stat-value">{groupId}</div>
        </div>
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">Group State & Gen</div>
          <div className="inspector-stat-value">{group.state} (Gen {String(group.generationId)})</div>
        </div>
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">Assigned Partitions</div>
          <div className="inspector-stat-value">{String(member.assignedPartitions.length)} partition(s)</div>
        </div>
      </div>

      <h4 className="inspector-subtitle">Assigned Topic Partitions</h4>
      <div className="inspector-tags-row">
        {member.assignedPartitions.map((p, idx) => (
          <span key={idx} className="inspector-badge inspector-badge--primary">
            {p.topic}-p{String(p.partition)}
          </span>
        ))}
      </div>

      <div className="inspector-actions-row" style={{ marginTop: '12px' }}>
        <button onClick={onViewEvents} className="btn btn--indigo btn--full">
          📜 View Consumer Event Log
        </button>
      </div>
    </div>
  );
}

function ProducerContent({
  producerId,
  topic,
  state,
  activeTab,
  testKey,
  setTestKey,
  testVal,
  setTestVal,
  onProduceKey,
  onViewEvents,
}: {
  producerId: string;
  topic: string;
  state: KafkaClusterState;
  activeTab: string;
  testKey: string;
  setTestKey: (k: string) => void;
  testVal: string;
  setTestVal: (v: string) => void;
  onProduceKey?: ((topic: string, key: string, value: string) => void) | undefined;
  onViewEvents: () => void;
}): React.JSX.Element {
  const partitions = state.topics[topic] ?? [];
  const numParts = partitions.length || 1;
  const rawHash = testKey ? kafkaMurmur2(testKey) : 0;
  const posHash = toPositive(rawHash);
  const calculatedPartition = posHash % numParts;
  const keyBytes = typeof window !== 'undefined' && testKey ? Array.from(new TextEncoder().encode(testKey)) : [];

  if (activeTab === 'partitioner') {
    return (
      <div className="inspector-section">
        <h3 className="inspector-section__title">Kafka Murmur2 Key Partitioner Playground</h3>
        <p className="inspector-text-muted">
          Exact Apache Kafka hashing formula: <code>toPositive(murmur2(keyBytes)) % numPartitions</code>.
        </p>

        <div className="form-group">
          <label className="form-label">Message Key</label>
          <input
            type="text"
            className="form-input"
            value={testKey}
            onChange={(e) => setTestKey(e.target.value)}
            placeholder="e.g. user-1001, order-xyz"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Message Value</label>
          <input
            type="text"
            className="form-input"
            value={testVal}
            onChange={(e) => setTestVal(e.target.value)}
            placeholder="e.g. payload data"
          />
        </div>

        {/* Step-by-Step Byte Computation Card */}
        <div style={{ background: '#0f172a', borderRadius: '8px', padding: '12px', border: '1px solid #1e293b', marginTop: '12px', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#94a3b8' }}>
          <div style={{ color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>
            ⚡ Murmur2 Step-by-Step Hash Breakdown
          </div>
          <div>
            <strong>1. UTF-8 Byte Array:</strong>{' '}
            <span style={{ color: '#f1f5f9' }}>
              [{keyBytes.map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(', ') || '0x00'}]
            </span>{' '}
            ({keyBytes.length} bytes)
          </div>
          <div>
            <strong>2. Murmur2 Seed:</strong> <span style={{ color: '#fbbf24' }}>0x9747b28c</span>
          </div>
          <div>
            <strong>3. Signed 32-bit Hash:</strong> <span style={{ color: '#a78bfa' }}>{rawHash}</span> (0x{(rawHash >>> 0).toString(16).padStart(8, '0')})
          </div>
          <div>
            <strong>4. Positive Unsigned Hash:</strong> <span style={{ color: '#34d399' }}>{posHash}</span> (hash & 0x7fffffff)
          </div>
          <div style={{ borderTop: '1px dashed #334155', paddingTop: '6px', marginTop: '6px', color: '#f8fafc', fontWeight: 600 }}>
            <strong>5. Target Partition:</strong> {posHash} % {numParts} = <span style={{ color: '#38bdf8', fontSize: '13px' }}>Partition {calculatedPartition}</span>
          </div>
        </div>

        <button
          onClick={() => onProduceKey?.(topic, testKey, testVal)}
          className="btn btn--indigo btn--full"
          style={{ marginTop: '14px' }}
        >
          🚀 Dispatch Keyed Record to Partition {calculatedPartition}
        </button>
      </div>
    );
  }

  return (
    <div className="inspector-section">
      <div className="inspector-stat-grid">
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">Producer ID</div>
          <div className="inspector-stat-value">{producerId}</div>
        </div>
        <div className="inspector-stat-card">
          <div className="inspector-stat-label">Bound Target Topic</div>
          <div className="inspector-stat-value">{topic}</div>
        </div>
      </div>

      <div className="inspector-actions-row" style={{ marginTop: '12px' }}>
        <button onClick={onViewEvents} className="btn btn--indigo btn--full">
          📜 View Producer Event Log
        </button>
      </div>
    </div>
  );
}
