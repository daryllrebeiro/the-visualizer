'use client';

import React, { useEffect, useRef, useState } from 'react';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import type { InspectableEntity } from '../components/inspector/EntityInspector';
import type { RenderPerfMetrics } from '../components/perf/FpsMonitor';

export interface ProducerConfig {
  id: string;
  topic: string;
  connectedBrokerIds?: string[];
  autoProduceEnabled?: boolean;
  autoProduceInterval?: number;
}

export interface ConsumerConfig {
  id: string;
  topic: string;
  groupId: string;
  joined: boolean;
  memberId: string | null;
}

export interface HoverDetails {
  title: string;
  subtitle?: string | undefined;
  stats: { label: string; value: string; color?: string | undefined }[];
}

export interface ProduceTrigger {
  id: string;
  producerId: string;
  topic: string;
  partition: number;
  timestamp: number;
}

interface VisualizerProps {
  state: KafkaClusterState | null;
  producers: ProducerConfig[];
  consumers?: ConsumerConfig[] | undefined;
  produceTrigger?: ProduceTrigger | null | undefined;
  resetTrigger?: number | undefined;
  onHoverDetails: (details: HoverDetails | null) => void;
  onSelectEntity?: ((entity: InspectableEntity) => void) | undefined;
  onPerfMetrics?: ((metrics: RenderPerfMetrics) => void) | undefined;
}

interface Particle {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  x: number;
  y: number;
  progress: number;
  speed: number;
  color: string;
  label?: string | undefined;
  leg: 1 | 2;
  topic: string;
  partition: number;
  trail: { x: number; y: number; alpha: number }[];
}

class ParticlePool {
  private pool: Particle[] = [];
  private nextId = 0;

  constructor(initialCapacity = 80) {
    for (let i = 0; i < initialCapacity; i++) {
      this.pool.push(this.createBlankParticle());
    }
  }

  private createBlankParticle(): Particle {
    return {
      id: `p-${++this.nextId}`,
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      x: 0,
      y: 0,
      progress: 0,
      speed: 0.024,
      color: '#2563eb',
      label: undefined,
      leg: 1,
      topic: '',
      partition: 0,
      trail: [],
    };
  }

  public acquire(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    speed: number,
    color: string,
    leg: 1 | 2,
    topic: string,
    partition: number,
    label?: string | undefined,
  ): Particle {
    const p = this.pool.pop() || this.createBlankParticle();
    p.startX = startX;
    p.startY = startY;
    p.endX = endX;
    p.endY = endY;
    p.x = startX;
    p.y = startY;
    p.progress = 0;
    p.speed = speed;
    p.color = color;
    p.leg = leg;
    p.topic = topic;
    p.partition = partition;
    p.label = label;
    p.trail.length = 0;
    return p;
  }

  public release(p: Particle): void {
    p.trail.length = 0;
    if (this.pool.length < 300) {
      this.pool.push(p);
    }
  }

  public clear(): void {
    this.pool.length = 0;
  }

  public get size(): number {
    return this.pool.length;
  }
}

interface DragTarget {
  key: string;
  startX: number;
  startY: number;
  nodeStartX: number;
  nodeStartY: number;
}

export function Visualizer({
  state,
  producers,
  consumers = [],
  produceTrigger,
  resetTrigger,
  onHoverDetails,
  onSelectEntity,
  onPerfMetrics,
}: VisualizerProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Live computed positions for all node types
  const brokerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const partitionPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const consumerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const producerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Performance telemetry & layout caching
  const lastLayoutKeyRef = useRef<string>('');
  const layoutVersionRef = useRef<number>(0);
  const cachedGroupMembersRef = useRef<
    {
      memberId: string;
      clientId: string;
      groupId: string;
      label: string;
      joined: boolean;
      subscribedTopics: string[];
      assignedPartitions: { topic: string; partition: number }[];
    }[]
  >([]);
  const particlePoolRef = useRef<ParticlePool>(new ParticlePool(80));
  const onPerfMetricsRef = useRef(onPerfMetrics);
  onPerfMetricsRef.current = onPerfMetrics;
  const lastRenderStats = useRef<{ rendered: number; culled: number }>({ rendered: 0, culled: 0 });

  // User-dragged custom positions that persist across simulation ticks
  const customNodePositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragTargetRef = useRef<DragTarget | null>(null);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hasCustomPositions, setHasCustomPositions] = useState(false);

  // Infinite Canvas Camera & Zoom State
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1.0 });
  const [zoomDisplay, setZoomDisplay] = useState(1.0);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  const particles = useRef<Particle[]>([]);
  const stateRef = useRef<KafkaClusterState | null>(null);
  stateRef.current = state;

  const producerLastProduceTimes = useRef<Map<string, number>>(new Map());
  const reconnectionPulsesRef = useRef<Map<string, { startTime: number; duration: number }>>(
    new Map(),
  );
  const prevConnectedBrokersRef = useRef<Map<string, Set<string>>>(new Map());

  const producersRef = useRef<ProducerConfig[]>(producers);
  producersRef.current = producers;

  const consumersRef = useRef<ConsumerConfig[]>(consumers);
  consumersRef.current = consumers;

  const getTransformedMousePos = (
    e: React.MouseEvent<HTMLCanvasElement>,
  ): { worldX: number; worldY: number; screenX: number; screenY: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { worldX: 0, worldY: 0, screenX: 0, screenY: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const cam = cameraRef.current;
    const worldX = (screenX - cx - cam.x) / cam.zoom + cx;
    const worldY = (screenY - cy - cam.y) / cam.zoom + cy;
    return { worldX, worldY, screenX, screenY };
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.max(0.3, Math.min(2.5, cameraRef.current.zoom * zoomFactor));
    cameraRef.current.zoom = newZoom;
    setZoomDisplay(newZoom);
  };

  const handleResetCamera = (): void => {
    cameraRef.current = { x: 0, y: 0, zoom: 1.0 };
    setZoomDisplay(1.0);
  };

  const handleZoomIn = (): void => {
    const newZoom = Math.min(2.5, cameraRef.current.zoom * 1.15);
    cameraRef.current.zoom = newZoom;
    setZoomDisplay(newZoom);
  };

  const handleZoomOut = (): void => {
    const newZoom = Math.max(0.3, cameraRef.current.zoom * 0.85);
    cameraRef.current.zoom = newZoom;
    setZoomDisplay(newZoom);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = (): void => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = rect?.width ?? 800;
      canvas.height = rect?.height ?? 600;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    let lastFpsUpdate = 0;
    const rollingFrameTimes: number[] = [];

    const animate = (): void => {
      const frameStart = performance.now();
      render(ctx, canvas.width, canvas.height);
      const frameTime = performance.now() - frameStart;

      rollingFrameTimes.push(frameTime);
      if (rollingFrameTimes.length > 30) rollingFrameTimes.shift();

      const now = performance.now();
      if (now - lastFpsUpdate >= 250) {
        lastFpsUpdate = now;
        if (onPerfMetricsRef.current) {
          const avgFrameTime =
            rollingFrameTimes.reduce((acc, v) => acc + v, 0) / (rollingFrameTimes.length || 1);
          const computedFps = Math.min(60, Math.round(1000 / Math.max(avgFrameTime, 16.67)));
          onPerfMetricsRef.current({
            fps: computedFps,
            frameTimeMs: avgFrameTime,
            renderedEntities: lastRenderStats.current.rendered,
            culledEntities: lastRenderStats.current.culled,
            particleCount: particles.current.length,
            poolSize: particlePoolRef.current.size,
          });
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const spawnProduceFlow = (producerId: string, topicName: string, partitionId: number): void => {
    const prodPos = producerPositions.current.get(producerId);
    const partKey = `${topicName}-${String(partitionId)}`;
    const partPos = partitionPositions.current.get(partKey);

    const currentState = stateRef.current;
    if (!prodPos) return;

    // Target position: either partition node or leader broker node
    let targetPos = partPos;
    if (!targetPos && currentState) {
      const partitions = currentState.topics[topicName] || [];
      const part = partitions.find((p) => p.partition === partitionId) || partitions[0];
      if (part?.leaderBrokerId) {
        targetPos = brokerPositions.current.get(part.leaderBrokerId);
      }
    }

    if (!targetPos) return;

    // Synchronize producer ring countdown
    producerLastProduceTimes.current.set(producerId, performance.now());

    // Spawn Leg 1: Producer → Broker/Partition using ParticlePool
    const p = particlePoolRef.current.acquire(
      prodPos.x,
      prodPos.y,
      targetPos.x,
      targetPos.y,
      0.024,
      '#2563eb', // Vibrant Blue
      1,
      topicName,
      partitionId,
      `${topicName}:${String(partitionId)}`,
    );
    particles.current.push(p);
  };

  const lastHwMap = useRef<Map<string, number>>(new Map());
  const recentManualTriggers = useRef<Map<string, number>>(new Map());

  // Reset Trigger Handler (Priority 2: Clear state, drag positions, particles, and timer caches)
  useEffect(() => {
    if (resetTrigger === undefined) return;
    customNodePositions.current.clear();
    layoutVersionRef.current++;
    particles.current.forEach((p) => particlePoolRef.current.release(p));
    particles.current = [];
    reconnectionPulsesRef.current.clear();
    producerLastProduceTimes.current.clear();
    prevConnectedBrokersRef.current.clear();
    lastHwMap.current.clear();
    recentManualTriggers.current.clear();
    setHasCustomPositions(false);
  }, [resetTrigger]);

  // Synchronize Countdown Ring on Live Frequency / Enable Changes (Priority 1.2)
  useEffect(() => {
    producers.forEach((p) => {
      if (p.autoProduceEnabled) {
        producerLastProduceTimes.current.set(p.id, performance.now());
      }
    });
  }, [producers]);

  // Immediate Trigger on UI Produce Action (Manual Click)
  useEffect(() => {
    if (!produceTrigger) return;
    const key = `${produceTrigger.topic}-${String(produceTrigger.partition)}`;
    recentManualTriggers.current.set(key, Date.now());
    spawnProduceFlow(produceTrigger.producerId, produceTrigger.topic, produceTrigger.partition);
  }, [produceTrigger]);

  // Particle Spawning on WebSocket HW Updates (Kernel Scheduled & Auto-Produce Events)
  useEffect(() => {
    if (!state) return;

    for (const topicName in state.topics) {
      const newPartitions = state.topics[topicName] || [];

      for (const newPart of newPartitions) {
        const key = `${topicName}-${String(newPart.partition)}`;
        const prevHw = lastHwMap.current.get(key);

        if (prevHw !== undefined && newPart.highWatermark > prevHw) {
          const manualTriggerTs = recentManualTriggers.current.get(key);
          const isRecentManual =
            manualTriggerTs !== undefined && Date.now() - manualTriggerTs < 1200;

          if (isRecentManual) {
            // Already animated immediately by manual UI button trigger
            recentManualTriggers.current.delete(key);
          } else {
            // Server-scheduled / Auto-produce message arrived
            const matchingProducers = producersRef.current.filter((p) => p.topic === topicName);
            const activeProds =
              matchingProducers.length > 0 ? matchingProducers : producersRef.current;

            if (activeProds.length > 0) {
              const targetProd = activeProds.find((p) => p.autoProduceEnabled) || activeProds[0]!;
              spawnProduceFlow(targetProd.id, topicName, newPart.partition);
            }
          }
        }

        // Store primitive number value for exact next-tick diffing
        lastHwMap.current.set(key, newPart.highWatermark);
      }
    }
  }, [state]);

  const handleResetLayout = (): void => {
    customNodePositions.current.clear();
    layoutVersionRef.current++;
    setHasCustomPositions(false);
  };

  const drawRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill = true,
    stroke = true,
  ): void => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  };

  const render = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
    const timeNow = Date.now();

    // 1. Light Canvas Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // ── Apply Camera Pan & Zoom Transform ──
    const cam = cameraRef.current;
    ctx.translate(width / 2 + cam.x, height / 2 + cam.y);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-width / 2, -height / 2);

    // 2. Grid Lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    const gridSize = 36;
    for (let x = -width; x < width * 2; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, -height);
      ctx.lineTo(x, height * 2);
      ctx.stroke();
    }
    for (let y = -height; y < height * 2; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(-width, y);
      ctx.lineTo(width * 2, y);
      ctx.stroke();
    }

    const currentState = stateRef.current;

    if (!currentState) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for Cluster Simulation Stream...', width / 2, height / 2);
      ctx.restore();
      return;
    }

    const brokersArray = Object.values(currentState.brokers);
    const numBrokers = brokersArray.length;
    const centerX = width / 2;
    const centerY = height / 2;
    const circleRadius = Math.min(width, height) * 0.28;
    const activeProducers = producersRef.current;

    // ── Check Dirty-State Layout Cache Key ──
    const layoutKey = `${currentState.tick}-${numBrokers}-${activeProducers.length}-${consumersRef.current.length}-${layoutVersionRef.current}-${width}x${height}`;

    if (lastLayoutKeyRef.current !== layoutKey) {
      lastLayoutKeyRef.current = layoutKey;

      // ── Calculate Broker positions (Default or Custom Dragged) ──
      brokerPositions.current.clear();
      brokersArray.forEach((broker, index) => {
        const key = `broker-${broker.id}`;
        const custom = customNodePositions.current.get(key);
        if (custom) {
          brokerPositions.current.set(broker.id, custom);
        } else {
          const angle = (2 * Math.PI * index) / numBrokers - Math.PI / 2;
          const x = centerX + circleRadius * Math.cos(angle);
          const y = centerY + circleRadius * Math.sin(angle);
          brokerPositions.current.set(broker.id, { x, y });
        }
      });

      // ── Calculate Producer positions (Default or Custom Dragged) ──
      producerPositions.current.clear();
      const numProducers = activeProducers.length;
      activeProducers.forEach((prod, index) => {
        const key = `prod-${prod.id}`;
        const custom = customNodePositions.current.get(key);
        if (custom) {
          producerPositions.current.set(prod.id, custom);
        } else {
          const x = 95;
          const y =
            numProducers > 1 ? 100 + (index * (height - 200)) / (numProducers - 1) : height / 2;
          producerPositions.current.set(prod.id, { x, y });
        }
      });

      // ── Calculate Consumer positions (Priority 1: Guaranteed Visibility) ──
      consumerPositions.current.clear();
      const allGroupMembers: {
        memberId: string;
        clientId: string;
        groupId: string;
        label: string;
        joined: boolean;
        subscribedTopics: string[];
        assignedPartitions: { topic: string; partition: number }[];
      }[] = [];

      const seenConsumerIds = new Set<string>();

      // 1. Gather live group members from cluster state
      Object.keys(currentState.consumerGroups).forEach((groupId) => {
        const group = currentState.consumerGroups[groupId];
        if (group) {
          Object.keys(group.members).forEach((memberId) => {
            const m = group.members[memberId];
            const clientId = m?.clientId ?? memberId;
            seenConsumerIds.add(memberId);
            seenConsumerIds.add(clientId);

            allGroupMembers.push({
              memberId,
              clientId,
              groupId,
              label: clientId,
              joined: true,
              subscribedTopics: m?.subscribedTopics || ['orders'],
              assignedPartitions: m?.assignedPartitions || [],
            });
          });
        }
      });

      // 2. Gather local configured consumers not yet active in cluster state
      consumersRef.current.forEach((localC) => {
        if (
          !seenConsumerIds.has(localC.id) &&
          (!localC.memberId || !seenConsumerIds.has(localC.memberId))
        ) {
          allGroupMembers.push({
            memberId: localC.id,
            clientId: localC.id,
            groupId: localC.groupId,
            label: localC.id,
            joined: localC.joined,
            subscribedTopics: [localC.topic],
            assignedPartitions: [],
          });
        }
      });

      const numConsumers = allGroupMembers.length;
      allGroupMembers.forEach((member, index) => {
        const key = `consumer-${member.memberId}`;
        const custom = customNodePositions.current.get(key);
        if (custom) {
          consumerPositions.current.set(member.memberId, custom);
        } else {
          const x = width - 105;
          const y =
            numConsumers > 1 ? 100 + (index * (height - 200)) / (numConsumers - 1) : height / 2;
          consumerPositions.current.set(member.memberId, { x, y });
        }
      });

      cachedGroupMembersRef.current = allGroupMembers;

      // ── Calculate Partition positions (Default or Custom Dragged) ──
      partitionPositions.current.clear();
      const brokerPartitionCounts = new Map<string, number>();

      for (const topicName in currentState.topics) {
        const partitions = currentState.topics[topicName] || [];
        partitions.forEach((part) => {
          const partKey = `${topicName}-${String(part.partition)}`;
          const key = `part-${partKey}`;
          const custom = customNodePositions.current.get(key);

          if (custom) {
            partitionPositions.current.set(partKey, custom);
          } else {
            const leaderId = part.leaderBrokerId;
            if (leaderId) {
              const currentCount = brokerPartitionCounts.get(leaderId) ?? 0;
              brokerPartitionCounts.set(leaderId, currentCount + 1);

              const brokerPos = brokerPositions.current.get(leaderId);
              if (brokerPos) {
                const angleOffset = (currentCount * Math.PI) / 4.5 - Math.PI / 4;
                const distance = 85;
                const x = brokerPos.x + distance * Math.cos(angleOffset);
                const y = brokerPos.y + distance * Math.sin(angleOffset);
                partitionPositions.current.set(partKey, { x, y });
              }
            }
          }
        });
      }
    }

    const allGroupMembers = cachedGroupMembersRef.current;

    // ── Frustum Culling Viewport Bounding Box Calculation ──
    const cx = width / 2;
    const cy = height / 2;
    const margin = 80;
    const viewMinX = (0 - cx - cam.x) / cam.zoom + cx - margin;
    const viewMaxX = (width - cx - cam.x) / cam.zoom + cx + margin;
    const viewMinY = (0 - cy - cam.y) / cam.zoom + cy - margin;
    const viewMaxY = (height - cy - cam.y) / cam.zoom + cy + margin;

    const isPointVisible = (x: number, y: number, r = 40): boolean => {
      return (
        x + r >= viewMinX &&
        x - r <= viewMaxX &&
        y + r >= viewMinY &&
        y - r <= viewMaxY
      );
    };

    const isLineVisible = (x1: number, y1: number, x2: number, y2: number): boolean => {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      return (
        maxX >= viewMinX &&
        minX <= viewMaxX &&
        maxY >= viewMinY &&
        minY <= viewMaxY
      );
    };

    let renderedEntities = 0;
    let culledEntities = 0;

    // ── 3. Persistent Producer → Broker Connection Lines (Priority 3: Reconnection Animation) ──
    const dashOffset = (timeNow / 35) % 16;
    activeProducers.forEach((prod) => {
      const prodPos = producerPositions.current.get(prod.id);
      if (!prodPos) return;

      const partitions = currentState.topics[prod.topic] || [];
      // Collect distinct alive leader broker IDs for this producer's topic
      const leaderSet = new Set<string>();
      for (const part of partitions) {
        if (part.leaderBrokerId && currentState.brokers[part.leaderBrokerId]?.status === 'ALIVE') {
          leaderSet.add(part.leaderBrokerId);
        }
      }
      prod.connectedBrokerIds = Array.from(leaderSet);

      const prevConnected = prevConnectedBrokersRef.current.get(prod.id) ?? new Set<string>();
      for (const brokerId of leaderSet) {
        const pulseKey = `${prod.id}-${brokerId}`;
        // If broker became connected after previously being disconnected (recovery / failover reversal)
        if (!prevConnected.has(brokerId) && prevConnected.size > 0) {
          reconnectionPulsesRef.current.set(pulseKey, { startTime: timeNow, duration: 1600 });
        }
      }
      prevConnectedBrokersRef.current.set(prod.id, new Set(leaderSet));

      // Draw lines with distinct pulse animation on reconnection
      for (const brokerId of leaderSet) {
        const brokerPos = brokerPositions.current.get(brokerId);
        if (brokerPos) {
          if (!isLineVisible(prodPos.x, prodPos.y, brokerPos.x, brokerPos.y)) {
            culledEntities++;
            continue;
          }
          renderedEntities++;

          const pulse = reconnectionPulsesRef.current.get(`${prod.id}-${brokerId}`);
          const isReconnecting = pulse && timeNow - pulse.startTime < pulse.duration;

          if (isReconnecting) {
            const pProgress = (timeNow - pulse.startTime) / pulse.duration;
            const pulseFactor = Math.sin(pProgress * Math.PI);

            // Glowing vibrant line
            ctx.strokeStyle = '#06b6d4'; // Electric Cyan
            ctx.lineWidth = 3.5 + pulseFactor * 2.5;
            ctx.shadowColor = '#0891b2';
            ctx.shadowBlur = 16 * pulseFactor;
            ctx.beginPath();
            ctx.moveTo(prodPos.x, prodPos.y);
            ctx.lineTo(brokerPos.x, brokerPos.y);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Traveling reconnection wave
            const waveProgress = ((timeNow - pulse.startTime) / 400) % 1.0;
            const waveX = prodPos.x + (brokerPos.x - prodPos.x) * waveProgress;
            const waveY = prodPos.y + (brokerPos.y - prodPos.y) * waveProgress;
            ctx.fillStyle = '#f59e0b'; // Amber pulse particle
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(waveX, waveY, 5.5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Floating badge tag
            const midX = (prodPos.x + brokerPos.x) / 2;
            const midY = (prodPos.y + brokerPos.y) / 2 - 14;
            ctx.fillStyle = '#0891b2';
            ctx.font = '700 8.5px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⚡ RECONNECTED', midX, midY);
          } else {
            ctx.strokeStyle = '#93c5fd';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 8]);
            ctx.lineDashOffset = -dashOffset;
            ctx.beginPath();
            ctx.moveTo(prodPos.x, prodPos.y);
            ctx.lineTo(brokerPos.x, brokerPos.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
          }
        }
      }
    });

    // ── 4. Consumer Assignment Lines (Partition → Consumer) ──
    allGroupMembers.forEach((member) => {
      const memberPos = consumerPositions.current.get(member.memberId);
      if (memberPos && member.joined) {
        member.assignedPartitions.forEach((ap) => {
          const partKey = `${ap.topic}-${String(ap.partition)}`;
          const partPos = partitionPositions.current.get(partKey);
          if (partPos) {
            if (!isLineVisible(partPos.x, partPos.y, memberPos.x, memberPos.y)) {
              culledEntities++;
              return;
            }
            renderedEntities++;

            ctx.strokeStyle = '#c4b5fd';
            ctx.lineWidth = 1.75;
            ctx.setLineDash([6, 6]);
            ctx.lineDashOffset = dashOffset;
            ctx.beginPath();
            ctx.moveTo(partPos.x, partPos.y);
            ctx.lineTo(memberPos.x, memberPos.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
          }
        });
      }
    });

    // ── 5. Producer Nodes ──
    activeProducers.forEach((prod) => {
      const pos = producerPositions.current.get(prod.id);
      if (pos) {
        if (!isPointVisible(pos.x, pos.y, 40)) {
          culledEntities++;
          return;
        }
        renderedEntities++;

        const isDragged = dragTargetRef.current?.key === `prod-${prod.id}`;
        if (isDragged) {
          ctx.shadowColor = 'rgba(37, 99, 235, 0.4)';
          ctx.shadowBlur = 16;
        }

        // Auto-Produce Radial Countdown Ring & Status Indicator
        if (prod.autoProduceEnabled) {
          const interval = prod.autoProduceInterval ?? 3.0;
          const duration = interval * 1000;
          let lastFired = producerLastProduceTimes.current.get(prod.id);
          if (lastFired === undefined) {
            lastFired = timeNow;
            producerLastProduceTimes.current.set(prod.id, timeNow);
          }

          const elapsed = timeNow - lastFired;
          const sweepProgress = Math.min(1, Math.max(0, (elapsed % duration) / duration));

          // Track background ring
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 34, 0, 2 * Math.PI);
          ctx.stroke();

          // Active progress arc
          ctx.strokeStyle = sweepProgress >= 0.95 ? '#059669' : '#10b981';
          ctx.lineWidth = sweepProgress >= 0.95 ? 3 : 2.5;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 34, -Math.PI / 2, -Math.PI / 2 + sweepProgress * 2 * Math.PI);
          ctx.stroke();

          // Auto-produce badge tag
          ctx.fillStyle = '#059669';
          ctx.font = '700 7px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`AUTO ${interval.toFixed(1)}s`, pos.x, pos.y - 32);
        }

        ctx.fillStyle = '#eff6ff';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 28, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#1d4ed8';
        ctx.font = '700 9.5px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PRODUCER', pos.x, pos.y - 2);

        ctx.fillStyle = '#64748b';
        ctx.font = '8px monospace';
        const label = prod.id.startsWith('producer-') ? `P-${prod.id.substring(9)}` : prod.id;
        ctx.fillText(`${label} → [${prod.topic}]`, pos.x, pos.y + 9);
      }
    });

    // ── 6. Consumer Nodes (Priority 1: High Visibility & Active Heartbeats) ──
    allGroupMembers.forEach((member) => {
      const pos = consumerPositions.current.get(member.memberId);
      if (pos) {
        if (!isPointVisible(pos.x, pos.y, 40)) {
          culledEntities++;
          return;
        }
        renderedEntities++;

        const isDragged = dragTargetRef.current?.key === `consumer-${member.memberId}`;
        if (isDragged) {
          ctx.shadowColor = 'rgba(124, 58, 237, 0.4)';
          ctx.shadowBlur = 16;
        }

        // Active pulse ring for joined consumers
        if (member.joined) {
          const pulseCycle = (timeNow / 1600) % 1;
          ctx.strokeStyle = 'rgba(139, 92, 246, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 29 + pulseCycle * 18, 0, 2 * Math.PI);
          ctx.stroke();
        }

        ctx.fillStyle = member.joined ? '#f5f3ff' : '#f8fafc';
        ctx.strokeStyle = member.joined ? '#7c3aed' : '#94a3b8';
        ctx.lineWidth = 2.5;
        if (!member.joined) ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 28, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        ctx.fillStyle = member.joined ? '#6d28d9' : '#64748b';
        ctx.font = '700 9.5px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(member.joined ? 'CONSUMER' : 'IDLE', pos.x, pos.y - 2);

        ctx.fillStyle = member.joined ? '#7c3aed' : '#64748b';
        ctx.font = '8px monospace';
        const clientLabel = member.clientId.startsWith('consumer-')
          ? `C-${member.clientId.substring(9)}`
          : member.clientId.substring(0, 6);
        const subStr = member.subscribedTopics.join(',');
        ctx.fillText(`${clientLabel} → [${subStr}]`, pos.x, pos.y + 8);

        if (member.joined && member.assignedPartitions.length > 0) {
          ctx.fillStyle = '#059669';
          ctx.font = '700 7.5px monospace';
          ctx.fillText(`${String(member.assignedPartitions.length)} part`, pos.x, pos.y + 18);
        }

        // Group label
        ctx.fillStyle = '#818cf8';
        ctx.font = '600 6.5px monospace';
        const grpLabel =
          member.groupId.length > 10 ? `${member.groupId.substring(0, 8)}…` : member.groupId;
        ctx.fillText(
          `[${grpLabel}]`,
          pos.x,
          pos.y + (member.joined && member.assignedPartitions.length > 0 ? 26 : 18),
        );
      }
    });

    // ── 7. Broker Nodes ──
    brokersArray.forEach((broker) => {
      const pos = brokerPositions.current.get(broker.id);
      if (!pos) return;
      if (!isPointVisible(pos.x, pos.y, 60)) {
        culledEntities++;
        return;
      }
      renderedEntities++;

      const isCrashed = broker.status === 'CRASHED';
      const isRecovering = broker.status === 'RECOVERING';
      const isController = currentState.kraft.activeControllerId === broker.id;
      const isDragged = dragTargetRef.current?.key === `broker-${broker.id}`;

      if (isDragged) {
        ctx.shadowColor = 'rgba(16, 185, 129, 0.4)';
        ctx.shadowBlur = 18;
      }

      if (!isCrashed) {
        const pulseCycle = (timeNow / 1500) % 1;
        ctx.strokeStyle = isRecovering ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 38 + pulseCycle * 22, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.fillStyle = isCrashed ? '#fef2f2' : isRecovering ? '#fffbeb' : '#ecfdf5';

      ctx.strokeStyle = isCrashed ? '#ef4444' : isRecovering ? '#f59e0b' : '#10b981';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 38, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = isCrashed ? '#dc2626' : '#0f172a';
      ctx.font = '700 11px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Broker ${broker.id}`, pos.x, pos.y - 4);

      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(broker.status, pos.x, pos.y + 8);

      if (isController && !isCrashed) {
        ctx.fillStyle = '#d97706';
        ctx.font = '700 8px "Inter", sans-serif';
        ctx.fillText('CONTROLLER', pos.x, pos.y + 19);
      }

      if (!isCrashed) {
        const diskPct = broker.diskUsageBytes / broker.maxDiskSizeBytes;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(pos.x - 20, pos.y - 23, 40, 3);
        ctx.fillStyle = diskPct > 0.85 ? '#ef4444' : '#10b981';
        ctx.fillRect(pos.x - 20, pos.y - 23, 40 * Math.min(diskPct, 1), 3);
      }
    });

    // ── 8. Topic Partitions ──
    for (const topicName in currentState.topics) {
      const partitions = currentState.topics[topicName] || [];
      partitions.forEach((part) => {
        const partKey = `${topicName}-${String(part.partition)}`;
        const pos = partitionPositions.current.get(partKey);
        if (!pos) return;
        if (!isPointVisible(pos.x, pos.y, 35)) {
          culledEntities++;
          return;
        }
        renderedEntities++;

        const isDragged = dragTargetRef.current?.key === `part-${partKey}`;
        if (isDragged) {
          ctx.shadowColor = 'rgba(59, 130, 246, 0.4)';
          ctx.shadowBlur = 14;
        }

        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        drawRoundRect(ctx, pos.x - 30, pos.y - 17, 60, 34, 6);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#0f172a';
        ctx.font = '700 9px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${topicName}-${String(part.partition)}`, pos.x, pos.y - 5);

        const totalSegments = 4;
        const activeSegments = Math.min(part.highWatermark, totalSegments);
        const segmentWidth = 7;
        const segmentGap = 2;
        const startX =
          pos.x - (segmentWidth * totalSegments + segmentGap * (totalSegments - 1)) / 2;
        const segmentY = pos.y + 9;

        for (let s = 0; s < totalSegments; s++) {
          ctx.fillStyle = s < activeSegments ? '#3b82f6' : '#e2e8f0';
          ctx.fillRect(startX + s * (segmentWidth + segmentGap), segmentY, segmentWidth, 3.5);
        }

        ctx.fillStyle = '#2563eb';
        ctx.font = '700 7.5px monospace';
        ctx.fillText(`HW:${String(part.highWatermark)}`, pos.x, pos.y + 5);
      });
    }

    // ── 9. Two-Legged Message Packets (Priority 2: Broker → Assigned Consumers) ──
    const newlyChained: Particle[] = [];

    particles.current.forEach((particle) => {
      particle.progress += particle.speed;
      particle.x = particle.startX + (particle.endX - particle.startX) * particle.progress;
      particle.y = particle.startY + (particle.endY - particle.startY) * particle.progress;

      const inFrustum = isPointVisible(particle.x, particle.y, 25);
      if (inFrustum) {
        renderedEntities++;
        // Trailing glow sparks (zero-allocation recycling)
        if (particle.trail.length >= 8) {
          const recycled = particle.trail.shift()!;
          recycled.x = particle.x;
          recycled.y = particle.y;
          recycled.alpha = 0.85;
          particle.trail.push(recycled);
        } else {
          particle.trail.push({ x: particle.x, y: particle.y, alpha: 0.85 });
        }

        particle.trail.forEach((t, tIdx) => {
          t.alpha *= 0.85;
          const radius = (tIdx / particle.trail.length) * 3.5;
          ctx.fillStyle =
            particle.leg === 1
              ? `rgba(59, 130, 246, ${String(t.alpha)})`
              : `rgba(124, 58, 237, ${String(t.alpha)})`;
          ctx.beginPath();
          ctx.arc(t.x, t.y, radius, 0, 2 * Math.PI);
          ctx.fill();
        });

        // Outer Glow Halo
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 12;

        // Envelope Container Token
        ctx.fillStyle = particle.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.rect(particle.x - 9, particle.y - 7, 18, 14);
        ctx.fill();
        ctx.stroke();

        // Envelope Flap Lines
        ctx.beginPath();
        ctx.moveTo(particle.x - 9, particle.y - 7);
        ctx.lineTo(particle.x, particle.y + 1);
        ctx.lineTo(particle.x + 9, particle.y - 7);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Label Badge
        if (particle.label) {
          ctx.fillStyle = '#1e293b';
          ctx.font = '700 7px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(particle.label, particle.x, particle.y - 9);
        }
      } else {
        culledEntities++;
      }

      // If Leg 1 completes, find EVERY assigned consumer and spawn Leg 2!
      if (particle.progress >= 1 && particle.leg === 1) {
        const assignedTargets: { memberId: string; pos: { x: number; y: number } }[] = [];

        for (const gId in currentState.consumerGroups) {
          const group = currentState.consumerGroups[gId];
          if (group) {
            for (const mId in group.members) {
              const member = group.members[mId];
              if (
                member?.assignedPartitions.some(
                  (ap) => ap.topic === particle.topic && ap.partition === particle.partition,
                )
              ) {
                const cPos =
                  consumerPositions.current.get(mId) ||
                  consumerPositions.current.get(member.clientId);
                if (cPos) {
                  assignedTargets.push({ memberId: mId, pos: cPos });
                }
              }
            }
          }
        }

        // Spawn Leg 2 packets to each assigned consumer using ParticlePool
        assignedTargets.forEach((target) => {
          const p2 = particlePoolRef.current.acquire(
            particle.endX,
            particle.endY,
            target.pos.x,
            target.pos.y,
            0.028,
            '#7c3aed', // Purple Consume Packet
            2,
            particle.topic,
            particle.partition,
            `P${String(particle.partition)}→${target.memberId.substring(0, 5)}`,
          );
          newlyChained.push(p2);
        });
      }
    });

    // Recycle finished particles into particle pool and retain active ones (max 50)
    const retainedParticles: Particle[] = [];
    particles.current.forEach((p) => {
      if (p.progress >= 1) {
        particlePoolRef.current.release(p);
      } else {
        retainedParticles.push(p);
      }
    });
    newlyChained.forEach((p) => retainedParticles.push(p));
    if (retainedParticles.length > 50) {
      const overflow = retainedParticles.splice(0, retainedParticles.length - 50);
      overflow.forEach((p) => particlePoolRef.current.release(p));
    }
    particles.current = retainedParticles;

    // Record rendered vs culled telemetry counts
    lastRenderStats.current = { rendered: renderedEntities, culled: culledEntities };

    ctx.restore();

    // ── Draw Minimap in Screen Space ──
    if (currentState) {
      drawMinimap(ctx, width, height, currentState);
    }
  };

  const drawMinimap = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    currentState: KafkaClusterState,
  ): void => {
    const mapW = 130;
    const mapH = 80;
    const mapX = width - mapW - 14;
    const mapY = height - mapH - 14;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    drawRoundRect(ctx, mapX, mapY, mapW, mapH, 6, true, true);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 7px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MINIMAP', mapX + 6, mapY + 10);

    const scaleX = mapW / width;
    const scaleY = mapH / height;

    for (const [brokerId, pos] of brokerPositions.current.entries()) {
      const isController = currentState.kraft.activeControllerId === brokerId;
      ctx.fillStyle = isController ? '#f59e0b' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(mapX + pos.x * scaleX, mapY + pos.y * scaleY, 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }

    for (const [, pos] of partitionPositions.current.entries()) {
      ctx.fillStyle = '#6366f1';
      ctx.beginPath();
      ctx.arc(mapX + pos.x * scaleX, mapY + pos.y * scaleY, 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    for (const [, pos] of producerPositions.current.entries()) {
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(mapX + pos.x * scaleX, mapY + pos.y * scaleY, 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    for (const [, pos] of consumerPositions.current.entries()) {
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(mapX + pos.x * scaleX, mapY + pos.y * scaleY, 2, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  // ── Hit Testing for Draggable Nodes (Priority 3) ──
  const findNodeAtPosition = (
    worldX: number,
    worldY: number,
  ): { key: string; x: number; y: number } | null => {
    const currentState = stateRef.current;
    if (!currentState) return null;

    // 1. Check Producers
    for (const [prodId, pos] of producerPositions.current.entries()) {
      if (Math.hypot(worldX - pos.x, worldY - pos.y) <= 28) {
        return { key: `prod-${prodId}`, x: pos.x, y: pos.y };
      }
    }

    // 2. Check Consumers
    for (const [memberId, pos] of consumerPositions.current.entries()) {
      if (Math.hypot(worldX - pos.x, worldY - pos.y) <= 28) {
        return { key: `consumer-${memberId}`, x: pos.x, y: pos.y };
      }
    }

    // 3. Check Partitions
    for (const [partKey, pos] of partitionPositions.current.entries()) {
      if (
        worldX >= pos.x - 30 &&
        worldX <= pos.x + 30 &&
        worldY >= pos.y - 17 &&
        worldY <= pos.y + 17
      ) {
        return { key: `part-${partKey}`, x: pos.x, y: pos.y };
      }
    }

    // 4. Check Brokers
    for (const [brokerId, pos] of brokerPositions.current.entries()) {
      if (Math.hypot(worldX - pos.x, worldY - pos.y) <= 38) {
        return { key: `broker-${brokerId}`, x: pos.x, y: pos.y };
      }
    }

    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { worldX, worldY, screenX, screenY } = getTransformedMousePos(e);

    // If middle mouse or alt key or background click -> pan camera
    if (e.button === 1 || e.altKey) {
      isPanningRef.current = true;
      panStartRef.current = {
        x: screenX,
        y: screenY,
        camX: cameraRef.current.x,
        camY: cameraRef.current.y,
      };
      return;
    }

    const hit = findNodeAtPosition(worldX, worldY);
    if (hit) {
      dragTargetRef.current = {
        key: hit.key,
        startX: worldX,
        startY: worldY,
        nodeStartX: hit.x,
        nodeStartY: hit.y,
      };
      setIsDraggingState(true);
      setHasCustomPositions(true);
    } else {
      isPanningRef.current = true;
      panStartRef.current = {
        x: screenX,
        y: screenY,
        camX: cameraRef.current.x,
        camY: cameraRef.current.y,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    const currentState = stateRef.current;
    if (!canvas || !currentState) return;
    const { worldX, worldY, screenX, screenY } = getTransformedMousePos(e);

    // Handle Camera Panning
    if (isPanningRef.current) {
      const dx = screenX - panStartRef.current.x;
      const dy = screenY - panStartRef.current.y;
      cameraRef.current.x = panStartRef.current.camX + dx;
      cameraRef.current.y = panStartRef.current.camY + dy;
      return;
    }

    // Handle Active Node Dragging
    const drag = dragTargetRef.current;
    if (drag) {
      const dx = worldX - drag.startX;
      const dy = worldY - drag.startY;
      const newX = Math.max(30, Math.min(canvas.width - 30, drag.nodeStartX + dx));
      const newY = Math.max(30, Math.min(canvas.height - 30, drag.nodeStartY + dy));
      customNodePositions.current.set(drag.key, { x: newX, y: newY });
      layoutVersionRef.current++;
      onHoverDetails(null);
      return;
    }

    // Update cursor
    const hit = findNodeAtPosition(worldX, worldY);
    canvas.style.cursor = hit ? 'grab' : isPanningRef.current ? 'grabbing' : 'default';

    // Hover inspection
    // 1. Check Brokers
    for (const brokerId in currentState.brokers) {
      const pos = brokerPositions.current.get(brokerId);
      if (pos && Math.hypot(worldX - pos.x, worldY - pos.y) <= 38) {
        const broker = currentState.brokers[brokerId];
        if (broker) {
          onHoverDetails({
            title: `Broker Node #${broker.id}`,
            subtitle:
              currentState.kraft.activeControllerId === broker.id
                ? 'Active Controller (Leader)'
                : 'Follower Node',
            stats: [
              {
                label: 'Status',
                value: broker.status,
                color: broker.status === 'ALIVE' ? '#10b981' : '#f43f5e',
              },
              { label: 'Rack', value: broker.rack ?? 'rack-a' },
              {
                label: 'Disk Usage',
                value: `${(broker.diskUsageBytes / (1024 * 1024)).toFixed(2)} MB`,
              },
              { label: 'Heartbeat', value: `Tick ${String(broker.lastHeartbeatTick)}` },
            ],
          });
          return;
        }
      }
    }

    // 2. Check Partitions
    for (const topicName in currentState.topics) {
      const partitions = currentState.topics[topicName] ?? [];
      for (const part of partitions) {
        const partKey = `${topicName}-${String(part.partition)}`;
        const pos = partitionPositions.current.get(partKey);
        if (
          pos &&
          worldX >= pos.x - 30 &&
          worldX <= pos.x + 30 &&
          worldY >= pos.y - 17 &&
          worldY <= pos.y + 17
        ) {
          onHoverDetails({
            title: `${topicName} [Partition ${String(part.partition)}]`,
            subtitle: 'Topic Log Partition',
            stats: [
              {
                label: 'Leader',
                value: part.leaderBrokerId ? `Broker ${part.leaderBrokerId}` : 'OFFLINE',
                color: part.leaderBrokerId ? '#3b82f6' : '#f43f5e',
              },
              { label: 'Epoch', value: String(part.leaderEpoch) },
              { label: 'ISR', value: part.isr.join(',') },
              { label: 'HW', value: String(part.highWatermark) },
            ],
          });
          return;
        }
      }
    }

    // 3. Check Producers
    for (const [prodId, pos] of producerPositions.current.entries()) {
      if (Math.hypot(worldX - pos.x, worldY - pos.y) <= 28) {
        const prod = producersRef.current.find((p) => p.id === prodId);
        if (prod) {
          const partitions = currentState.topics[prod.topic] ?? [];
          const leaderSet = new Set<string>();
          for (const p of partitions) {
            if (p.leaderBrokerId && currentState.brokers[p.leaderBrokerId]?.status === 'ALIVE') {
              leaderSet.add(p.leaderBrokerId);
            }
          }
          const brokerStr =
            leaderSet.size > 0
              ? Array.from(leaderSet)
                  .map((b) => `B${b}`)
                  .join(', ')
              : 'No Leaders (OFFLINE)';

          onHoverDetails({
            title: `Producer [${prodId.startsWith('producer-') ? `P-${prodId.substring(9)}` : prodId}]`,
            subtitle: `Bound Topic: [${prod.topic}]`,
            stats: [
              { label: 'Target Topic', value: prod.topic, color: '#3b82f6' },
              {
                label: 'Connected Brokers',
                value: brokerStr,
                color: leaderSet.size > 0 ? '#10b981' : '#f43f5e',
              },
              {
                label: 'Auto-Produce',
                value: prod.autoProduceEnabled
                  ? `ON (${(prod.autoProduceInterval ?? 3.0).toFixed(1)}s / ${(1 / (prod.autoProduceInterval ?? 3.0)).toFixed(2)} msg/s)`
                  : 'OFF (Manual)',
                color: prod.autoProduceEnabled ? '#10b981' : '#64748b',
              },
              { label: 'Status', value: 'Active', color: '#10b981' },
            ],
          });
          return;
        }
      }
    }

    // 4. Check Consumers
    for (const [memberId, pos] of consumerPositions.current.entries()) {
      if (Math.hypot(worldX - pos.x, worldY - pos.y) <= 28) {
        let matchedMember: any = null;
        let matchedGroupId = 'order-processors';

        for (const gId in currentState.consumerGroups) {
          const group = currentState.consumerGroups[gId];
          if (group?.members[memberId]) {
            matchedMember = group.members[memberId];
            matchedGroupId = gId;
            break;
          }
        }

        const localC = consumersRef.current.find(
          (c) => c.id === memberId || c.memberId === memberId,
        );
        const clientId = matchedMember?.clientId ?? localC?.id ?? memberId;
        const topicsStr = matchedMember?.subscribedTopics
          ? matchedMember.subscribedTopics.join(', ')
          : (localC?.topic ?? 'orders');
        const assignedCount = matchedMember?.assignedPartitions?.length ?? 0;
        const isJoined = Boolean(matchedMember || localC?.joined);

        onHoverDetails({
          title: `Consumer [${clientId.startsWith('consumer-') ? `C-${clientId.substring(9)}` : clientId}]`,
          subtitle: `Client ID: ${clientId}`,
          stats: [
            { label: 'Group', value: matchedGroupId, color: '#818cf8' },
            {
              label: 'Status',
              value: isJoined ? 'Joined (Active)' : 'Configured (Idle)',
              color: isJoined ? '#10b981' : '#94a3b8',
            },
            { label: 'Subscribed Topics', value: topicsStr },
            { label: 'Assigned Partitions', value: String(assignedCount) },
          ],
        });
        return;
      }
    }

    onHoverDetails(null);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    isPanningRef.current = false;
    const drag = dragTargetRef.current;
    if (drag) {
      const { worldX, worldY } = getTransformedMousePos(e);
      const dragDist = Math.hypot(worldX - drag.startX, worldY - drag.startY);

      // Click detection (< 6px movement)
      if (dragDist < 6 && onSelectEntity) {
        if (drag.key.startsWith('broker-')) {
          const brokerId = drag.key.substring(7);
          onSelectEntity({ type: 'broker', brokerId });
        } else if (drag.key.startsWith('partition-')) {
          const parts = drag.key.substring(10).split('-');
          const partNum = parseInt(parts.pop() ?? '0', 10);
          const topic = parts.join('-');
          onSelectEntity({ type: 'partition', topic, partition: partNum });
        } else if (drag.key.startsWith('prod-')) {
          const prodId = drag.key.substring(5);
          const p = producersRef.current.find((item) => item.id === prodId);
          onSelectEntity({ type: 'producer', producerId: prodId, topic: p?.topic ?? 'orders' });
        } else if (drag.key.startsWith('consumer-')) {
          const memberId = drag.key.substring(9);
          const c = consumersRef.current.find(
            (item) => item.id === memberId || item.memberId === memberId,
          );
          onSelectEntity({
            type: 'consumer',
            memberId,
            groupId: c?.groupId ?? 'order-processors',
          });
        }
      }
    }
    dragTargetRef.current = null;
    setIsDraggingState(false);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-full block rounded-xl bg-white"
        style={{
          cursor: isDraggingState ? 'grabbing' : isPanningRef.current ? 'grabbing' : 'default',
        }}
      />

      {/* ── Infinite Canvas Camera Controls HUD ── */}
      <div
        style={{
          position: 'absolute',
          bottom: '14px',
          left: '14px',
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
          background: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(4px)',
          padding: '4px 8px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          zIndex: 20,
        }}
      >
        <button
          onClick={handleZoomIn}
          className="btn btn--ghost"
          style={{ padding: '2px 8px', fontSize: '12px', color: '#f8fafc', height: '22px' }}
          title="Zoom In"
        >
          ＋
        </button>
        <button
          onClick={handleZoomOut}
          className="btn btn--ghost"
          style={{ padding: '2px 8px', fontSize: '12px', color: '#f8fafc', height: '22px' }}
          title="Zoom Out"
        >
          －
        </button>
        <button
          onClick={handleResetCamera}
          className="btn btn--ghost"
          style={{
            padding: '2px 8px',
            fontSize: '10px',
            color: '#94a3b8',
            height: '22px',
            fontFamily: 'var(--font-mono)',
          }}
          title="Reset Zoom & Pan"
        >
          {Math.round(zoomDisplay * 100)}%
        </button>
        {hasCustomPositions && (
          <button
            onClick={handleResetLayout}
            className="btn btn--ghost"
            style={{ padding: '2px 8px', fontSize: '10px', color: '#f59e0b', height: '22px' }}
            title="Reset all dragged node positions to default layout"
          >
            ↺ Layout
          </button>
        )}
      </div>
    </div>
  );
}
