'use client';

import React, { useState } from 'react';
import type { KafkaClusterState } from '@the-visualizer/contracts';
import { partitionForKey } from '@the-visualizer/simulation';

export type InspectableEntity =
  | { type: 'partition'; topic: string; partition: number }
  | { type: 'broker'; brokerId: string }
  | { type: 'consumer'; memberId: string; groupId: string }
  | { type: 'producer'; producerId: string; topic: string };

interface EntityInspectorProps {
  entity: InspectableEntity | null;
  state: KafkaClusterState | null;
  onClose: () => void;
  onCrashBroker?: ((brokerId: string) => void) | undefined;
  onRecoverBroker?: ((brokerId: string) => void) | undefined;
  onProduceKey?: ((topic: string, key: string, value: string) => void) | undefined;
}

export function EntityInspector({
  entity,
  state,
  onClose,
  onCrashBroker,
  onRecoverBroker,
  onProduceKey,
}: EntityInspectorProps): React.JSX.Element | null {
  const [activeTab, setActiveTab] = useState<'overview' | 'segments' | 'replicas' | 'partitioner'>('overview');
  const [testKey, setTestKey] = useState('user-1001');
  const [testVal, setTestVal] = useState('order_created');

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
            <h2 className="inspector-title">
              {entity.type === 'partition' && `${entity.topic}-${String(entity.partition)}`}
              {entity.type === 'broker' && `Broker Node ${entity.brokerId}`}
              {entity.type === 'consumer' && `Consumer Member ${entity.memberId.substring(0, 12)}...`}
              {entity.type === 'producer' && `Producer Node ${entity.producerId}`}
            </h2>
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
          {/* ── Partition Overview ── */}
          {entity.type === 'partition' && (
            <PartitionContent
              topicName={entity.topic}
              partitionId={entity.partition}
              state={state}
              activeTab={activeTab}
            />
          )}

          {/* ── Broker Overview ── */}
          {entity.type === 'broker' && (
            <BrokerContent
              brokerId={entity.brokerId}
              state={state}
              onCrashBroker={onCrashBroker}
              onRecoverBroker={onRecoverBroker}
            />
          )}

          {/* ── Consumer Overview ── */}
          {entity.type === 'consumer' && (
            <ConsumerContent memberId={entity.memberId} groupId={entity.groupId} state={state} />
          )}

          {/* ── Producer Overview & Partitioner ── */}
          {entity.type === 'producer' && (
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
}: {
  topicName: string;
  partitionId: number;
  state: KafkaClusterState;
  activeTab: string;
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
    </div>
  );
}

function BrokerContent({
  brokerId,
  state,
  onCrashBroker,
  onRecoverBroker,
}: {
  brokerId: string;
  state: KafkaClusterState;
  onCrashBroker?: ((id: string) => void) | undefined;
  onRecoverBroker?: ((id: string) => void) | undefined;
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
      </div>
    </div>
  );
}

function ConsumerContent({
  memberId,
  groupId,
  state,
}: {
  memberId: string;
  groupId: string;
  state: KafkaClusterState;
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
}): React.JSX.Element {
  const partitions = state.topics[topic] ?? [];
  const calculatedPartition = partitionForKey(testKey, partitions.length || 1);

  if (activeTab === 'partitioner') {
    return (
      <div className="inspector-section">
        <h3 className="inspector-section__title">Kafka Murmur2 Key Partitioner Playground</h3>
        <p className="inspector-text-muted">
          Kafka maps messages to partitions using <code>toPositive(murmur2(keyBytes)) % numPartitions</code>.
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

        <div className="partitioner-result-card">
          <div><strong>Computed Partition:</strong> Partition {String(calculatedPartition)} of topic &quot;{topic}&quot;</div>
        </div>

        <button
          onClick={() => onProduceKey?.(topic, testKey, testVal)}
          className="btn btn--indigo btn--full"
        >
          🚀 Dispatch Keyed Record
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
    </div>
  );
}
