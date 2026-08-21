'use client';

import React, { useEffect, useRef, useState } from 'react';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import {
  Visualizer,
  type ProducerConfig,
  type ConsumerConfig,
  type HoverDetails,
  type ProduceTrigger,
} from './visualizer';
import { type ConnectionStatus, type EventLogItem, WebSocketClient } from './ws-client';

/* ─── helpers ─── */
function statusDotClass(s: ConnectionStatus): string {
  if (s === 'CONNECTED') return 'status-dot status-dot--connected';
  if (s === 'CONNECTING') return 'status-dot status-dot--connecting';
  return 'status-dot status-dot--disconnected';
}

function statusBadgeClass(s: ConnectionStatus): string {
  if (s === 'CONNECTED') return 'status-badge status-badge--connected';
  if (s === 'CONNECTING') return 'status-badge status-badge--connecting';
  return 'status-badge status-badge--disconnected';
}

function logEntryClass(type: EventLogItem['type']): string {
  return `log-entry log-entry--${type.toLowerCase()}`;
}

function logBadgeClass(type: EventLogItem['type']): string {
  return `log-entry-badge log-entry-badge--${type.toLowerCase()}`;
}

/* ─── stat tile config ─── */
const STAT_TILES = [
  { key: 'tick', label: 'Live Tick', tile: 'stat-tile stat-tile--amber', value: 'stat-tile__value stat-tile__value--amber' },
  { key: 'ctrl', label: 'Controller', tile: 'stat-tile stat-tile--amber', value: 'stat-tile__value stat-tile__value--brown' },
  { key: 'alive', label: 'Alive Brokers', tile: 'stat-tile stat-tile--green', value: 'stat-tile__value stat-tile__value--green' },
  { key: 'crashed', label: 'Crashed Nodes', tile: 'stat-tile stat-tile--rose', value: 'stat-tile__value stat-tile__value--rose' },
] as const;

export default function Page(): React.JSX.Element {
  const [restUrl, setRestUrl] = useState('http://localhost:3000');
  const [wsUrl, setWsUrl] = useState('ws://localhost:3001');
  const [roomId, setRoomId] = useState('room-1');
  const [token, setToken] = useState('');

  const [status, setStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [liveState, setLiveState] = useState<KafkaClusterState | null>(null);
  const [renderedState, setRenderedState] = useState<KafkaClusterState | null>(null);
  const [eventLogs, setEventLogs] = useState<EventLogItem[]>([]);
  const [hoverDetails, setHoverDetails] = useState<HoverDetails | null>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [playbackTick, setPlaybackTick] = useState(0);
  const [stateHistory, setStateHistory] = useState<KafkaClusterState[]>([]);
  const [isHalted, setIsHalted] = useState(false);
  const [haltError, setHaltError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Topic creation state
  const [newTopicName, setNewTopicName] = useState('payments');
  const [newPartitions, setNewPartitions] = useState(3);

  // Producer state & trigger
  const [showAddProducerModal, setShowAddProducerModal] = useState(false);
  const [producerSelectedTopic, setProducerSelectedTopic] = useState('orders');
  const [customProducerTopic, setCustomProducerTopic] = useState('');
  const [produceTrigger, setProduceTrigger] = useState<ProduceTrigger | null>(null);

  const [producers, setProducers] = useState<ProducerConfig[]>([
    { id: 'producer-1', topic: 'orders', autoProduceEnabled: false, autoProduceInterval: 3.0 },
  ]);

  // Consumer state
  const [showAddConsumerModal, setShowAddConsumerModal] = useState(false);
  const [consumerSelectedTopic, setConsumerSelectedTopic] = useState('orders');
  const [consumerSelectedGroup, setConsumerSelectedGroup] = useState('order-processors');
  const [customConsumerGroup, setCustomConsumerGroup] = useState('');

  const [consumers, setConsumers] = useState<ConsumerConfig[]>([
    { id: 'consumer-1', topic: 'orders', groupId: 'order-processors', joined: false, memberId: null },
  ]);

  const clientRef = useRef<WebSocketClient | null>(null);

  useEffect(() => { void handleSandboxLogin(); }, []);

  useEffect(() => {
    if (!liveState) return;
    setStateHistory((prev) => {
      const next = [...prev, JSON.parse(JSON.stringify(liveState)) as KafkaClusterState];
      if (next.length > 500) next.shift();
      return next;
    });
    if (!isPaused) {
      setRenderedState(liveState);
      setPlaybackTick(liveState.tick);
    }
  }, [liveState, isPaused]);

  /* ── connection ── */
  const handleConnect = (): void => {
    if (clientRef.current) clientRef.current.disconnect();
    if (!token) { addLog('Cannot connect: auth token missing.', 'ERROR'); return; }
    setIsHalted(false); setHaltError(null); setStateHistory([]);
    const client = new WebSocketClient(wsUrl, token, roomId, {
      onStateChange: (s) => {
        setLiveState({ ...s });
      },
      onStatusChange: (s) => {
        setStatus(s);
        if (s === 'CONNECTED') {
          // Re-sync any active auto-produce schedules upon connecting
          producers.forEach((p) => {
            if (p.autoProduceEnabled) {
              client.sendIntent('SET_AUTO_PRODUCE', {
                producerId: p.id,
                topic: p.topic,
                intervalSeconds: p.autoProduceInterval ?? 3.0,
                enabled: true,
              });
            }
          });
        }
      },
      onHalt: (e) => { setIsHalted(true); setHaltError(e); },
      onEventLog: (l) => { setEventLogs((p) => [l, ...p].slice(0, 100)); },
    });
    clientRef.current = client;
    client.connect();
  };

  const handleDisconnect = (): void => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setLiveState(null);
    setRenderedState(null);
  };

  const handleSandboxLogin = async (): Promise<void> => {
    setAuthError(null);
    try {
      addLog('Requesting developer credentials...', 'INFO');
      const res = await fetch(`${restUrl}/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@the-visualizer.io', name: 'Sandbox Admin' }),
      });
      if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
      const data = (await res.json()) as { success: boolean; token?: string; user?: unknown };
      const t = data.token;
      if (t) { setToken(t); setAuthReady(true); setAuthError(null); addLog('Credentials loaded — ready to connect.', 'SUCCESS'); }
      else throw new Error('No token in response');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setAuthReady(false);
      setAuthError(msg);
      addLog(`Credentials failed: ${msg}`, 'ERROR');
    }
  };

  const addLog = (message: string, type: EventLogItem['type']): void => {
    setEventLogs((p) => [
      { id: Math.random().toString(36).substring(7), timestamp: Date.now(), message, type },
      ...p,
    ].slice(0, 100));
  };

  /* ── sim actions ── */
  const handleProduceIntent = (producerId?: string): void => {
    if (!liveState || producers.length === 0) return;
    const topicsList = Object.keys(liveState.topics);
    if (topicsList.length === 0) return;

    const targetProd = producerId
      ? producers.find((p) => p.id === producerId)
      : producers[Math.floor(Math.random() * producers.length)];
    if (!targetProd) return;

    const topic = targetProd.topic;
    const finalTopic = topicsList.includes(topic) ? topic : topicsList[0]!;

    const partitions = liveState.topics[finalTopic] || [];
    const partition = partitions.length > 0
      ? partitions[Math.floor(Math.random() * partitions.length)]!.partition
      : 0;

    const activePartition = partitions.find((p) => p.partition === partition);
    const leaderId = activePartition?.leaderBrokerId ?? '1';

    // Trigger visual packet animation immediately on click
    setProduceTrigger({
      id: Math.random().toString(36).substring(7),
      producerId: targetProd.id,
      topic: finalTopic,
      partition,
      timestamp: Date.now(),
    });

    clientRef.current?.sendIntent('PRODUCE', {
      topic: finalTopic,
      partition,
      key: `key-${Math.random().toString(36).substring(7)}`,
      value: `val-${Math.random().toString(36).substring(7)}`,
      acks: 1,
    });
    addLog(`[${targetProd.id}] Dispatched: PRODUCE → ${finalTopic}/p-${String(partition)} (Broker ${leaderId})`, 'INFO');
  };

  const handleProduceAll = (): void => {
    if (!liveState || producers.length === 0) return;
    producers.forEach((prod, idx) => {
      setTimeout(() => {
        handleProduceIntent(prod.id);
      }, idx * 80);
    });
  };

  // Priority 1.1 & 1.2: Confirmed Producer Creation
  const handleConfirmAddProducer = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    let finalTopic = producerSelectedTopic;

    if (producerSelectedTopic === '__NEW__' || producerSelectedTopic === '') {
      if (!customProducerTopic.trim()) return;
      finalTopic = customProducerTopic.trim().toLowerCase();

      if (!liveState?.topics[finalTopic]) {
        clientRef.current?.sendIntent('CREATE_TOPIC', {
          topic: finalTopic,
          partitions: 3,
        });
        addLog(`Registered new topic "${finalTopic}" on cluster (3 partitions)`, 'INFO');
      }
    }

    const newId = `producer-${String(producers.length + 1)}`;
    setProducers((p) => [
      ...p,
      { id: newId, topic: finalTopic, autoProduceEnabled: false, autoProduceInterval: 3.0 },
    ]);
    addLog(`Created Producer Node "${newId}" bound to topic "${finalTopic}"`, 'INFO');
    setShowAddProducerModal(false);
    setCustomProducerTopic('');
  };

  const handleRemoveProducer = (): void => {
    if (producers.length <= 1) {
      addLog('Cannot remove the last remaining producer.', 'WARN');
      return;
    }
    const removed = producers[producers.length - 1]!;
    if (removed.autoProduceEnabled) {
      clientRef.current?.sendIntent('REMOVE_AUTO_PRODUCE', { producerId: removed.id });
    }
    setProducers((p) => p.slice(0, -1));
    addLog(`Removed Producer Node "${removed.id}"`, 'INFO');
  };

  const handleProducerTopicChange = (id: string, newTopic: string): void => {
    setProducers((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          if (p.autoProduceEnabled && connected) {
            clientRef.current?.sendIntent('SET_AUTO_PRODUCE', {
              producerId: id,
              topic: newTopic,
              intervalSeconds: p.autoProduceInterval ?? 3.0,
              enabled: true,
            });
          }
          return { ...p, topic: newTopic };
        }
        return p;
      })
    );
    addLog(`Updated Producer "${id}" target topic to "${newTopic}"`, 'INFO');
  };

  const handleToggleAutoProduce = (id: string): void => {
    setProducers((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const nextEnabled = !p.autoProduceEnabled;
          const interval = p.autoProduceInterval ?? 3.0;
          if (connected) {
            if (nextEnabled) {
              clientRef.current?.sendIntent('SET_AUTO_PRODUCE', {
                producerId: id,
                topic: p.topic,
                intervalSeconds: interval,
                enabled: true,
              });
              addLog(`[${id}] Auto-Produce ACTIVE (every ${interval.toFixed(1)}s)`, 'INFO');
            } else {
              clientRef.current?.sendIntent('SET_AUTO_PRODUCE', {
                producerId: id,
                topic: p.topic,
                intervalSeconds: interval,
                enabled: false,
              });
              clientRef.current?.sendIntent('REMOVE_AUTO_PRODUCE', {
                producerId: id,
              });
              addLog(`[${id}] Auto-Produce STOPPED`, 'INFO');
            }
          }
          return { ...p, autoProduceEnabled: nextEnabled };
        }
        return p;
      })
    );
  };

  const handleAutoProduceIntervalChange = (id: string, intervalSeconds: number): void => {
    const clamped = Math.max(0.5, Math.min(30.0, Number.isFinite(intervalSeconds) ? intervalSeconds : 3.0));
    setProducers((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          if (p.autoProduceEnabled && connected) {
            clientRef.current?.sendIntent('SET_AUTO_PRODUCE', {
              producerId: id,
              topic: p.topic,
              intervalSeconds: clamped,
              enabled: true,
            });
          }
          return { ...p, autoProduceInterval: clamped };
        }
        return p;
      })
    );
  };

  // Confirmed Consumer Creation with Immediate Group Join
  const handleConfirmAddConsumer = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    const newId = `consumer-${String(consumers.length + 1)}`;
    const topic = consumerSelectedTopic || 'orders';
    let groupId = consumerSelectedGroup;
    if (groupId === '__NEW__') {
      if (!customConsumerGroup.trim()) return;
      groupId = customConsumerGroup.trim().toLowerCase();
    }

    // Auto-join to group
    if (connected) {
      clientRef.current?.sendIntent('CONSUMER_JOIN', {
        groupId,
        clientId: newId,
        memberId: newId,
        topics: [topic],
      });
      setConsumers((c) => [...c, { id: newId, topic, groupId, joined: true, memberId: newId }]);
      addLog(`Created & Joined Consumer "${newId}" for topic "${topic}" in group "${groupId}"`, 'INFO');
    } else {
      setConsumers((c) => [...c, { id: newId, topic, groupId, joined: false, memberId: null }]);
      addLog(`Created Consumer "${newId}" configured for topic "${topic}" in group "${groupId}"`, 'INFO');
    }

    setShowAddConsumerModal(false);
    setCustomConsumerGroup('');
  };

  const handleRemoveConsumer = (): void => {
    if (consumers.length <= 1) {
      addLog('Cannot remove the last remaining consumer config.', 'WARN');
      return;
    }
    const removed = consumers[consumers.length - 1]!;
    if (removed.joined && removed.memberId) {
      clientRef.current?.sendIntent('CONSUMER_LEAVE', {
        groupId: removed.groupId,
        memberId: removed.memberId,
      });
    }
    setConsumers((c) => c.slice(0, -1));
    addLog(`Removed Consumer "${removed.id}"`, 'INFO');
  };

  const handleConsumerTopicChange = (id: string, newTopic: string): void => {
    setConsumers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, topic: newTopic } : c))
    );
    addLog(`Updated Consumer "${id}" target topic to "${newTopic}"`, 'INFO');
  };

  const handleConsumerJoinSpecific = (id: string): void => {
    const cConfig = consumers.find((c) => c.id === id);
    if (!cConfig || cConfig.joined) return;

    const memberId = `consumer-${Math.random().toString(36).substring(7)}`;
    clientRef.current?.sendIntent('CONSUMER_JOIN', {
      groupId: cConfig.groupId,
      clientId: id,
      memberId,
      topics: [cConfig.topic],
    });

    setConsumers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, joined: true, memberId } : c))
    );
    addLog(`[${id}] Dispatched: CONSUMER_JOIN on topic "${cConfig.topic}" (group "${cConfig.groupId}")`, 'INFO');
  };

  const handleConsumerLeaveSpecific = (id: string): void => {
    const cConfig = consumers.find((c) => c.id === id);
    if (!cConfig || !cConfig.joined || !cConfig.memberId) return;

    clientRef.current?.sendIntent('CONSUMER_LEAVE', {
      groupId: cConfig.groupId,
      memberId: cConfig.memberId,
    });

    setConsumers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, joined: false, memberId: null } : c))
    );
    addLog(`[${id}] Dispatched: CONSUMER_LEAVE (group "${cConfig.groupId}")`, 'INFO');
  };

  const handleKillBroker = (): void => {
    if (!liveState) return;
    const alive = Object.keys(liveState.brokers).filter((id) => liveState.brokers[id]?.status === 'ALIVE');
    if (!alive.length) return;
    const id = alive[Math.floor(Math.random() * alive.length)];
    if (clientRef.current && id) {
      clientRef.current.sendIntent('CHAOS_KILL_BROKER', { brokerId: id });
      addLog(`Dispatched: CRASH broker ${id}`, 'WARN');
    }
  };

  const handleRecoverBroker = (): void => {
    if (!liveState) return;
    const crashed = Object.keys(liveState.brokers).filter((id) => liveState.brokers[id]?.status === 'CRASHED');
    if (!crashed.length) { addLog('All brokers ALIVE.', 'INFO'); return; }
    const id = crashed[Math.floor(Math.random() * crashed.length)];
    if (clientRef.current && id) {
      clientRef.current.sendIntent('CHAOS_RECOVER_BROKER', { brokerId: id });
      addLog(`Dispatched: RECOVER broker ${id}`, 'INFO');
    }
  };

  const handleAddBroker = (): void => {
    if (!liveState) return;
    const currentCount = Object.keys(liveState.brokers).length;
    const newBrokerId = String(currentCount + 1);
    clientRef.current?.sendIntent('ADD_BROKER', {
      brokerId: newBrokerId,
      rack: `rack-${String.fromCharCode(97 + (currentCount % 3))}`,
    });
    addLog(`Dispatched: ADD_BROKER id "${newBrokerId}"`, 'INFO');
  };

  const handleCreateTopic = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    if (!newTopicName.trim()) return;
    const topic = newTopicName.trim().toLowerCase();
    clientRef.current?.sendIntent('CREATE_TOPIC', {
      topic,
      partitions: newPartitions,
    });
    addLog(`Dispatched: CREATE_TOPIC "${topic}" (${String(newPartitions)} partitions)`, 'INFO');
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const v = parseInt(e.target.value, 10);
    setPlaybackTick(v);
    const s = stateHistory.find((item) => item.tick === v);
    if (s) setRenderedState(s);
  };

  /* ── derived ── */
  const aliveBrokers = Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'ALIVE').length;
  const crashedBrokers = Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'CRASHED').length;
  const connected = status === 'CONNECTED';

  const statValues: Record<string, string> = {
    tick: String(liveState?.tick ?? 0),
    ctrl: liveState?.kraft.activeControllerId ?? 'NONE',
    alive: String(aliveBrokers),
    crashed: String(crashedBrokers),
  };

  const availableTopics = liveState ? Object.keys(liveState.topics) : ['orders'];

  return (
    <div className="app-shell">

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-brand">
          <span className={statusDotClass(status)} />
          <h1 className="header-brand-title">TheVisualizer</h1>
          <span className={statusBadgeClass(status)}>{status}</span>
        </div>

        <div className="header-right">
          <div className="connection-pill">
            <div className="connection-field">
              <span className="connection-field-label">REST Gateway</span>
              <input
                type="text"
                value={restUrl}
                onChange={(e) => setRestUrl(e.target.value)}
                className="connection-field-input"
                style={{ width: 160 }}
              />
            </div>
            <div className="connection-divider" />
            <div className="connection-field">
              <span className="connection-field-label">WS Tunnel</span>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                className="connection-field-input"
                style={{ width: 160 }}
              />
            </div>
            <div className="connection-divider" />
            <div className="connection-field">
              <span className="connection-field-label">Room</span>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="connection-field-input"
                style={{ width: 72 }}
              />
            </div>
          </div>

          <div className="header-actions">
            <button onClick={() => { void handleSandboxLogin(); }} className="btn btn--ghost">
              Auth Dev
            </button>

            {authError
              ? <span className="status-badge status-badge--disconnected" title={authError}>Auth Failed</span>
              : authReady
                ? <span className="status-badge status-badge--connected">Auth Ready</span>
                : <span className="status-badge status-badge--connecting">No Auth</span>
            }

            {connected
              ? <button onClick={handleDisconnect} className="btn btn--rose">Disconnect</button>
              : <button onClick={handleConnect} className="btn btn--emerald" disabled={!authReady}>Connect</button>
            }
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="app-body">

        {/* ── Left Sidebar ── */}
        <aside className="sidebar">

          {/* System Overview */}
          <div className="card card--yellow">
            <p className="card-title card-title--yellow">System Overview</p>
            <div className="stat-grid">
              {STAT_TILES.map((tile) => (
                <div key={tile.key} className={tile.tile}>
                  <span className={tile.value}>{statValues[tile.key]}</span>
                  <span className="stat-tile__label">{tile.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Producers card */}
          <div className="card card--blue">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p className="card-title card-title--blue">Producers ({producers.length})</p>
            </div>
            
            <div className="btn-row">
              <button
                onClick={() => setShowAddProducerModal(true)}
                disabled={!connected || isHalted}
                className="btn btn--primary"
              >
                ➕ Add Producer
              </button>
              <button
                onClick={handleRemoveProducer}
                disabled={!connected || isHalted || producers.length <= 1}
                className="btn btn--ghost"
              >
                ➖ Remove Producer
              </button>
            </div>

            {/* Inline Add Producer Modal */}
            {showAddProducerModal && (
              <form onSubmit={handleConfirmAddProducer} className="form-body" style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <span className="form-label" style={{ fontWeight: 700, color: '#1e40af' }}>Bind Producer to Topic</span>
                <select
                  value={producerSelectedTopic}
                  onChange={(e) => setProducerSelectedTopic(e.target.value)}
                  className="producer-select"
                  style={{ width: '100%', marginBottom: '8px' }}
                >
                  {availableTopics.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="__NEW__">➕ Create New Topic...</option>
                </select>

                {producerSelectedTopic === '__NEW__' && (
                  <input
                    type="text"
                    placeholder="New Topic Name (e.g. analytics)"
                    value={customProducerTopic}
                    onChange={(e) => setCustomProducerTopic(e.target.value)}
                    className="form-input"
                    style={{ marginBottom: '8px' }}
                    required
                  />
                )}

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="submit" className="btn btn--primary" style={{ flex: 1 }}>Confirm</button>
                  <button type="button" onClick={() => setShowAddProducerModal(false)} className="btn btn--ghost">Cancel</button>
                </div>
              </form>
            )}

            <div className="card-divider form-body">
              <span className="form-label" style={{ color: '#1e3a8a', fontWeight: 700 }}>Active Producers</span>
              <div className="producer-list-container">
                {producers.map((prod) => {
                  const partitions = liveState?.topics[prod.topic] || [];
                  const leaderSet = new Set<string>();
                  for (const p of partitions) {
                    if (p.leaderBrokerId && liveState?.brokers[p.leaderBrokerId]?.status === 'ALIVE') {
                      leaderSet.add(p.leaderBrokerId);
                    }
                  }
                  const brokerLabel = leaderSet.size > 0
                    ? `→ ${Array.from(leaderSet).map((b) => `B${b}`).join(',')}`
                    : '→ OFFLINE';

                  const interval = prod.autoProduceInterval ?? 3.0;
                  const rateMsgSec = (1 / interval).toFixed(2);

                  return (
                    <div key={prod.id} className="producer-item-container">
                      <div className="producer-row">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="producer-label">P-{prod.id.substring(9)}</span>
                          <span style={{ fontSize: '7.5px', color: leaderSet.size > 0 ? '#059669' : '#e11d48', fontWeight: 600 }}>
                            {brokerLabel}
                          </span>
                        </div>
                        <select
                          value={prod.topic}
                          onChange={(e) => handleProducerTopicChange(prod.id, e.target.value)}
                          className="producer-select"
                          disabled={!connected || isHalted}
                        >
                          {availableTopics.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleProduceIntent(prod.id)}
                          disabled={!connected || isHalted}
                          className="producer-row-btn"
                          title="Produce Single Message"
                        >
                          ⚡
                        </button>
                        <button
                          onClick={() => handleToggleAutoProduce(prod.id)}
                          disabled={!connected || isHalted}
                          className={`producer-auto-toggle-btn ${prod.autoProduceEnabled ? 'producer-auto-toggle-btn--active' : ''}`}
                          title="Toggle Auto-Produce Cadence"
                        >
                          {prod.autoProduceEnabled ? '⏱ ON' : '⏱ OFF'}
                        </button>
                      </div>

                      {/* Auto-Produce Cadence Slider & Input Drawer */}
                      <div className="producer-auto-drawer">
                        <div className="producer-auto-controls-row">
                          <input
                            type="range"
                            min="0.5"
                            max="30.0"
                            step="0.1"
                            value={interval}
                            onChange={(e) => handleAutoProduceIntervalChange(prod.id, parseFloat(e.target.value))}
                            className="producer-auto-slider"
                            disabled={!connected || isHalted}
                            title={`Auto-produce interval: ${interval.toFixed(1)}s`}
                          />
                          <input
                            type="number"
                            min="0.5"
                            max="30.0"
                            step="0.1"
                            value={interval}
                            onChange={(e) => handleAutoProduceIntervalChange(prod.id, parseFloat(e.target.value))}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              const clamped = Math.max(0.5, Math.min(30.0, Number.isNaN(val) ? 3.0 : val));
                              handleAutoProduceIntervalChange(prod.id, clamped);
                            }}
                            className="producer-auto-number-input"
                            disabled={!connected || isHalted}
                            title="Exact interval in seconds"
                          />
                        </div>
                        <div className="producer-auto-rate-label">
                          <span>every {interval.toFixed(1)}s</span>
                          <span>≈ {rateMsgSec} msg/s</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card-divider btn-row--single">
              <button
                onClick={handleProduceAll}
                disabled={!connected || isHalted || producers.length === 0}
                className="btn btn--primary"
              >
                ⚡ Produce (All)
              </button>
            </div>
          </div>

          {/* Consumers card */}
          <div className="card card--purple">
            <p className="card-title card-title--purple">Consumers ({consumers.length})</p>
            <div className="btn-row">
              <button
                onClick={() => setShowAddConsumerModal(true)}
                disabled={!connected || isHalted}
                className="btn btn--indigo"
              >
                ➕ Add Consumer
              </button>
              <button
                onClick={handleRemoveConsumer}
                disabled={!connected || isHalted || consumers.length <= 1}
                className="btn btn--ghost"
              >
                ➖ Remove Consumer
              </button>
            </div>

            {/* Inline Add Consumer Modal */}
            {showAddConsumerModal && (
              <form onSubmit={handleConfirmAddConsumer} className="form-body" style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                <span className="form-label" style={{ fontWeight: 700, color: '#6b21a8' }}>Select Subscribed Topic</span>
                <select
                  value={consumerSelectedTopic}
                  onChange={(e) => setConsumerSelectedTopic(e.target.value)}
                  className="producer-select"
                  style={{ width: '100%', marginBottom: '8px' }}
                >
                  {availableTopics.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                <span className="form-label" style={{ fontWeight: 700, color: '#6b21a8', marginTop: '4px' }}>Consumer Group</span>
                <select
                  value={consumerSelectedGroup}
                  onChange={(e) => setConsumerSelectedGroup(e.target.value)}
                  className="producer-select"
                  style={{ width: '100%', marginBottom: '8px' }}
                >
                  {[...new Set([
                    ...Object.keys(liveState?.consumerGroups ?? {}),
                    ...consumers.map((c) => c.groupId),
                  ])].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                  <option value="__NEW__">➕ Create New Group...</option>
                </select>

                {consumerSelectedGroup === '__NEW__' && (
                  <input
                    type="text"
                    placeholder="New Group ID (e.g. analytics-consumers)"
                    value={customConsumerGroup}
                    onChange={(e) => setCustomConsumerGroup(e.target.value)}
                    className="form-input"
                    style={{ marginBottom: '8px' }}
                    required
                  />
                )}

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="submit" className="btn btn--indigo" style={{ flex: 1 }}>Confirm</button>
                  <button type="button" onClick={() => setShowAddConsumerModal(false)} className="btn btn--ghost">Cancel</button>
                </div>
              </form>
            )}

            <div className="card-divider form-body">
              <span className="form-label" style={{ color: '#581c87', fontWeight: 700 }}>Consumer Subscriptions</span>
              <div className="producer-list-container">
                {consumers.map((c) => (
                  <div key={c.id} className="producer-row">
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="producer-label" style={{ minWidth: '28px' }}>C-{c.id.substring(9)}</span>
                      <span style={{ fontSize: '7.5px', color: c.joined ? '#059669' : '#64748b', fontWeight: 600 }}>
                        {c.joined ? '● JOINED' : '○ IDLE'}
                      </span>
                      <span style={{ fontSize: '6.5px', color: '#581c87', fontWeight: 700 }}>
                        [{c.groupId.length > 14 ? `${c.groupId.substring(0, 12)}…` : c.groupId}]
                      </span>
                    </div>
                    <select
                      value={c.topic}
                      onChange={(e) => handleConsumerTopicChange(c.id, e.target.value)}
                      className="producer-select"
                      disabled={!connected || isHalted || c.joined}
                    >
                      {availableTopics.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {c.joined ? (
                      <button
                        onClick={() => handleConsumerLeaveSpecific(c.id)}
                        disabled={!connected || isHalted}
                        className="producer-row-btn"
                        style={{ background: '#f43f5e' }}
                        title="Leave Consumer Group"
                      >
                        ❌
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConsumerJoinSpecific(c.id)}
                        disabled={!connected || isHalted}
                        className="producer-row-btn"
                        style={{ background: '#10b981' }}
                        title="Join Consumer Group"
                      >
                        ✔
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chaos Laboratory */}
          <div className="card card--pink">
            <p className="card-title card-title--pink">Chaos Laboratory</p>
            <div className="btn-row">
              <button onClick={handleKillBroker} disabled={!connected || isHalted} className="btn btn--rose">💥 Crash Broker</button>
              <button onClick={handleRecoverBroker} disabled={!connected || isHalted} className="btn btn--emerald">🔧 Recover Broker</button>
            </div>
          </div>

          {/* Cluster Management */}
          <div className="card card--white">
            <p className="card-title card-title--gray">Cluster Management</p>
            <div className="btn-row--single">
              <button onClick={handleAddBroker} disabled={!connected || isHalted} className="btn btn--primary">
                ➕ Add Broker Node
              </button>
            </div>
            <form onSubmit={handleCreateTopic} className="form-body">
              <div className="form-group">
                <span className="form-label">Topic Name</span>
                <input
                  type="text"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <span className="form-label">Partitions</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={newPartitions}
                  onChange={(e) => setNewPartitions(parseInt(e.target.value, 10))}
                  className="form-input"
                  required
                />
              </div>
              <button type="submit" disabled={!connected || isHalted} className="btn btn--indigo">
                📁 Create Topic
              </button>
            </form>
          </div>

          {/* Playback Scrubber */}
          <div className="card card--green card--scrubber-push">
            <p className="card-title card-title--green">Playback Scrubber</p>
            <div className="btn-row--single">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`btn ${isPaused ? 'btn--emerald' : 'btn--ghost'}`}
              >
                {isPaused ? '▶ Resume Stream' : '❚❚ Pause Stream'}
              </button>
            </div>
            {isPaused && stateHistory.length > 1 && (
              <div className="scrubber-body">
                <hr className="scrubber-divider" />
                <div className="scrubber-range-row">
                  <span>Tick {String(stateHistory[0]?.tick ?? 0)}</span>
                  <span>▶ {String(playbackTick)}</span>
                  <span>{String(stateHistory[stateHistory.length - 1]?.tick ?? 0)}</span>
                </div>
                <input
                  type="range"
                  className="scrubber-input"
                  min={stateHistory[0]?.tick ?? 0}
                  max={stateHistory[stateHistory.length - 1]?.tick ?? 0}
                  value={playbackTick}
                  onChange={handleScrubChange}
                />
              </div>
            )}
          </div>
        </aside>

        {/* ── Center Canvas ── */}
        <main className="canvas-panel">
          <Visualizer
            state={renderedState}
            producers={producers}
            consumers={consumers}
            produceTrigger={produceTrigger}
            onHoverDetails={setHoverDetails}
          />
          {hoverDetails && (
            <div className="hover-tooltip">
              <p className="hover-tooltip__title">{hoverDetails.title}</p>
              {hoverDetails.subtitle && <p className="hover-tooltip__subtitle">{hoverDetails.subtitle}</p>}
              <div className="hover-tooltip__stats">
                {hoverDetails.stats.map((s, idx) => (
                  <div key={idx} className="hover-tooltip__stat-row">
                    <span className="hover-tooltip__stat-label">{s.label}:</span>
                    <span className="hover-tooltip__stat-value" style={s.color ? { color: s.color } : undefined}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isPaused && (
            <div className="scrub-badge">❚❚ Scrubbing · Tick {String(playbackTick)}</div>
          )}
        </main>

        {/* ── Right Event Log ── */}
        <aside className="card card--purple log-sidebar">
          <p className="card-title card-title--purple">Event Log Stream</p>
          <div className="log-list">
            {eventLogs.length === 0
              ? <div className="log-empty">No events captured yet</div>
              : eventLogs.map((log) => (
                <div key={log.id} className={logEntryClass(log.type)}>
                  <div className="log-entry-header">
                    <span className="log-entry-time">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={logBadgeClass(log.type)}>{log.type}</span>
                  </div>
                  <p className="log-entry-message">{log.message}</p>
                </div>
              ))
            }
          </div>
        </aside>
      </div>

      {/* ── Halt Banner ── */}
      {isHalted && (
        <div className="halt-banner">
          <span className="halt-banner-text">
            ⚠️ INVARIANT VIOLATION: {haltError ?? 'Protocol Exception'}
          </span>
          <button
            className="halt-banner-reset"
            onClick={() => { setIsHalted(false); setHaltError(null); handleConnect(); }}
          >
            Reset Session
          </button>
        </div>
      )}
    </div>
  );
}
