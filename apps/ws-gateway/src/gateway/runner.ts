import jsonpatch from 'fast-json-patch';

const compare = (jsonpatch.compare || (jsonpatch as any).default?.compare) as typeof jsonpatch.compare;
import { Redis } from 'ioredis';

import type { KafkaClusterState } from '@the-visualizer/contracts';
import {
  logger,
  simActiveSessions,
  simInvariantViolationsTotal,
  simQueueSize,
  simResourceLimitsExceededTotal,
  simTickDurationSeconds,
  simTicksProcessedTotal,
} from '@the-visualizer/logging';
import { SimulationEngine } from '@the-visualizer/simulation';

import { config } from '../config.js';
import { roomManager } from './room-manager.js';

export interface AutoProducerSchedule {
  producerId: string;
  topic: string;
  intervalSeconds: number;
  intervalTicks: number;
  lastFiredTick: number;
  enabled: boolean;
}

export interface RoomSession {
  roomId: string;
  engine: SimulationEngine;
  tickCount: number;
  timer: NodeJS.Timeout | null;
  isHalted: boolean;
  isPaused?: boolean;
  autoProducers: Map<string, AutoProducerSchedule>;
}

export class SimulationRunner {
  private activeSessions = new Map<string, RoomSession>();
  private redis: Redis;

  constructor() {
    this.redis = new Redis(config.REDIS_URL, {
      password: config.REDIS_PASSWORD,
    });
    this.redis.on('error', (err) => {
      logger.error({ err }, 'SimulationRunner Redis connection error');
    });
  }

  /**
   * Starts a simulation session for a room if not already running.
   */
  public startSession(roomId: string, initialTopology: KafkaClusterState): void {
    if (this.activeSessions.has(roomId)) {
      return;
    }

    const engineConfig = {
      seed: 12345,
      maxTicks: 1_000_000,
      maxEvents: 5_000_000,
      maxMemoryMb: 128,
      speedMultiplier: 1.0,
    };

    const engine = new SimulationEngine(engineConfig);

    // Create callback targets
    const callbacks = {
      onEventBatch: () => {
        // No-op - event batches are not broadcasted individually to save bandwidth
      },
      onInvariantViolation: (violation: any) => {
        const message =
          typeof violation === 'object' && violation !== null && 'message' in violation
            ? String(violation.message)
            : 'Invariant safety policy violated';
        simInvariantViolationsTotal.inc({ invariant: message });
        void this.haltSession(roomId, message);
      },
      onResourceLimitExceeded: (reason: string) => {
        simResourceLimitsExceededTotal.inc({ reason });
        void this.haltSession(roomId, reason);
      },
    };

    engine.registerCallbacks(callbacks);
    engine.initialize(initialTopology);

    const session: RoomSession = {
      roomId,
      engine,
      tickCount: 0,
      timer: null,
      isHalted: false,
      isPaused: false,
      autoProducers: new Map(),
    };

    this.activeSessions.set(roomId, session);
    simActiveSessions.set(this.activeSessions.size);

    // Run tick loop at 100ms interval (10 Hz)
    session.timer = setInterval(() => {
      void this.executeTick(session);
    }, 100);
  }

  /**
   * Drains client intents from Redis queue, steps simulation timeline, and broadcasts diffs.
   */
  private async executeTick(session: RoomSession): Promise<void> {
    if (session.isHalted || session.isPaused) return;

    const startTime = performance.now();
    try {
      const { roomId, engine } = session;

      // 1. Drain pending intents from Redis List room:<roomId>:intents
      const intentsKey = `room:${roomId}:intents`;
      // Fetch up to 50 intents atomically
      const intentsRaw = await this.redis.lrange(intentsKey, 0, 49);
      if (intentsRaw.length > 0) {
        await this.redis.ltrim(intentsKey, intentsRaw.length, -1);
      }

      // Record queue size metric
      const queueLen = await this.redis.llen(intentsKey);
      simQueueSize.set({ roomId }, queueLen);

      // 2. Queue intents on simulation engine
      for (const raw of intentsRaw) {
        try {
          const intent = JSON.parse(raw) as Record<string, any>;
          if (typeof intent.type === 'string' && intent.payload) {
            let normalizedType = intent.type;
            if (!normalizedType.startsWith('INTENT_')) {
              normalizedType = `INTENT_${normalizedType}`;
            }

            // Map client intent to engine event type
            let engineEventType: string | null = null;
            let engineEventPayload = intent.payload;

            if (normalizedType === 'INTENT_PRODUCE') {
              engineEventType = 'RECORD_PRODUCED';
            } else if (normalizedType === 'INTENT_CONSUMER_JOIN') {
              engineEventType = 'CONSUMER_JOINED';
              // Inject client-assigned memberId since it's coordinated at the runner/coordinator level
              engineEventPayload = {
                groupId: intent.payload.groupId,
                clientId: intent.payload.clientId,
                memberId: intent.payload.memberId || `member-${Math.random().toString(36).substring(7)}`,
                topics: intent.payload.topics || ['orders'],
              };
            } else if (normalizedType === 'INTENT_CONSUMER_LEAVE') {
              engineEventType = 'CONSUMER_LEFT';
            } else if (normalizedType === 'INTENT_ADD_BROKER') {
              engineEventType = 'BROKER_ADDED';
              engineEventPayload = {
                brokerId: intent.payload.brokerId,
                rack: intent.payload.rack,
              };
            } else if (normalizedType === 'INTENT_CREATE_TOPIC') {
              engineEventType = 'TOPIC_CREATED';
              engineEventPayload = {
                topic: intent.payload.topic,
                partitions: intent.payload.partitions,
              };
            } else if (normalizedType === 'INTENT_CHAOS_KILL_BROKER') {
              engineEventType = 'BROKER_STATUS_CHANGED';
              engineEventPayload = {
                brokerId: intent.payload.brokerId,
                status: 'CRASHED',
              };
            } else if (normalizedType === 'INTENT_CHAOS_RECOVER_BROKER') {
              engineEventType = 'BROKER_STATUS_CHANGED';
              engineEventPayload = {
                brokerId: intent.payload.brokerId,
                status: 'ALIVE',
              };
            } else if (normalizedType === 'INTENT_SET_AUTO_PRODUCE') {
              const { producerId, topic, intervalSeconds, enabled } = intent.payload;
              const isEnabled = Boolean(enabled);
              if (!isEnabled) {
                session.autoProducers.delete(producerId);
              } else {
                const clampedSec = Math.max(0.5, Math.min(30.0, Number(intervalSeconds) || 3.0));
                const intervalTicks = Math.round(clampedSec * 10);

                const existing = session.autoProducers.get(producerId);
                session.autoProducers.set(producerId, {
                  producerId,
                  topic: topic || 'orders',
                  intervalSeconds: clampedSec,
                  intervalTicks,
                  lastFiredTick: existing?.lastFiredTick ?? (session.tickCount - intervalTicks),
                  enabled: true,
                });
              }

              await roomManager.publishRoomUpdate(roomId, {
                type: 'INTENT_ACK',
                payload: {
                  intentId: intent.id || '',
                  status: 'ACCEPTED',
                },
              });
              continue;
            } else if (normalizedType === 'INTENT_REMOVE_AUTO_PRODUCE') {
              const { producerId } = intent.payload;
              session.autoProducers.delete(producerId);

              await roomManager.publishRoomUpdate(roomId, {
                type: 'INTENT_ACK',
                payload: {
                  intentId: intent.id || '',
                  status: 'ACCEPTED',
                },
              });
              continue;
            } else if (normalizedType === 'INTENT_SIM_CONTROL') {
              const action = intent.payload.action;
              if (action === 'PLAY') {
                session.isPaused = false;
              } else if (action === 'PAUSE') {
                session.isPaused = true;
              }
              // Ack control intents immediately
              await roomManager.publishRoomUpdate(roomId, {
                type: 'INTENT_ACK',
                payload: {
                  intentId: intent.id,
                  status: 'ACCEPTED',
                },
              });
              continue;
            }

            if (engineEventType) {
              engine.scheduleEvent(
                engine.currentTick,
                intent.id || Math.random().toString(36).substring(7),
                engineEventType as any,
                engineEventPayload as Record<string, unknown>,
              );

              // Broadcast intent acknowledgement
              await roomManager.publishRoomUpdate(roomId, {
                type: 'INTENT_ACK',
                payload: {
                  intentId: intent.id || '',
                  status: 'ACCEPTED',
                },
              });
            }
          }
        } catch {
          // Ignore bad intent parsing
        }
      }

      // Record current state before transition
      const previousState = engine.state
        ? (JSON.parse(JSON.stringify(engine.state)) as KafkaClusterState)
        : null;

      // 2.5. Simulate automatic consumer poll & offset commits
      if (engine.state) {
        for (const groupId in engine.state.consumerGroups) {
          const group = engine.state.consumerGroups[groupId];
          if (!group || group.state !== 'Stable') continue;

          for (const memberId in group.members) {
            const member = group.members[memberId];
            if (!member) continue;

            for (const ap of member.assignedPartitions) {
              const partitionObj = engine.state.topics[ap.topic]?.find(
                (p: any) => p.partition === ap.partition,
              );
              if (!partitionObj) continue;

              const currentCommit = group.committedOffsets[ap.topic]?.[ap.partition] ?? 0;
              if (partitionObj.highWatermark > currentCommit) {
                engine.scheduleEvent(
                  engine.currentTick,
                  `consume-${ap.topic}-${String(ap.partition)}-${Math.random().toString(36).substring(7)}`,
                  'RECORD_CONSUMED' as any,
                  {
                    groupId,
                    topic: ap.topic,
                    partition: ap.partition,
                    offset: partitionObj.highWatermark,
                  },
                );
              }
            }
          }
        }
      }

      // 2.6. Evaluate and dispatch auto-produced messages
      if (engine.state) {
        for (const [, entry] of session.autoProducers) {
          if (!entry.enabled) continue;
          const ticksElapsed = session.tickCount - entry.lastFiredTick;
          if (ticksElapsed >= entry.intervalTicks) {
            entry.lastFiredTick = session.tickCount;

            const partitions = engine.state.topics[entry.topic] ?? [];
            const activePartitions = partitions.filter(
              (p) => p.leaderBrokerId && engine.state?.brokers[p.leaderBrokerId]?.status === 'ALIVE',
            );

            if (activePartitions.length > 0) {
              const targetPart = activePartitions[Math.floor(Math.random() * activePartitions.length)]!;
              engine.scheduleEvent(
                engine.currentTick,
                `auto-${entry.producerId}-${String(session.tickCount)}`,
                'RECORD_PRODUCED' as any,
                {
                  topic: entry.topic,
                  partition: targetPart.partition,
                  key: `auto-${entry.producerId}-${String(session.tickCount)}`,
                  value: `auto-val-${Math.random().toString(36).substring(7)}`,
                  acks: 1,
                },
              );
            }
          }
        }
      }

      // 3. Step the engine forward by 1 tick
      engine.step(1);
      session.tickCount++;

      // Guard: Halt session if tick count exceeds hard ceiling (100,000 ticks)
      if (session.tickCount >= 100_000) {
        simResourceLimitsExceededTotal.inc({ reason: 'max_ticks' });
        await this.haltSession(
          roomId,
          'Maximum simulation tick bounds exceeded (100,000 ticks ceiling).',
        );
        return;
      }

      // Guard: Check heap memory usage to prevent OOM
      const heapUsedMb = process.memoryUsage().heapUsed / 1024 / 1024;
      if (heapUsedMb > 128) {
        logger.warn(
          { roomId, heapUsedMb },
          'Simulation session memory threshold exceeded. Purging historical checkpoints.',
        );
        engine.clearHistory();

        if (heapUsedMb > 256) {
          simResourceLimitsExceededTotal.inc({ reason: 'max_memory' });
          await this.haltSession(
            roomId,
            `Worker memory usage critical (${heapUsedMb.toFixed(1)}MB). Halted to prevent crash.`,
          );
          return;
        }
      }

      // 4. Compute delta patch
      const currentState = engine.state;
      if (previousState && currentState) {
        const patch = compare(previousState, currentState);

        if (patch.length > 0) {
          // Broadcast updates to Redis room channel
          await roomManager.publishRoomUpdate(roomId, {
            type: 'EVENT_BATCH',
            payload: {
              tick: session.tickCount,
              patch,
            },
          });
        }
      }

      // 5. Periodically push replay keyframe to Redis queue for asynchronous DB flushes
      if (session.tickCount % 50 === 0 && currentState) {
        const replayFrame = {
          roomId,
          tick: session.tickCount,
          state: currentState,
          timestamp: Date.now(),
        };
        await this.redis.lpush(`simulation:${roomId}:replays`, JSON.stringify(replayFrame));
      }

      // Record tick execution metrics
      const durationSec = (performance.now() - startTime) / 1000;
      simTickDurationSeconds.observe(durationSec);
      simTicksProcessedTotal.inc();
    } catch (err: any) {
      // Catch exceptions in tick loop execution
      logger.error({ err, roomId: session.roomId }, 'Error executing simulation tick');
    }
  }

  /**
   * Halts session on invariant safety violations.
   */
  private async haltSession(roomId: string, errorMessage: string): Promise<void> {
    const session = this.activeSessions.get(roomId);
    if (!session || session.isHalted) return;

    session.isHalted = true;
    if (session.timer) {
      clearInterval(session.timer);
    }

    // Broadcast safety violation halt frame to room nodes
    await roomManager.publishRoomUpdate(roomId, {
      type: 'INVARIANT_VIOLATION',
      payload: {
        error: errorMessage,
        tick: session.tickCount,
      },
    });
  }

  /**
   * Terminates active session.
   */
  public stopSession(roomId: string): void {
    const session = this.activeSessions.get(roomId);
    if (!session) return;

    if (session.timer) {
      clearInterval(session.timer);
    }
    this.activeSessions.delete(roomId);
    simActiveSessions.set(this.activeSessions.size);
  }

  public getSession(roomId: string): RoomSession | undefined {
    return this.activeSessions.get(roomId);
  }

  public async close(): Promise<void> {
    for (const session of this.activeSessions.values()) {
      if (session.timer) clearInterval(session.timer);
    }
    this.activeSessions.clear();
    simActiveSessions.set(0);
    await this.redis.quit();
  }
}

export const simulationRunner = new SimulationRunner();
