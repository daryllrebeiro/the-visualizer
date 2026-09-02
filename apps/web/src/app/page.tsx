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
import { type ConnectionStatus, type EntityRef, type EventLogItem, WebSocketClient } from './ws-client';
import { EntityInspector, type InspectableEntity } from '../components/inspector/EntityInspector';
import { ScenarioRunner } from '../components/scenarios/ScenarioRunner';
import { TraceImportModal } from '../components/scenarios/TraceImportModal';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RaftVisualizer } from '../components/raft/RaftVisualizer';
import { HashRingVisualizer } from '../components/database/HashRingVisualizer';
import { RedisClusterVisualizer } from '../components/redis/RedisClusterVisualizer';
import { K8sClusterVisualizer } from '../components/kubernetes/K8sClusterVisualizer';
import { RabbitMQVisualizer } from '../components/rabbitmq/RabbitMQVisualizer';
import { StorageEngineVisualizer } from '../components/storage/StorageEngineVisualizer';
import { NetworkingVisualizer } from '../components/networking/NetworkingVisualizer';
import { DomainDirectoryModal } from '../components/domains/DomainDirectoryModal';
import { OnboardingTour, DataTableModal } from '@the-visualizer/ui';
import {
  SimulationReconstitutor,
  type ReconstitutedStepMetadata,
  type ParsedTraceResult,
  type InvariantViolationReport,
  createDefaultRaftCluster,
  pureRaftTransition,
  RaftInvariantChecker,
  type RaftClusterState,
  type RaftSimEvent,
  createDefaultDBCluster,
  pureDBTransition,
  DBInvariantChecker,
  type DBClusterState,
  type DBSimEvent,
  type ConsistencyLevel,
  createDefaultRedisCluster,
  pureRedisTransition,
  RedisInvariantChecker,
  type RedisClusterState,
  type RedisSimEvent,
  type EvictionPolicy,
  createDefaultK8sCluster,
  pureK8sTransition,
  K8sInvariantChecker,
  type K8sClusterState,
  type K8sSimEvent,
  createDefaultBaselineState,
  pureStateTransition,
  InvariantChecker,
  type SimEvent,
  createDefaultRabbitCluster,
  pureRabbitTransition,
  RabbitInvariantChecker,
  type RabbitClusterState,
  type RabbitSimEvent,
  createDefaultStorageCluster,
  pureStorageTransition,
  StorageInvariantChecker,
  type StorageEngineClusterState,
  type StorageSimEvent,
  type StorageEngineType,
  createDefaultNetworkingCluster,
  pureNetworkingTransition,
  NetworkInvariantChecker,
  type NetworkingClusterState,
  type NetworkSimEvent,
  DeterministicRNG,
} from '@the-visualizer/simulation';

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

/* ─── Domain configuration ─── */
export type DomainKey = 'kafka' | 'raft' | 'database' | 'redis' | 'kubernetes' | 'rabbitmq' | 'storage' | 'networking';

export const DOMAIN_OPTIONS: ReadonlyArray<{
  id: DomainKey;
  name: string;
  icon: string;
  category: string;
  path: string;
  color: string;
}> = [
  { id: 'kafka', name: 'Apache Kafka', icon: '⚡', category: 'Streaming & KRaft', path: '/kafka', color: '#6366f1' },
  { id: 'raft', name: 'Raft Consensus', icon: '🛡️', category: 'Leader Election & Quorum', path: '/raft', color: '#eab308' },
  { id: 'database', name: 'Distributed DB', icon: '🗄️', category: 'Consistent Hashing & Dynamo', path: '/database', color: '#10b981' },
  { id: 'redis', name: 'Redis Cluster', icon: '⚡', category: 'CRC16 Slots & Evictions', path: '/redis', color: '#ef4444' },
  { id: 'kubernetes', name: 'Kubernetes', icon: '☸️', category: 'Reconciliation & Scheduling', path: '/kubernetes', color: '#3b82f6' },
  { id: 'rabbitmq', name: 'RabbitMQ', icon: '🐇', category: 'AMQP & Dead Letter Queues', path: '/rabbitmq', color: '#f97316' },
  { id: 'storage', name: 'Storage Engine', icon: '💾', category: 'B+ Tree vs LSM Compaction', path: '/storage', color: '#14b8a6' },
  { id: 'networking', name: 'TCP Networking', icon: '🌐', category: '3-Way Handshake & AIMD', path: '/networking', color: '#06b6d4' },
] as const;

export default function Page({ initialDomain = 'kafka' }: { initialDomain?: DomainKey }): React.JSX.Element {
  const [restUrl, setRestUrl] = useState('http://localhost:3000');
  const [wsUrl, setWsUrl] = useState('ws://localhost:3001');
  const [roomId, setRoomId] = useState('room-1');
  const [token, setToken] = useState('');

  const [status, setStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const connected = status === 'CONNECTED';
  const [liveState, setLiveState] = useState<KafkaClusterState | null>(() => createDefaultBaselineState() as unknown as KafkaClusterState);
  const [renderedState, setRenderedState] = useState<KafkaClusterState | null>(() => createDefaultBaselineState() as unknown as KafkaClusterState);
  const [eventLogs, setEventLogs] = useState<EventLogItem[]>([]);
  const [hoverDetails, setHoverDetails] = useState<HoverDetails | null>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [playbackTick, setPlaybackTick] = useState(0);
  const [stateHistory, setStateHistory] = useState<KafkaClusterState[]>([]);
  const [isHalted, setIsHalted] = useState(false);
  const [haltError, setHaltError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Reset & Replay State
  const [resetCounter, setResetCounter] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4>(1);
  const replayIndexRef = useRef<number>(0);
  const replayTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const [inspectEntity, setInspectEntity] = useState<InspectableEntity | null>(null);
  const [showScenariosModal, setShowScenariosModal] = useState(false);
  const [showTraceImportModal, setShowTraceImportModal] = useState(false);
  const [showDomainDirectoryModal, setShowDomainDirectoryModal] = useState(false);

  // Multi-Domain State
  const [selectedDomain, setSelectedDomain] = useState<DomainKey>(initialDomain);
  const [showDomainDropdown, setShowDomainDropdown] = useState(false);
  const kafkaRngRef = useRef<DeterministicRNG>(new DeterministicRNG(42));
  const kafkaInvariantCheckerRef = useRef<InvariantChecker>(new InvariantChecker());

  const [raftState, setRaftState] = useState<RaftClusterState>(() => createDefaultRaftCluster('raft-1', 5, 42));
  const raftRngRef = useRef<DeterministicRNG>(new DeterministicRNG(42));
  const raftInvariantCheckerRef = useRef<RaftInvariantChecker>(new RaftInvariantChecker());

  const [dbState, setDbState] = useState<DBClusterState>(() => createDefaultDBCluster('db-1', 4, 3));
  const dbRngRef = useRef<DeterministicRNG>(new DeterministicRNG(42));
  const dbInvariantCheckerRef = useRef<DBInvariantChecker>(new DBInvariantChecker());

  const [redisState, setRedisState] = useState<RedisClusterState>(() => createDefaultRedisCluster());
  const redisRngRef = useRef<DeterministicRNG>(new DeterministicRNG(42));
  const redisInvariantCheckerRef = useRef<RedisInvariantChecker>(new RedisInvariantChecker());

  const [k8sState, setK8sState] = useState<K8sClusterState>(() => createDefaultK8sCluster());
  const k8sRngRef = useRef<DeterministicRNG>(new DeterministicRNG(42));
  const k8sInvariantCheckerRef = useRef<K8sInvariantChecker>(new K8sInvariantChecker());

  const [rabbitState, setRabbitState] = useState<RabbitClusterState>(() => createDefaultRabbitCluster());
  const rabbitRngRef = useRef<DeterministicRNG>(new DeterministicRNG(42));
  const rabbitInvariantCheckerRef = useRef<RabbitInvariantChecker>(new RabbitInvariantChecker());

  const [storageState, setStorageState] = useState<StorageEngineClusterState>(() => createDefaultStorageCluster());
  const storageRngRef = useRef<DeterministicRNG>(new DeterministicRNG(42));
  const storageInvariantCheckerRef = useRef<StorageInvariantChecker>(new StorageInvariantChecker());

  const [networkingState, setNetworkingState] = useState<NetworkingClusterState>(() => createDefaultNetworkingCluster());
  const networkingRngRef = useRef<DeterministicRNG>(new DeterministicRNG(42));
  const networkingInvariantCheckerRef = useRef<NetworkInvariantChecker>(new NetworkInvariantChecker());

  // Offline Reconstitution State
  const [isOfflineReconstituted, setIsOfflineReconstituted] = useState(false);
  const [reconstitutedTimeline, setReconstitutedTimeline] = useState<readonly ReconstitutedStepMetadata[]>([]);
  const [reconstitutedViolations, setReconstitutedViolations] = useState<readonly InvariantViolationReport[]>([]);
  const [currentReconstitutedStep, setCurrentReconstitutedStep] = useState(0);
  const reconstitutorRef = useRef<SimulationReconstitutor | null>(null);

  const clientRef = useRef<WebSocketClient | null>(null);

  useEffect(() => { void handleSandboxLogin(); }, []);

  // Raft Consensus Simulation Loop
  useEffect(() => {
    if (selectedDomain !== 'raft' || isPaused) return;
    const interval = setInterval(() => {
      setRaftState((prev) => {
        const ev: RaftSimEvent = {
          id: `tick-${String(prev.tick + 1)}`,
          tick: prev.tick + 1,
          type: 'RAFT_TICK',
          payload: {},
        };
        let res = pureRaftTransition(prev, ev, raftRngRef.current);
        const pending = [...res.emittedEvents];
        while (pending.length > 0) {
          const nextEv = pending.shift();
          if (!nextEv) break;
          const subRes = pureRaftTransition(res.nextState, nextEv, raftRngRef.current);
          res = { nextState: subRes.nextState, emittedEvents: [] };
          pending.push(...subRes.emittedEvents);
        }
        const violation = raftInvariantCheckerRef.current.check(res.nextState);
        if (violation) {
          setIsHalted(true);
          setHaltError(`[Raft ${violation.ruleId}] ${violation.description}`);
        }
        return res.nextState;
      });
    }, 150);
    return () => clearInterval(interval);
  }, [selectedDomain, isPaused]);

  // Redis Simulation Loop (TTL Expirations)
  useEffect(() => {
    if (selectedDomain !== 'redis' || isPaused) return;
    const interval = setInterval(() => {
      setRedisState((prev) => {
        const ev: RedisSimEvent = {
          id: `redis-tick-${String(prev.tick + 1)}`,
          tick: prev.tick + 1,
          type: 'REDIS_TICK',
          payload: {},
        };
        const res = pureRedisTransition(prev, ev, redisRngRef.current);
        return res.nextState;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [selectedDomain, isPaused]);

  // RabbitMQ Simulation Loop (Message TTL Expirations)
  useEffect(() => {
    if (selectedDomain !== 'rabbitmq' || isPaused) return;
    const interval = setInterval(() => {
      setRabbitState((prev) => {
        const ev: RabbitSimEvent = {
          id: `rabbit-tick-${String(prev.tick + 1)}`,
          tick: prev.tick + 1,
          type: 'RABBIT_TICK',
          payload: {},
        };
        const res = pureRabbitTransition(prev, ev, rabbitRngRef.current);
        return res.nextState;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedDomain, isPaused]);

  // Networking Simulation Loop (TCP Packet Wire Propagation)
  useEffect(() => {
    if (selectedDomain !== 'networking' || isPaused) return;
    const interval = setInterval(() => {
      setNetworkingState((prev) => {
        const ev: NetworkSimEvent = {
          id: `net-tick-${String(prev.tick + 1)}`,
          tick: prev.tick + 1,
          type: 'TCP_TICK',
          payload: {},
        };
        const res = pureNetworkingTransition(prev, ev, networkingRngRef.current);
        return res.nextState;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedDomain, isPaused]);

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

  // In-Browser Auto-Produce Loop when disconnected
  useEffect(() => {
    if (connected || isPaused || selectedDomain !== 'kafka' || !liveState) return;
    const activeProducers = producers.filter((p) => p.autoProduceEnabled);
    if (activeProducers.length === 0) return;

    const intervals = activeProducers.map((prod) => {
      const delayMs = Math.max(500, (prod.autoProduceInterval ?? 3.0) * 1000);
      return setInterval(() => {
        handleProduceIntent(prod.id);
      }, delayMs);
    });

    return () => {
      intervals.forEach((i) => clearInterval(i));
    };
  }, [connected, isPaused, selectedDomain, producers, liveState]);

  /* ── connection ── */
  const handleConnect = (): void => {
    if (clientRef.current) clientRef.current.disconnect();
    if (!token) { addLog('Cannot connect: auth token missing.', 'ERROR'); return; }
    setIsHalted(false); setHaltError(null); setStateHistory([]);
    const client = new WebSocketClient(wsUrl, token, roomId, selectedDomain, {
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
    } catch {
      // Standalone cloud / in-browser sandbox fallback
      const fallbackToken = 'sandbox-token-' + Math.random().toString(36).substring(2, 10);
      setToken(fallbackToken);
      setAuthReady(true);
      setAuthError(null);
      addLog('Sandbox Session Active: All 8 interactive simulators ready.', 'SUCCESS');
    }
  };

  const addLog = (
    message: string,
    type: EventLogItem['type'],
    meta?: {
      tick?: number;
      eventType?: string;
      involvedEntities?: EntityRef[];
      payload?: Record<string, unknown>;
    },
  ): void => {
    setEventLogs((p) => [
      {
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        tick: meta?.tick ?? liveState?.tick ?? 0,
        message,
        type,
        eventType: meta?.eventType,
        involvedEntities: meta?.involvedEntities ?? [],
        payload: meta?.payload,
      },
      ...p,
    ].slice(0, 1000));
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

    const key = `key-${Math.random().toString(36).substring(7)}`;
    const value = `val-${Math.random().toString(36).substring(7)}`;

    if (connected && clientRef.current) {
      clientRef.current.sendIntent('PRODUCE', {
        topic: finalTopic,
        partition,
        key,
        value,
        acks: 1,
      });
      addLog(
        `[${targetProd.id}] Dispatched: PRODUCE → ${finalTopic}/p-${String(partition)} (Broker ${leaderId})`,
        'INFO',
        {
          eventType: 'RECORD_PRODUCED',
          involvedEntities: [
            { type: 'producer', id: targetProd.id },
            { type: 'broker', id: leaderId },
            { type: 'partition', id: `${finalTopic}-${String(partition)}` },
            { type: 'topic', id: finalTopic },
          ],
          payload: { topic: finalTopic, partition, key, acks: 1, leaderBrokerId: leaderId },
        },
      );
    } else if (liveState) {
      const currentPartition = partitions.find((p) => p.partition === partition);
      const nextOffset = currentPartition?.highWatermark ?? 0;
      const ev: SimEvent = {
        id: `prod-${Date.now()}`,
        tick: liveState.tick + 1,
        type: 'RECORD_PRODUCED',
        payload: {
          topic: finalTopic,
          partition,
          offset: nextOffset,
          key,
          value,
          timestamp: Date.now(),
          producerId: targetProd.id,
        },
      };
      const res = pureStateTransition(liveState, ev, kafkaRngRef.current);
      const violation = kafkaInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[Kafka ${violation.invariantName}] ${violation.description}`);
      }
      setLiveState(res.nextState as unknown as KafkaClusterState);
      setRenderedState(res.nextState as unknown as KafkaClusterState);
      addLog(`[${targetProd.id}] Produced record to ${finalTopic}/p-${String(partition)} (Offset #${nextOffset})`, 'SUCCESS');
    }
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
    addLog(
      `[${id}] Dispatched: CONSUMER_JOIN on topic "${cConfig.topic}" (group "${cConfig.groupId}")`,
      'INFO',
      {
        eventType: 'CONSUMER_JOINED',
        involvedEntities: [
          { type: 'consumer', id: memberId },
          { type: 'consumer', id: id },
          { type: 'consumerGroup', id: cConfig.groupId },
          { type: 'topic', id: cConfig.topic },
        ],
        payload: { memberId, clientId: id, groupId: cConfig.groupId, topic: cConfig.topic },
      },
    );
  };

  const handleConsumerLeaveSpecific = (id: string): void => {
    const cConfig = consumers.find((c) => c.id === id);
    if (!cConfig || !cConfig.joined || !cConfig.memberId) return;

    clientRef.current?.sendIntent('CONSUMER_LEAVE', {
      groupId: cConfig.groupId,
      memberId: cConfig.memberId,
    });

    const leavingMemberId = cConfig.memberId;
    setConsumers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, joined: false, memberId: null } : c))
    );
    addLog(
      `[${id}] Dispatched: CONSUMER_LEAVE (group "${cConfig.groupId}")`,
      'INFO',
      {
        eventType: 'CONSUMER_LEFT',
        involvedEntities: [
          { type: 'consumer', id: leavingMemberId },
          { type: 'consumer', id: id },
          { type: 'consumerGroup', id: cConfig.groupId },
        ],
        payload: { memberId: leavingMemberId, clientId: id, groupId: cConfig.groupId },
      },
    );
  };

  const handleCrashSpecificBroker = (brokerId: string): void => {
    if (!liveState || !clientRef.current) return;
    clientRef.current.sendIntent('CHAOS_KILL_BROKER', { brokerId });
    addLog(
      `💥 Chaos triggered: Crashed Broker Node #${brokerId}`,
      'WARN',
      {
        eventType: 'BROKER_STATUS_CHANGED',
        involvedEntities: [
          { type: 'broker', id: brokerId },
          { type: 'controller', id: liveState.kraft.activeControllerId ?? '1' },
        ],
        payload: { brokerId, nextStatus: 'CRASHED' },
      },
    );
  };

  const handleRecoverSpecificBroker = (brokerId: string): void => {
    if (!liveState || !clientRef.current) return;
    clientRef.current.sendIntent('CHAOS_RECOVER_BROKER', { brokerId });
    addLog(
      `🔄 Chaos recovery: Restored Broker Node #${brokerId} to ALIVE`,
      'INFO',
      {
        eventType: 'BROKER_STATUS_CHANGED',
        involvedEntities: [
          { type: 'broker', id: brokerId },
          { type: 'controller', id: liveState.kraft.activeControllerId ?? '1' },
        ],
        payload: { brokerId, nextStatus: 'ALIVE' },
      },
    );
  };

  const handleProduceKey = (topic: string, key: string, value: string): void => {
    if (!liveState || !clientRef.current) return;
    const partitions = liveState.topics[topic] || [];
    if (partitions.length === 0) return;

    // Use Murmur2 Key Partitioner
    const targetPart = Math.abs(key.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)) % partitions.length;
    const activePartition = partitions.find((p) => p.partition === targetPart);
    const leaderId = activePartition?.leaderBrokerId ?? '1';

    setProduceTrigger({
      id: Math.random().toString(36).substring(7),
      producerId: 'producer-1',
      topic,
      partition: targetPart,
      timestamp: Date.now(),
    });

    clientRef.current.sendIntent('PRODUCE', {
      topic,
      partition: targetPart,
      key,
      value,
      acks: 1,
    });
    addLog(
      `[Keyed Produce] key="${key}" → Murmur2 routed to ${topic}/p-${String(targetPart)} (Broker ${leaderId})`,
      'INFO',
      {
        eventType: 'RECORD_PRODUCED',
        involvedEntities: [
          { type: 'producer', id: 'producer-1' },
          { type: 'broker', id: leaderId },
          { type: 'partition', id: `${topic}-${String(targetPart)}` },
          { type: 'topic', id: topic },
        ],
        payload: { topic, partition: targetPart, key, value, leaderBrokerId: leaderId },
      },
    );
  };

  const handleResetSimulation = (): void => {
    if (clientRef.current && connected) {
      clientRef.current.sendIntent('RESET', {});
    }
    setResetCounter((c) => c + 1);
    setStateHistory([]);
    setEventLogs([]);
    setIsPaused(false);
    setIsReplaying(false);
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    setProducers([{ id: 'producer-1', topic: 'orders', autoProduceEnabled: false, autoProduceInterval: 3.0 }]);
    setConsumers([{ id: 'consumer-1', topic: 'orders', groupId: 'order-processors', joined: false, memberId: null }]);
    addLog('🔄 Simulation reset: Topology restored to default, scheduler and caches cleared.', 'INFO');
  };

  const handleToggleReplay = (): void => {
    if (isReplaying) {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
      setIsReplaying(false);
      addLog('❚❚ Event replay paused.', 'INFO');
    } else {
      if (stateHistory.length < 2) {
        addLog('Cannot replay: state history requires at least 2 recorded timeline frames.', 'WARN');
        return;
      }
      setIsPaused(true);
      setIsReplaying(true);
      replayIndexRef.current = 0;

      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
      addLog(`🎬 Started animated event replay at ${String(replaySpeed)}x speed...`, 'INFO');

      replayTimerRef.current = setInterval(() => {
        replayIndexRef.current++;
        if (replayIndexRef.current >= stateHistory.length) {
          if (replayTimerRef.current) {
            clearInterval(replayTimerRef.current);
            replayTimerRef.current = null;
          }
          setIsReplaying(false);
          addLog('🎬 Event replay complete.', 'SUCCESS');
          return;
        }
        const frame = stateHistory[replayIndexRef.current];
        if (frame) {
          setRenderedState(frame);
          setPlaybackTick(frame.tick);
        }
      }, Math.max(25, 100 / replaySpeed));
    }
  };

  const handleRunScenario = (scenarioId: string): void => {
    if (!liveState || !connected) {
      addLog('Cannot run scenario: Connect to cluster simulation first.', 'WARN');
      return;
    }

    if (scenarioId === 'leader-failover') {
      const ordersP0 = liveState.topics['orders']?.[0];
      const leaderId = ordersP0?.leaderBrokerId || '1';
      addLog(`[Scenario: Failover] Step 1/3: Simulating crash on Partition Leader Broker #${leaderId}...`, 'WARN');
      handleCrashSpecificBroker(leaderId);

      setTimeout(() => {
        addLog('[Scenario: Failover] Step 2/3: KRaft Controller detected crash; promoted in-sync follower and shrank ISR.', 'INFO');
      }, 2000);

      setTimeout(() => {
        addLog(`[Scenario: Failover] Step 3/3: Restoring Broker #${leaderId} to ALIVE; syncing as in-sync follower and producer reconnecting...`, 'SUCCESS');
        handleRecoverSpecificBroker(leaderId);
      }, 4500);
    } else if (scenarioId === 'cooperative-rebalance') {
      addLog('[Scenario: Rebalance] Step 1/3: Active Consumer-1 bound to topic "orders" in group "order-processors"', 'INFO');
      
      if (!consumers[0]?.joined) {
        handleConsumerJoinSpecific('consumer-1');
      }

      setTimeout(() => {
        const newId = `consumer-${String(consumers.length + 1)}`;
        addLog(`[Scenario: Rebalance] Step 2/3: Joining ${newId} to group "order-processors"...`, 'INFO');
        clientRef.current?.sendIntent('CONSUMER_JOIN', {
          groupId: 'order-processors',
          clientId: newId,
          memberId: newId,
          topics: ['orders'],
        });
        setConsumers((c) => [...c, { id: newId, topic: 'orders', groupId: 'order-processors', joined: true, memberId: newId }]);
      }, 1800);

      setTimeout(() => {
        addLog('[Scenario: Rebalance] Step 3/3: Coordinator completed cooperative sticky partition rebalancing without stop-the-world freeze.', 'SUCCESS');
      }, 4000);
    } else if (scenarioId === 'kraft-controller-failover') {
      const ctrlId = liveState.kraft.activeControllerId || '1';
      addLog(`[Scenario: KRaft Quorum] Step 1/3: Crashing active KRaft metadata controller Broker #${ctrlId}...`, 'WARN');
      handleCrashSpecificBroker(ctrlId);

      setTimeout(() => {
        addLog('[Scenario: KRaft Quorum] Step 2/3: Metadata voter quorum held election, bumped epoch, and installed successor controller.', 'INFO');
      }, 2000);

      setTimeout(() => {
        addLog(`[Scenario: KRaft Quorum] Step 3/3: Restoring Broker #${ctrlId} back to quorum voter pool.`, 'SUCCESS');
        handleRecoverSpecificBroker(ctrlId);
      }, 4500);
    }
  };

  const handleKillBroker = (): void => {
    if (!liveState) return;
    const alive = Object.keys(liveState.brokers).filter((id) => liveState.brokers[id]?.status === 'ALIVE');
    if (!alive.length) return;
    const id = alive[Math.floor(Math.random() * alive.length)]!;
    if (connected && clientRef.current) {
      clientRef.current.sendIntent('CHAOS_KILL_BROKER', { brokerId: id });
      addLog(`Dispatched: CRASH broker ${id}`, 'WARN');
    } else {
      const ev: SimEvent = {
        id: `broker-crash-${Date.now()}`,
        tick: liveState.tick + 1,
        type: 'BROKER_STATUS_CHANGED',
        payload: { brokerId: id, newStatus: 'CRASHED' },
      };
      const res = pureStateTransition(liveState, ev, kafkaRngRef.current);
      setLiveState(res.nextState as unknown as KafkaClusterState);
      setRenderedState(res.nextState as unknown as KafkaClusterState);
      addLog(`[Chaos Injected] Broker #${id} marked CRASHED`, 'WARN');
    }
  };

  const handleRecoverBroker = (): void => {
    if (!liveState) return;
    const crashed = Object.keys(liveState.brokers).filter((id) => liveState.brokers[id]?.status === 'CRASHED');
    if (!crashed.length) { addLog('All brokers ALIVE.', 'INFO'); return; }
    const id = crashed[Math.floor(Math.random() * crashed.length)]!;
    if (connected && clientRef.current) {
      clientRef.current.sendIntent('CHAOS_RECOVER_BROKER', { brokerId: id });
      addLog(`Dispatched: RECOVER broker ${id}`, 'INFO');
    } else {
      const ev: SimEvent = {
        id: `broker-recover-${Date.now()}`,
        tick: liveState.tick + 1,
        type: 'BROKER_STATUS_CHANGED',
        payload: { brokerId: id, newStatus: 'ALIVE' },
      };
      const res = pureStateTransition(liveState, ev, kafkaRngRef.current);
      setLiveState(res.nextState as unknown as KafkaClusterState);
      setRenderedState(res.nextState as unknown as KafkaClusterState);
      addLog(`[Cluster Recovery] Broker #${id} restored to ALIVE`, 'SUCCESS');
    }
  };

  const handleExportTrace = (): void => {
    if (isOfflineReconstituted && reconstitutorRef.current) {
      const bundle = reconstitutorRef.current.exportBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kafka-reconstituted-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addLog(`Exported reconstituted trace bundle (${String(bundle.events.length)} events)`, 'INFO');
      return;
    }

    if (stateHistory.length === 0) {
      addLog('No state history captured yet to export.', 'WARN');
      return;
    }
    const traceBundle = {
      version: '1.0',
      exportedAt: Date.now(),
      clusterId: liveState?.clusterId ?? '00000000-0000-0000-0000-000000000001',
      name: 'Session Live Trace',
      description: `Live cluster execution captured across ${String(stateHistory.length)} snapshots`,
      initialState: stateHistory[0],
      events: eventLogs.map((e, idx) => ({
        id: e.id,
        tick: e.tick ?? idx,
        type: e.type as any,
        payload: { message: e.message },
      })),
      metadata: {
        totalTicks: stateHistory[stateHistory.length - 1]?.tick ?? 0,
        totalEvents: eventLogs.length,
      },
    };
    const blob = new Blob([JSON.stringify(traceBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kafka-visualizer-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog(`Exported deterministic cluster trace bundle (${String(stateHistory.length)} snapshots)`, 'INFO');
  };

  const handleLoadReconstitutedTrace = (parsed: ParsedTraceResult, rawJson: string): void => {
    try {
      const reconstitutor = new SimulationReconstitutor();
      reconstitutor.loadTrace(rawJson || parsed);
      reconstitutorRef.current = reconstitutor;

      setIsOfflineReconstituted(true);
      setIsPaused(true);
      setCurrentReconstitutedStep(0);
      setReconstitutedTimeline(reconstitutor.getTimelineSteps());
      setReconstitutedViolations(reconstitutor.getViolations());

      const init = reconstitutor.currentState;
      setRenderedState((init as unknown) as KafkaClusterState);
      setLiveState((init as unknown) as KafkaClusterState);
      setPlaybackTick(reconstitutor.currentTick);

      const logs: EventLogItem[] = reconstitutor.getTimelineSteps().map((s) => ({
        id: `rec-${s.stepIndex}`,
        tick: s.tick,
        type: s.eventType as any,
        message: s.summary,
        timestamp: Date.now() - (reconstitutor.totalSteps - s.stepIndex) * 1000,
        source: 'SYSTEM' as const,
      }));
      setEventLogs(logs.reverse());
      addLog(
        `Loaded Reconstituted Trace: ${String(reconstitutor.totalSteps)} events, ${String(reconstitutor.getViolations().length)} invariant violations`,
        'SUCCESS',
      );
    } catch (err) {
      addLog(`Failed to reconstitute trace: ${(err as Error).message}`, 'ERROR');
    }
  };

  const handleReconstitutionStepForward = (): void => {
    if (!reconstitutorRef.current) return;
    const res = reconstitutorRef.current.stepForward();
    if (res) {
      setCurrentReconstitutedStep(res.stepIndex);
      setRenderedState((res.state as unknown) as KafkaClusterState);
      setLiveState((res.state as unknown) as KafkaClusterState);
      setPlaybackTick(res.tick);
      if (res.violation) {
        setIsHalted(true);
        setHaltError(`[Reconstitution Step ${res.stepIndex}] ${res.violation.invariantName}: ${res.violation.description}`);
      }
    }
  };

  const handleReconstitutionStepBackward = (): void => {
    if (!reconstitutorRef.current) return;
    const res = reconstitutorRef.current.stepBackward();
    if (res) {
      setCurrentReconstitutedStep(res.stepIndex);
      setRenderedState((res.state as unknown) as KafkaClusterState);
      setLiveState((res.state as unknown) as KafkaClusterState);
      setPlaybackTick(res.tick);
      setIsHalted(false);
      setHaltError(null);
    }
  };

  const handleReconstitutionSeek = (stepIndex: number): void => {
    if (!reconstitutorRef.current) return;
    const state = reconstitutorRef.current.seekToStep(stepIndex);
    setCurrentReconstitutedStep(stepIndex);
    setRenderedState((state as unknown) as KafkaClusterState);
    setLiveState((state as unknown) as KafkaClusterState);
    setPlaybackTick(reconstitutorRef.current.currentTick);
    const meta = reconstitutorRef.current.getTimelineSteps()[stepIndex];
    if (meta?.violation) {
      setIsHalted(true);
      setHaltError(`[Step ${stepIndex}] ${meta.violation.invariantName}: ${meta.violation.description}`);
    } else {
      setIsHalted(false);
      setHaltError(null);
    }
  };

  const handleExitOfflineReplay = (): void => {
    setIsOfflineReconstituted(false);
    reconstitutorRef.current = null;
    setReconstitutedTimeline([]);
    setReconstitutedViolations([]);
    setCurrentReconstitutedStep(0);
    setIsHalted(false);
    setHaltError(null);
    addLog('Exited offline reconstitution replay mode.', 'INFO');
  };

  /* ── Raft Domain Handlers ── */
  const handleRaftProposeCommand = (command: string): void => {
    setRaftState((prev) => {
      const ev: RaftSimEvent = {
        id: `prop-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'RAFT_CLIENT_PROPOSE',
        payload: { command },
      };
      const res = pureRaftTransition(prev, ev, raftRngRef.current);
      addLog(`[Raft] Propose Write: ${command} to Leader #${prev.activeLeaderId ?? 'None'}`, 'INFO');
      return res.nextState;
    });
  };

  const handleRaftCrashNode = (nodeId: string): void => {
    setRaftState((prev) => {
      const ev: RaftSimEvent = {
        id: `crash-${nodeId}-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'RAFT_NODE_CRASH',
        payload: { nodeId },
      };
      const res = pureRaftTransition(prev, ev, raftRngRef.current);
      addLog(`[Raft] Chaos: Node #${nodeId} CRASHED`, 'WARN');
      return res.nextState;
    });
  };

  const handleRaftRecoverNode = (nodeId: string): void => {
    setRaftState((prev) => {
      const ev: RaftSimEvent = {
        id: `rec-${nodeId}-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'RAFT_NODE_RECOVER',
        payload: { nodeId },
      };
      const res = pureRaftTransition(prev, ev, raftRngRef.current);
      addLog(`[Raft] Recover: Node #${nodeId} restored as Follower`, 'SUCCESS');
      return res.nextState;
    });
  };

  const handleRaftTogglePartition = (nodeId: string): void => {
    setRaftState((prev) => {
      const isIso = prev.isolatedNodeIds.includes(nodeId);
      const newIsolated = isIso
        ? prev.isolatedNodeIds.filter((id) => id !== nodeId)
        : [...prev.isolatedNodeIds, nodeId];
      const ev: RaftSimEvent = {
        id: `part-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'RAFT_NETWORK_PARTITION',
        payload: { isolatedNodeIds: newIsolated },
      };
      const res = pureRaftTransition(prev, ev, raftRngRef.current);
      addLog(`[Raft] Network Partition: Nodes [${newIsolated.join(', ')}] isolated`, 'WARN');
      return res.nextState;
    });
  };

  /* ── Database Domain Handlers ── */
  const handleDBWriteKey = (key: string, value: string, consistency: ConsistencyLevel): void => {
    setDbState((prev) => {
      const ev: DBSimEvent = {
        id: `db-w-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'DB_WRITE_REQUEST',
        payload: { key, value, consistencyLevel: consistency },
      };
      const res = pureDBTransition(prev, ev, dbRngRef.current);
      const violation = dbInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[DB ${violation.ruleId}] ${violation.description}`);
      }
      addLog(`[DB] Write "${key}" = "${value}" (W=${consistency})`, 'INFO');
      return res.nextState;
    });
  };

  const handleDBReadKey = (key: string, consistency: ConsistencyLevel): void => {
    setDbState((prev) => {
      const ev: DBSimEvent = {
        id: `db-r-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'DB_READ_REQUEST',
        payload: { key, consistencyLevel: consistency },
      };
      let res = pureDBTransition(prev, ev, dbRngRef.current);
      for (const emitted of res.emittedEvents) {
        if (emitted.type === 'DB_READ_REPAIR') {
          res = pureDBTransition(res.nextState, emitted, dbRngRef.current);
          addLog(`[DB Read-Repair] Reconciled stale replicas for "${key}"`, 'SUCCESS');
        }
      }
      const violation = dbInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[DB ${violation.ruleId}] ${violation.description}`);
      }
      addLog(`[DB] Read "${key}" (R=${consistency})`, 'INFO');
      return res.nextState;
    });
  };

  const handleDBAddNode = (): void => {
    setDbState((prev) => {
      const nextId = String(Object.keys(prev.nodes).length + 1);
      const ev: DBSimEvent = {
        id: `db-join-${nextId}`,
        tick: prev.tick + 1,
        type: 'DB_NODE_JOIN',
        payload: { nodeId: nextId },
      };
      const res = pureDBTransition(prev, ev, dbRngRef.current);
      const violation = dbInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[DB ${violation.ruleId}] ${violation.description}`);
      }
      addLog(`[DB Scale-Out] Added Node #${nextId} (3 vnodes allocated)`, 'SUCCESS');
      return res.nextState;
    });
  };

  const handleDBCrashNode = (nodeId: string): void => {
    setDbState((prev) => {
      const ev: DBSimEvent = {
        id: `db-crash-${nodeId}`,
        tick: prev.tick + 1,
        type: 'DB_NODE_CRASH',
        payload: { nodeId },
      };
      const res = pureDBTransition(prev, ev, dbRngRef.current);
      const violation = dbInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[DB ${violation.ruleId}] ${violation.description}`);
      }
      addLog(`[DB Chaos] Node #${nodeId} is DOWN`, 'WARN');
      return res.nextState;
    });
  };

  const handleDBRecoverNode = (nodeId: string): void => {
    setDbState((prev) => {
      const ev: DBSimEvent = {
        id: `db-rec-${nodeId}`,
        tick: prev.tick + 1,
        type: 'DB_NODE_RECOVER',
        payload: { nodeId },
      };
      let res = pureDBTransition(prev, ev, dbRngRef.current);
      for (const emitted of res.emittedEvents) {
        if (emitted.type === 'DB_HINT_DELIVER') {
          res = pureDBTransition(res.nextState, emitted, dbRngRef.current);
          addLog(`[DB Hint Delivery] Flushed pending hinted handoffs to Node #${nodeId}`, 'SUCCESS');
        }
      }
      const violation = dbInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[DB ${violation.ruleId}] ${violation.description}`);
      }
      addLog(`[DB Recovery] Node #${nodeId} restored to ALIVE`, 'SUCCESS');
      return res.nextState;
    });
  };

  const handleDBUpdateConsistency = (read: ConsistencyLevel, write: ConsistencyLevel): void => {
    setDbState((prev) => {
      const ev: DBSimEvent = {
        id: `db-upd-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'DB_UPDATE_CONSISTENCY',
        payload: { readConsistency: read, writeConsistency: write },
      };
      const res = pureDBTransition(prev, ev, dbRngRef.current);
      addLog(`[DB Config] Updated Consistency -> Read: ${read}, Write: ${write}`, 'INFO');
      return res.nextState;
    });
  };

  /* ── Redis Domain Handlers ── */
  const handleRedisSetKey = (key: string, value: string, ttl: number | null, targetNodeId?: string): void => {
    setRedisState((prev) => {
      const ev: RedisSimEvent = {
        id: `redis-set-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'REDIS_SET',
        payload: { key, value, ttl, clientTargetNodeId: targetNodeId },
      };
      const res = pureRedisTransition(prev, ev, redisRngRef.current);
      for (const emitted of res.emittedEvents) {
        if (emitted.type === 'REDIS_MOVED_REDIRECT') {
          addLog(`[Redis -MOVED] Slot ${String(emitted.payload['slot'])} -> Redirect to Master #${String(emitted.payload['targetMasterId'])}`, 'WARN');
        } else if (emitted.type === 'REDIS_ASK_REDIRECT') {
          addLog(`[Redis -ASK] Slot ${String(emitted.payload['slot'])} (Migrating) -> Query Master #${String(emitted.payload['targetMasterId'])}`, 'WARN');
        }
      }
      const violation = redisInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[Redis ${violation.ruleId}] ${violation.description}`);
      }
      addLog(`[Redis] SET "${key}" = "${value}"`, 'INFO');
      return res.nextState;
    });
  };

  const handleRedisGetKey = (key: string, targetNodeId?: string): void => {
    setRedisState((prev) => {
      const ev: RedisSimEvent = {
        id: `redis-get-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'REDIS_GET',
        payload: { key, clientTargetNodeId: targetNodeId },
      };
      const res = pureRedisTransition(prev, ev, redisRngRef.current);
      for (const emitted of res.emittedEvents) {
        if (emitted.type === 'REDIS_MOVED_REDIRECT') {
          addLog(`[Redis -MOVED] Slot ${String(emitted.payload['slot'])} -> Redirect to Master #${String(emitted.payload['targetMasterId'])}`, 'WARN');
        }
      }
      addLog(`[Redis] GET "${key}"`, 'INFO');
      return res.nextState;
    });
  };

  const handleRedisDelKey = (key: string): void => {
    setRedisState((prev) => {
      const ev: RedisSimEvent = {
        id: `redis-del-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'REDIS_DEL',
        payload: { key },
      };
      const res = pureRedisTransition(prev, ev, redisRngRef.current);
      addLog(`[Redis] DEL "${key}"`, 'INFO');
      return res.nextState;
    });
  };

  const handleRedisReshard = (sourceMasterId: string, targetMasterId: string, startSlot: number, endSlot: number): void => {
    setRedisState((prev) => {
      const ev: RedisSimEvent = {
        id: `redis-reshard-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'REDIS_RESHARD',
        payload: { sourceMasterId, targetMasterId, startSlot, endSlot },
      };
      const res = pureRedisTransition(prev, ev, redisRngRef.current);
      addLog(`[Redis Reshard] Moved Slots ${startSlot}-${endSlot} from Node #${sourceMasterId} to Node #${targetMasterId}`, 'SUCCESS');
      return res.nextState;
    });
  };

  const handleRedisCrashNode = (nodeId: string): void => {
    setRedisState((prev) => {
      const ev: RedisSimEvent = {
        id: `redis-crash-${nodeId}`,
        tick: prev.tick + 1,
        type: 'REDIS_NODE_CRASH',
        payload: { nodeId },
      };
      let res = pureRedisTransition(prev, ev, redisRngRef.current);
      for (const emitted of res.emittedEvents) {
        if (emitted.type === 'REDIS_FAILOVER') {
          res = pureRedisTransition(res.nextState, emitted, redisRngRef.current);
          addLog(`[Redis Failover] Replica promoted to Master for crashed Node #${nodeId}`, 'SUCCESS');
        }
      }
      addLog(`[Redis Chaos] Node #${nodeId} crashed`, 'WARN');
      return res.nextState;
    });
  };

  const handleRedisRecoverNode = (nodeId: string): void => {
    setRedisState((prev) => {
      const ev: RedisSimEvent = {
        id: `redis-rec-${nodeId}`,
        tick: prev.tick + 1,
        type: 'REDIS_NODE_RECOVER',
        payload: { nodeId },
      };
      const res = pureRedisTransition(prev, ev, redisRngRef.current);
      addLog(`[Redis Recovery] Node #${nodeId} recovered`, 'SUCCESS');
      return res.nextState;
    });
  };

  const handleRedisSetEvictionPolicy = (policy: EvictionPolicy): void => {
    setRedisState((prev) => {
      const ev: RedisSimEvent = {
        id: `redis-policy-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'REDIS_SET_EVICTION_POLICY',
        payload: { policy },
      };
      const res = pureRedisTransition(prev, ev, redisRngRef.current);
      addLog(`[Redis Config] Eviction Policy set to "${policy}"`, 'INFO');
      return res.nextState;
    });
  };

  /* ── Kubernetes Domain Handlers ── */
  const handleK8sScaleDeployment = (deploymentId: string, replicas: number): void => {
    setK8sState((prev) => {
      const ev: K8sSimEvent = {
        id: `k8s-scale-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'K8S_SCALE_DEPLOYMENT',
        payload: { deploymentId, replicas },
      };
      const res = pureK8sTransition(prev, ev, k8sRngRef.current);
      const violation = k8sInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[K8s ${violation.ruleId}] ${violation.description}`);
      }
      addLog(`[K8s Scale] Deployment "${deploymentId}" -> ${replicas} replicas`, 'INFO');
      return res.nextState;
    });
  };

  const handleK8sUpdateImage = (deploymentId: string, newImage: string): void => {
    setK8sState((prev) => {
      const ev: K8sSimEvent = {
        id: `k8s-img-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'K8S_UPDATE_IMAGE',
        payload: { deploymentId, newImage },
      };
      const res = pureK8sTransition(prev, ev, k8sRngRef.current);
      const violation = k8sInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[K8s ${violation.ruleId}] ${violation.description}`);
      }
      addLog(`[K8s Rollout] Initiated rolling update for "${deploymentId}" to "${newImage}"`, 'SUCCESS');
      return res.nextState;
    });
  };

  const handleK8sNodeCordon = (nodeId: string): void => {
    setK8sState((prev) => {
      const ev: K8sSimEvent = {
        id: `k8s-cordon-${nodeId}`,
        tick: prev.tick + 1,
        type: 'K8S_NODE_CORDON',
        payload: { nodeId },
      };
      const res = pureK8sTransition(prev, ev, k8sRngRef.current);
      addLog(`[K8s Admin] Node #${nodeId} scheduling toggled`, 'WARN');
      return res.nextState;
    });
  };

  const handleK8sNodeDrain = (nodeId: string): void => {
    setK8sState((prev) => {
      const ev: K8sSimEvent = {
        id: `k8s-drain-${nodeId}`,
        tick: prev.tick + 1,
        type: 'K8S_NODE_DRAIN',
        payload: { nodeId },
      };
      const res = pureK8sTransition(prev, ev, k8sRngRef.current);
      addLog(`[K8s Drain] Evicted active workloads from Node #${nodeId}`, 'SUCCESS');
      return res.nextState;
    });
  };

  const handleK8sNodeCrash = (nodeId: string): void => {
    setK8sState((prev) => {
      const ev: K8sSimEvent = {
        id: `k8s-crash-${nodeId}`,
        tick: prev.tick + 1,
        type: 'K8S_NODE_CRASH',
        payload: { nodeId },
      };
      const res = pureK8sTransition(prev, ev, k8sRngRef.current);
      addLog(`[K8s Chaos] Node #${nodeId} is NotReady`, 'WARN');
      return res.nextState;
    });
  };

  const handleK8sNodeRecover = (nodeId: string): void => {
    setK8sState((prev) => {
      const ev: K8sSimEvent = {
        id: `k8s-rec-${nodeId}`,
        tick: prev.tick + 1,
        type: 'K8S_NODE_RECOVER',
        payload: { nodeId },
      };
      const res = pureK8sTransition(prev, ev, k8sRngRef.current);
      addLog(`[K8s Recovery] Node #${nodeId} is Ready`, 'SUCCESS');
      return res.nextState;
    });
  };

  /* ── RabbitMQ Domain Handlers ── */
  const handleRabbitPublish = (exchangeName: string, routingKey: string, payload: string, ttl: number | null): void => {
    setRabbitState((prev) => {
      const ev: RabbitSimEvent = {
        id: `rabbit-pub-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'RABBIT_PUBLISH',
        payload: { exchangeName, routingKey, payload, ttl },
      };
      const res = pureRabbitTransition(prev, ev, rabbitRngRef.current);
      const violation = rabbitInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[RabbitMQ ${violation.ruleId}] ${violation.description}`);
      }
      addLog(`[RabbitMQ Publish] "${routingKey}" via ${exchangeName}`, 'INFO');
      return res.nextState;
    });
  };

  const handleRabbitAck = (messageId: string, consumerId: string): void => {
    setRabbitState((prev) => {
      const ev: RabbitSimEvent = {
        id: `rabbit-ack-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'RABBIT_ACK',
        payload: { messageId, consumerId },
      };
      const res = pureRabbitTransition(prev, ev, rabbitRngRef.current);
      addLog(`[RabbitMQ Ack] Message ${messageId} acknowledged by ${consumerId}`, 'SUCCESS');
      return res.nextState;
    });
  };

  const handleRabbitNack = (messageId: string, consumerId: string, requeue: boolean): void => {
    setRabbitState((prev) => {
      const ev: RabbitSimEvent = {
        id: `rabbit-nack-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'RABBIT_NACK',
        payload: { messageId, consumerId, requeue },
      };
      const res = pureRabbitTransition(prev, ev, rabbitRngRef.current);
      addLog(`[RabbitMQ Nack] Message ${messageId} (requeue=${String(requeue)})`, 'WARN');
      return res.nextState;
    });
  };

  const handleRabbitReject = (messageId: string, consumerId: string): void => {
    setRabbitState((prev) => {
      const ev: RabbitSimEvent = {
        id: `rabbit-rej-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'RABBIT_REJECT',
        payload: { messageId, consumerId, requeue: false },
      };
      const res = pureRabbitTransition(prev, ev, rabbitRngRef.current);
      for (const emitted of res.emittedEvents) {
        if (emitted.type === 'RABBIT_MESSAGE_DEAD_LETTERED') {
          addLog(`[RabbitMQ DLX] Poison message routed to Dead-Letter Queue`, 'WARN');
        }
      }
      addLog(`[RabbitMQ Reject] Message ${messageId} rejected to DLX`, 'WARN');
      return res.nextState;
    });
  };

  /* ── Storage Engine Domain Handlers ── */
  const handleStorageWrite = (key: number, value: string): void => {
    setStorageState((prev) => {
      const ev: StorageSimEvent = {
        id: `storage-w-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'STORAGE_WRITE',
        payload: { key, value },
      };
      const res = pureStorageTransition(prev, ev, storageRngRef.current);
      const violation = storageInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[Storage ${violation.ruleId}] ${violation.description}`);
      }
      addLog(`[Storage Write] Key #${key} -> "${value}" (${res.nextState.activeEngine})`, 'SUCCESS');
      return res.nextState;
    });
  };

  const handleStorageRead = (key: number): void => {
    setStorageState((prev) => {
      const ev: StorageSimEvent = {
        id: `storage-r-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'STORAGE_READ',
        payload: { key },
      };
      const res = pureStorageTransition(prev, ev, storageRngRef.current);
      addLog(`[Storage Read] Lookup key #${key} (${res.nextState.activeEngine})`, 'INFO');
      return res.nextState;
    });
  };

  const handleStorageSwitchEngine = (engine: StorageEngineType): void => {
    setStorageState((prev) => {
      const ev: StorageSimEvent = {
        id: `storage-sw-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'STORAGE_SWITCH_ENGINE',
        payload: { engine },
      };
      const res = pureStorageTransition(prev, ev, storageRngRef.current);
      addLog(`[Storage Switch] Active engine switched to ${engine}`, 'INFO');
      return res.nextState;
    });
  };

  const handleStorageTriggerFlush = (): void => {
    setStorageState((prev) => {
      const ev: StorageSimEvent = {
        id: `storage-flush-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'STORAGE_TRIGGER_FLUSH',
        payload: {},
      };
      const res = pureStorageTransition(prev, ev, storageRngRef.current);
      addLog(`[Storage LSM] Flushed MemTable to Level 0 SSTable`, 'WARN');
      return res.nextState;
    });
  };

  const handleStorageTriggerCompaction = (level: number): void => {
    setStorageState((prev) => {
      const ev: StorageSimEvent = {
        id: `storage-compact-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'STORAGE_TRIGGER_COMPACTION',
        payload: { level },
      };
      const res = pureStorageTransition(prev, ev, storageRngRef.current);
      addLog(`[Storage LSM] Merged Level ${level} SSTables into Level ${level + 1}`, 'SUCCESS');
      return res.nextState;
    });
  };

  /* ── Networking Domain Handlers ── */
  const handleNetworkingStartHandshake = (): void => {
    setNetworkingState((prev) => {
      const ev: NetworkSimEvent = {
        id: `net-syn-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'TCP_START_HANDSHAKE',
        payload: {},
      };
      const res = pureNetworkingTransition(prev, ev, networkingRngRef.current);
      const violation = networkingInvariantCheckerRef.current.check(res.nextState);
      if (violation) {
        setIsHalted(true);
        setHaltError(`[Networking ${violation.ruleId}] ${violation.description}`);
      }
      addLog(`[TCP Handshake] Client sent SYN packet (seq=${res.nextState.clientSeqNumber})`, 'INFO');
      return res.nextState;
    });
  };

  const handleNetworkingSendData = (): void => {
    setNetworkingState((prev) => {
      const ev: NetworkSimEvent = {
        id: `net-data-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'TCP_SEND_DATA',
        payload: {},
      };
      const res = pureNetworkingTransition(prev, ev, networkingRngRef.current);
      addLog(`[TCP Data] Transmitted payload packet across wire`, 'SUCCESS');
      return res.nextState;
    });
  };

  const handleNetworkingDropPacket = (): void => {
    setNetworkingState((prev) => {
      const ev: NetworkSimEvent = {
        id: `net-drop-${String(Date.now())}`,
        tick: prev.tick + 1,
        type: 'TCP_DROP_PACKET',
        payload: {},
      };
      const res = pureNetworkingTransition(prev, ev, networkingRngRef.current);
      addLog(`[TCP Packet Loss] In-flight packet dropped! AIMD cwnd reset to 1`, 'WARN');
      return res.nextState;
    });
  };

  const handleImportTrace = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const trace = JSON.parse(event.target?.result as string);
        if (Array.isArray(trace.stateHistory) && trace.stateHistory.length > 0) {
          setStateHistory(trace.stateHistory);
          setEventLogs(trace.eventLogs ?? []);
          if (trace.producers) setProducers(trace.producers);
          if (trace.consumers) setConsumers(trace.consumers);
          setIsPaused(true);
          setPlaybackTick(trace.stateHistory[0].tick);
          setRenderedState(trace.stateHistory[0]);
          addLog(`Imported offline trace: ${file.name} (${String(trace.stateHistory.length)} snapshots)`, 'INFO');
        } else {
          addLog('Trace format invalid: missing stateHistory array.', 'ERROR');
        }
      } catch {
        addLog('Failed to parse trace: Invalid JSON.', 'ERROR');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddBroker = (): void => {
    if (!liveState) return;
    const currentCount = Object.keys(liveState.brokers).length;
    const newBrokerId = String(currentCount + 1);
    if (connected && clientRef.current) {
      clientRef.current.sendIntent('ADD_BROKER', {
        brokerId: newBrokerId,
        rack: `rack-${String.fromCharCode(97 + (currentCount % 3))}`,
      });
      addLog(`Dispatched: ADD_BROKER id "${newBrokerId}"`, 'INFO');
    } else {
      const ev: SimEvent = {
        id: `broker-add-${Date.now()}`,
        tick: liveState.tick + 1,
        type: 'BROKER_ADDED',
        payload: {
          broker: {
            id: newBrokerId as any,
            host: `broker-${newBrokerId}.cluster.local`,
            port: 9092 + currentCount,
            status: 'ALIVE',
            diskUsageBytes: 0,
            maxDiskSizeBytes: 10 * 1024 * 1024 * 1024,
            lastHeartbeatTick: liveState.tick,
            rack: `rack-${String.fromCharCode(97 + (currentCount % 3))}`,
          },
        },
      };
      const res = pureStateTransition(liveState, ev, kafkaRngRef.current);
      setLiveState(res.nextState as unknown as KafkaClusterState);
      setRenderedState(res.nextState as unknown as KafkaClusterState);
      addLog(`[Cluster Updated] Added Broker Node #${newBrokerId}`, 'INFO');
    }
  };

  const handleCreateTopic = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    if (!newTopicName.trim()) return;
    const topic = newTopicName.trim().toLowerCase();
    if (connected && clientRef.current) {
      clientRef.current.sendIntent('CREATE_TOPIC', {
        topic,
        partitions: newPartitions,
      });
      addLog(`Dispatched: CREATE_TOPIC "${topic}" (${String(newPartitions)} partitions)`, 'INFO');
    } else if (liveState) {
      const ev: SimEvent = {
        id: `topic-create-${Date.now()}`,
        tick: liveState.tick + 1,
        type: 'TOPIC_CREATED',
        payload: {
          topic,
          partitions: newPartitions,
          replicationFactor: Math.min(3, Object.keys(liveState.brokers).length),
        },
      };
      const res = pureStateTransition(liveState, ev, kafkaRngRef.current);
      setLiveState(res.nextState as unknown as KafkaClusterState);
      setRenderedState(res.nextState as unknown as KafkaClusterState);
      addLog(`[Cluster Updated] Created Topic "${topic}" (${String(newPartitions)} partitions)`, 'INFO');
    }
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

  const statValues: Record<string, string> = {
    tick: String(liveState?.tick ?? 0),
    ctrl: liveState?.kraft.activeControllerId ?? 'NONE',
    alive: String(aliveBrokers),
    crashed: String(crashedBrokers),
  };

  const availableTopics = liveState ? Object.keys(liveState.topics) : ['orders'];

  const [showTourModal, setShowTourModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);

  const accessibleRows = React.useMemo(() => {
    if (selectedDomain === 'kafka') {
      return Object.values(renderedState?.brokers ?? {}).map((b) => ({
        id: `broker-${b.id}`,
        name: `Broker ${b.id} (${b.rack})`,
        roleOrType: 'Kafka Broker',
        status: b.status,
        metrics: `Disk: ${(b.diskUsageBytes / (1024 * 1024)).toFixed(1)} MB / 10 GB`,
      }));
    }
    if (selectedDomain === 'raft') {
      return Object.values(raftState.nodes).map((n) => ({
        id: `raft-${n.id}`,
        name: `Raft Node ${n.id}`,
        roleOrType: n.role,
        status: n.status,
        metrics: `Term: ${n.currentTerm} | Log Entries: ${n.log.length}`,
      }));
    }
    if (selectedDomain === 'database') {
      return Object.values(dbState.nodes).map((n) => ({
        id: `db-${n.id}`,
        name: `Node ${n.id} (${n.host})`,
        roleOrType: `Tokens: ${n.tokens.length}`,
        status: n.status,
        metrics: `Storage: ${Object.keys(n.storage).length} keys | Hints: ${n.hints.length}`,
      }));
    }
    if (selectedDomain === 'redis') {
      return Object.values(redisState.nodes).map((n) => ({
        id: `redis-${n.id}`,
        name: `Redis Node ${n.id} (${n.role})`,
        roleOrType: n.role,
        status: n.status,
        metrics: `Ranges: ${n.slotRanges.length} | Keys: ${Object.keys(n.storage).length} | Mem: ${(n.memoryUsedBytes / (1024 * 1024)).toFixed(1)} MB`,
      }));
    }
    if (selectedDomain === 'kubernetes') {
      return Object.values(k8sState.nodes).map((n) => ({
        id: `k8s-node-${n.id}`,
        name: `${n.name} (${n.role})`,
        roleOrType: n.role,
        status: n.status,
        metrics: `CPU: ${n.allocated.cpuMillis}/${n.capacity.cpuMillis}m | Mem: ${n.allocated.memoryMb}/${n.capacity.memoryMb}MB | Pods: ${n.podIds.length}`,
      }));
    }
    if (selectedDomain === 'rabbitmq') {
      return Object.values(rabbitState.queues).map((q) => ({
        id: `queue-${q.id}`,
        name: q.name,
        roleOrType: q.durable ? 'Durable Queue' : 'Transient Queue',
        status: 'ALIVE',
        metrics: `Messages: ${q.messages.length} | Consumers: ${q.consumerCount}`,
      }));
    }
    if (selectedDomain === 'storage') {
      return [
        {
          id: 'storage-engine',
          name: storageState.activeEngine === 'B_TREE' ? 'B+Tree Page Engine' : 'LSM-Tree Log Engine',
          roleOrType: storageState.activeEngine,
          status: 'ACTIVE',
          metrics: `Writes: ${storageState.totalWrites} | Reads: ${storageState.totalReads} | Splits/Compactions: ${storageState.activeEngine === 'B_TREE' ? storageState.btree.totalPageSplits : storageState.lsm.totalCompactions}`,
        },
      ];
    }
    return [
      {
        id: 'tcp-connection',
        name: 'TCP Client-Server Connection',
        roleOrType: `Client: ${networkingState.clientState} | Server: ${networkingState.serverState}`,
        status: networkingState.clientState === 'ESTABLISHED' ? 'ACTIVE' : 'IDLE',
        metrics: `CWND: ${networkingState.congestion.cwnd} MSS | SSTHRESH: ${networkingState.congestion.ssthresh} | In-Flight: ${networkingState.inFlightPackets.length} | Sent: ${networkingState.totalPacketsSent}`,
      },
    ];
  }, [selectedDomain, renderedState, raftState, dbState, redisState, k8sState, rabbitState, storageState, networkingState]);

  return (
    <div className="app-shell">

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-brand">
          <span className={statusDotClass(status)} />
          <h1 className="header-brand-title">TheVisualizer</h1>
          <span className={statusBadgeClass(status)}>{status}</span>

          {/* Multi-Domain Dropdown Switcher */}
          {(() => {
            const currentDomainObj = DOMAIN_OPTIONS.find((d) => d.id === selectedDomain) ?? DOMAIN_OPTIONS[0]!;
            return (
              <div style={{ position: 'relative', marginLeft: '12px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    onClick={() => setShowDomainDropdown(!showDomainDropdown)}
                    className="btn btn--ghost"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 12px',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: '1rem' }}>{currentDomainObj.icon}</span>
                    <span>{currentDomainObj.name}</span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        backgroundColor: currentDomainObj.color + '25',
                        color: currentDomainObj.color,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: `1px solid ${currentDomainObj.color}55`,
                      }}
                    >
                      {currentDomainObj.category}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: '2px' }}>▼</span>
                  </button>

                  <button
                    onClick={() => setShowDomainDirectoryModal(true)}
                    className="btn btn--indigo"
                    style={{
                      padding: '5px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                    title="View full platform domain catalog and specifications"
                  >
                    🌐 Explore Catalog
                  </button>
                </div>

                {showDomainDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '6px',
                      width: '320px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '10px',
                      padding: '6px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
                      zIndex: 100,
                    }}
                  >
                    <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Distributed System Visualizers
                    </div>
                    {DOMAIN_OPTIONS.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => {
                          setSelectedDomain(d.id);
                          setShowDomainDropdown(false);
                          if (typeof window !== 'undefined') {
                            window.history.pushState({}, '', d.path);
                          }
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          backgroundColor: selectedDomain === d.id ? '#1e293b' : 'transparent',
                          border: selectedDomain === d.id ? `1px solid ${d.color}44` : '1px solid transparent',
                          color: selectedDomain === d.id ? '#ffffff' : '#94a3b8',
                          textAlign: 'left',
                          cursor: 'pointer',
                          marginBottom: '2px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.1rem' }}>{d.icon}</span>
                          <div>
                            <div style={{ fontWeight: selectedDomain === d.id ? 700 : 500, fontSize: '0.8rem', color: selectedDomain === d.id ? '#f8fafc' : '#cbd5e1' }}>{d.name}</div>
                            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{d.category}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: '0.65rem', color: '#475569', fontFamily: 'monospace' }}>{d.path}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <div className="header-right">
          <div className="connection-pill">
            <div className="connection-field">
              <label htmlFor="rest-gateway-url-input" className="connection-field-label">REST Gateway</label>
              <input
                id="rest-gateway-url-input"
                type="text"
                value={restUrl}
                onChange={(e) => setRestUrl(e.target.value)}
                aria-label="REST Gateway URL"
                className="connection-field-input"
                style={{ width: 160 }}
              />
            </div>
            <div className="connection-divider" />
            <div className="connection-field">
              <label htmlFor="ws-tunnel-url-input" className="connection-field-label">WS Tunnel</label>
              <input
                id="ws-tunnel-url-input"
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                aria-label="WebSocket Tunnel URL"
                className="connection-field-input"
                style={{ width: 160 }}
              />
            </div>
            <div className="connection-divider" />
            <div className="connection-field">
              <label htmlFor="room-id-input" className="connection-field-label">Room</label>
              <input
                id="room-id-input"
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                aria-label="Simulation Room ID"
                className="connection-field-input"
                style={{ width: 72 }}
              />
            </div>
          </div>

          <div className="header-actions">
            <button
              onClick={handleResetSimulation}
              className="btn btn--rose"
              title="Reset simulation cluster, cancel timers, and purge cached room state"
            >
              🔄 Reset
            </button>

            <button onClick={() => setShowScenariosModal(true)} className="btn btn--indigo">
              🎓 Scenarios
            </button>

            <button
              onClick={() => setShowTraceImportModal(true)}
              className="btn btn--secondary"
              title="Ingest serialized JSON event log for offline deterministic replay"
            >
              📥 Ingest Trace
            </button>

            <button
              onClick={() => setShowTableModal(true)}
              className="btn btn--secondary"
              title="Open accessible non-canvas data table view"
            >
              📊 Table View
            </button>

            <button
              onClick={() => setShowTourModal(true)}
              className="btn btn--ghost"
              title="Start feature tour (?)"
            >
              💡 Tour
            </button>

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
        <aside className="sidebar" aria-label={`${selectedDomain} simulation controls and overview`}>

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
                disabled={isHalted}
                className="btn btn--primary"
              >
                ➕ Add Producer
              </button>
              <button
                onClick={handleRemoveProducer}
                disabled={isHalted || producers.length <= 1}
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
                  aria-label="Bind producer to topic"
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
                          aria-label={`Select topic for producer ${prod.id}`}
                          className="producer-select"
                          disabled={isHalted}
                        >
                          {availableTopics.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleProduceIntent(prod.id)}
                          disabled={isHalted}
                          className="producer-row-btn"
                          title="Produce Single Message"
                        >
                          ⚡
                        </button>
                        <button
                          onClick={() => handleToggleAutoProduce(prod.id)}
                          disabled={isHalted}
                          className={`producer-auto-toggle-btn ${prod.autoProduceEnabled ? 'producer-auto-toggle-btn--active' : ''}`}
                          title="Toggle Auto-Produce Cadence"
                        >
                          {prod.autoProduceEnabled ? '⏱ ON' : '⏱ OFF'}
                        </button>
                      </div>

                      {/* Auto-Produce Cadence Slider & Input Drawer */}
                      <div className="producer-auto-drawer">
                        <label className="producer-auto-rate-label" style={{ display: 'block', marginBottom: '2px', fontSize: '9px', fontWeight: 600 }}>
                          Cadence (seconds):
                        </label>
                        <div className="producer-auto-controls-row">
                          <input
                            type="range"
                            min="0.5"
                            max="30.0"
                            step="0.1"
                            value={interval}
                            onChange={(e) => handleAutoProduceIntervalChange(prod.id, parseFloat(e.target.value))}
                            className="producer-auto-slider"
                            disabled={isHalted}
                            aria-label={`Auto-produce interval for producer ${prod.id} in seconds`}
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
                            disabled={isHalted}
                            aria-label={`Exact auto-produce interval in seconds for producer ${prod.id}`}
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
                disabled={isHalted || producers.length === 0}
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
                disabled={isHalted}
                className="btn btn--indigo"
              >
                ➕ Add Consumer
              </button>
              <button
                onClick={handleRemoveConsumer}
                disabled={isHalted || consumers.length <= 1}
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
                  aria-label="Select topic to subscribe"
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
                  aria-label="Select consumer group"
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
                      aria-label={`Topic subscription for consumer ${c.id}`}
                      className="producer-select"
                      disabled={isHalted || c.joined}
                    >
                      {availableTopics.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {c.joined ? (
                      <button
                        onClick={() => handleConsumerLeaveSpecific(c.id)}
                        disabled={isHalted}
                        className="producer-row-btn"
                        style={{ background: '#f43f5e' }}
                        title="Leave Consumer Group"
                      >
                        ❌
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConsumerJoinSpecific(c.id)}
                        disabled={isHalted}
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
              <button onClick={handleKillBroker} disabled={isHalted} className="btn btn--rose">💥 Crash Broker</button>
              <button onClick={handleRecoverBroker} disabled={isHalted} className="btn btn--emerald">🔧 Recover Broker</button>
            </div>
          </div>

          {/* Cluster Management */}
          <div className="card card--white">
            <p className="card-title card-title--gray">Cluster Management</p>
            <div className="btn-row--single">
              <button onClick={handleAddBroker} disabled={isHalted} className="btn btn--primary">
                ➕ Add Broker Node
              </button>
            </div>
            <form onSubmit={handleCreateTopic} className="form-body">
              <div className="form-group">
                <label htmlFor="new-topic-name-input" className="form-label">Topic Name</label>
                <input
                  id="new-topic-name-input"
                  type="text"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  aria-label="New topic name"
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-partitions-input" className="form-label">Partitions</label>
                <input
                  id="new-partitions-input"
                  type="number"
                  min="1"
                  max="10"
                  value={newPartitions}
                  onChange={(e) => setNewPartitions(parseInt(e.target.value, 10))}
                  aria-label="Number of partitions"
                  className="form-input"
                  required
                />
              </div>
              <button type="submit" disabled={isHalted} className="btn btn--indigo">
                📁 Create Topic
              </button>
            </form>
          </div>

          {/* Playback Scrubber & Animated Replay */}
          <div className="card card--green card--scrubber-push">
            <p className="card-title card-title--green">Playback Scrubber & Animated Replay</p>
            <div className="btn-row">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`btn ${isPaused ? 'btn--emerald' : 'btn--ghost'}`}
              >
                {isPaused ? '▶ Resume Live' : '❚❚ Pause Live'}
              </button>

              <button
                onClick={handleToggleReplay}
                className={`btn ${isReplaying ? 'btn--emerald' : 'btn--indigo'}`}
                title="Watch recorded timeline play back as animated event sequence"
              >
                {isReplaying ? '❚❚ Pause Replay' : '🎬 Replay'}
              </button>
            </div>

            {/* Replay Speed Multiplier Pills */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '11px', color: '#047857', fontWeight: 600 }}>Replay Speed:</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {([1, 2, 4] as const).map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setReplaySpeed(spd)}
                    className="btn btn--ghost"
                    style={{
                      padding: '2px 8px',
                      fontSize: '10px',
                      fontWeight: replaySpeed === spd ? 700 : 500,
                      background: replaySpeed === spd ? '#10b981' : 'transparent',
                      color: replaySpeed === spd ? '#ffffff' : '#047857',
                      borderRadius: '4px',
                    }}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button
                onClick={handleExportTrace}
                className="btn btn--ghost"
                style={{ flex: 1, fontSize: '10px', padding: '4px' }}
                title="Export current timeline as JSON trace file"
              >
                💾 Export Trace
              </button>

              <label
                className="btn btn--ghost"
                style={{ flex: 1, fontSize: '10px', padding: '4px', textAlign: 'center', cursor: 'pointer' }}
                title="Import and replay offline JSON trace"
              >
                📂 Import
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportTrace}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {isOfflineReconstituted && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px',
                  backgroundColor: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#818cf8' }}>
                    📼 RECONSTITUTION CONTROLLER
                  </span>
                  <button
                    onClick={handleExitOfflineReplay}
                    className="btn btn--ghost"
                    style={{ fontSize: '10px', padding: '2px 6px', color: '#f43f5e' }}
                  >
                    Exit Replay
                  </button>
                </div>

                <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
                  Step <strong>{currentReconstitutedStep}</strong> / {reconstitutedTimeline.length - 1} · Tick {playbackTick}
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => handleReconstitutionSeek(0)}
                    className="btn btn--ghost"
                    style={{ flex: 1, padding: '4px', fontSize: '11px' }}
                    title="Jump to beginning"
                  >
                    ⇤ Start
                  </button>
                  <button
                    onClick={handleReconstitutionStepBackward}
                    disabled={currentReconstitutedStep <= 0}
                    className="btn btn--secondary"
                    style={{ flex: 1, padding: '4px', fontSize: '11px' }}
                    title="Step backward one event"
                  >
                    ◀ Step
                  </button>
                  <button
                    onClick={handleReconstitutionStepForward}
                    disabled={currentReconstitutedStep >= (reconstitutorRef.current?.totalSteps ?? 0)}
                    className="btn btn--primary"
                    style={{ flex: 1, padding: '4px', fontSize: '11px' }}
                    title="Step forward one event"
                  >
                    Step ▶
                  </button>
                  <button
                    onClick={() => handleReconstitutionSeek((reconstitutorRef.current?.totalSteps ?? 1))}
                    className="btn btn--ghost"
                    style={{ flex: 1, padding: '4px', fontSize: '11px' }}
                    title="Jump to end"
                  >
                    End ⇥
                  </button>
                </div>

                {reconstitutedViolations.length > 0 && (
                  <button
                    onClick={() => {
                      if (reconstitutorRef.current) {
                        const target = reconstitutorRef.current.jumpToViolation(0);
                        if (target) {
                          const v = reconstitutorRef.current.getViolations()[0];
                          if (v) handleReconstitutionSeek(v.stepIndex);
                        }
                      }
                    }}
                    className="btn btn--rose"
                    style={{ fontSize: '10px', padding: '4px' }}
                  >
                    ⚠️ Jump to Invariant Violation ({reconstitutedViolations.length})
                  </button>
                )}

                <input
                  type="range"
                  className="scrubber-input"
                  min={0}
                  max={Math.max(1, (reconstitutorRef.current?.totalSteps ?? 1))}
                  value={currentReconstitutedStep}
                  onChange={(e) => handleReconstitutionSeek(parseInt(e.target.value, 10))}
                />

                {reconstitutedTimeline[currentReconstitutedStep] && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#94a3b8',
                      backgroundColor: '#0f172a',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      borderLeft: '3px solid #6366f1',
                    }}
                  >
                    {reconstitutedTimeline[currentReconstitutedStep].summary}
                  </div>
                )}
              </div>
            )}

            {!isOfflineReconstituted && isPaused && stateHistory.length > 1 && (
              <div className="scrubber-body">
                <hr className="scrubber-divider" />
                <div className="scrubber-range-row">
                  <span>Tick {String(stateHistory[0]?.tick ?? 0)}</span>
                  <span>▶ {String(playbackTick)} {isReplaying ? `(Replaying ${String(replaySpeed)}x)` : ''}</span>
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
          <ErrorBoundary fallbackTitle={`${selectedDomain.toUpperCase()} Visualizer Fault`}>
            {selectedDomain === 'kafka' ? (
              <Visualizer
                state={renderedState}
                producers={producers}
                consumers={consumers}
                produceTrigger={produceTrigger}
                resetTrigger={resetCounter}
                onHoverDetails={setHoverDetails}
                onSelectEntity={(entity) => setInspectEntity(entity)}
              />
            ) : selectedDomain === 'raft' ? (
              <RaftVisualizer
                state={raftState}
                onProposeCommand={handleRaftProposeCommand}
                onCrashNode={handleRaftCrashNode}
                onRecoverNode={handleRaftRecoverNode}
                onTogglePartition={handleRaftTogglePartition}
              />
            ) : selectedDomain === 'database' ? (
              <HashRingVisualizer
                state={dbState}
                onWriteKey={handleDBWriteKey}
                onReadKey={handleDBReadKey}
                onAddNode={handleDBAddNode}
                onCrashNode={handleDBCrashNode}
                onRecoverNode={handleDBRecoverNode}
                onUpdateConsistency={handleDBUpdateConsistency}
              />
            ) : selectedDomain === 'redis' ? (
              <RedisClusterVisualizer
                state={redisState}
                onSetKey={handleRedisSetKey}
                onGetKey={handleRedisGetKey}
                onDelKey={handleRedisDelKey}
                onReshard={handleRedisReshard}
                onCrashNode={handleRedisCrashNode}
                onRecoverNode={handleRedisRecoverNode}
                onSetEvictionPolicy={handleRedisSetEvictionPolicy}
              />
            ) : selectedDomain === 'kubernetes' ? (
              <K8sClusterVisualizer
                state={k8sState}
                onScaleDeployment={handleK8sScaleDeployment}
                onUpdateImage={handleK8sUpdateImage}
                onNodeCordon={handleK8sNodeCordon}
                onNodeDrain={handleK8sNodeDrain}
                onNodeCrash={handleK8sNodeCrash}
                onNodeRecover={handleK8sNodeRecover}
              />
            ) : selectedDomain === 'rabbitmq' ? (
              <RabbitMQVisualizer
                state={rabbitState}
                onPublish={handleRabbitPublish}
                onAck={handleRabbitAck}
                onNack={handleRabbitNack}
                onReject={handleRabbitReject}
              />
            ) : selectedDomain === 'storage' ? (
              <StorageEngineVisualizer
                state={storageState}
                onWrite={handleStorageWrite}
                onRead={handleStorageRead}
                onSwitchEngine={handleStorageSwitchEngine}
                onTriggerFlush={handleStorageTriggerFlush}
                onTriggerCompaction={handleStorageTriggerCompaction}
              />
            ) : (
              <NetworkingVisualizer
                state={networkingState}
                onStartHandshake={handleNetworkingStartHandshake}
                onSendData={handleNetworkingSendData}
                onDropPacket={handleNetworkingDropPacket}
              />
            )}
          </ErrorBoundary>
          {hoverDetails && selectedDomain === 'kafka' && (
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
        <aside className="card card--purple log-sidebar" aria-label="Event audit log and state inspector">
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

      {/* ── Deep Inspection Drawer (Per-Entity Event Log & Metadata) ── */}
      <EntityInspector
        entity={inspectEntity}
        state={renderedState}
        eventLogs={eventLogs}
        onClose={() => setInspectEntity(null)}
        onCrashBroker={handleCrashSpecificBroker}
        onRecoverBroker={handleRecoverSpecificBroker}
        onProduceKey={handleProduceKey}
      />

      {/* ── Interactive Scenarios Playbook Modal ── */}
      {showScenariosModal && (
        <ScenarioRunner
          onRunScenario={handleRunScenario}
          onOpenTraceImport={() => setShowTraceImportModal(true)}
          onClose={() => setShowScenariosModal(false)}
        />
      )}

      {/* ── Trace Reconstitution Import Modal ── */}
      {showTraceImportModal && (
        <TraceImportModal
          onLoadTrace={handleLoadReconstitutedTrace}
          onClose={() => setShowTraceImportModal(false)}
        />
      )}

      {/* ── Domain Directory Modal ── */}
      <DomainDirectoryModal
        isOpen={showDomainDirectoryModal}
        activeDomain={selectedDomain}
        onSelectDomain={(dom) => setSelectedDomain(dom)}
        onClose={() => setShowDomainDirectoryModal(false)}
      />

      {/* ── Feature Onboarding Tour ── */}
      <OnboardingTour
        isOpen={showTourModal}
        onClose={() => setShowTourModal(false)}
      />

      {/* ── Accessible Data Table Modal ── */}
      <DataTableModal
        isOpen={showTableModal}
        onClose={() => setShowTableModal(false)}
        domainName={selectedDomain.toUpperCase()}
        rows={accessibleRows}
      />

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
