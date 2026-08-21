'use client';

import React, { useEffect, useRef, useState } from 'react';

import type { KafkaClusterState } from '@the-visualizer/contracts';

export interface ProducerConfig {
  id: string;
  topic: string;
  connectedBrokerId?: string | null | undefined;
}

export interface ConsumerConfig {
  id: string;
  topic: string;
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
  onHoverDetails: (details: HoverDetails | null) => void;
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
  onHoverDetails,
}: VisualizerProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Live computed positions for all node types
  const brokerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const partitionPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const consumerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const producerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  // User-dragged custom positions that persist across simulation ticks
  const customNodePositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragTargetRef = useRef<DragTarget | null>(null);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hasCustomPositions, setHasCustomPositions] = useState(false);

  const particles = useRef<Particle[]>([]);
  const lastStateRef = useRef<KafkaClusterState | null>(null);
  const stateRef = useRef<KafkaClusterState | null>(null);
  stateRef.current = state;

  const producersRef = useRef<ProducerConfig[]>(producers);
  producersRef.current = producers;

  const consumersRef = useRef<ConsumerConfig[]>(consumers);
  consumersRef.current = consumers;

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

    const animate = (): void => {
      render(ctx, canvas.width, canvas.height);
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

  const spawnProduceFlow = (
    producerId: string,
    topicName: string,
    partitionId: number,
  ): void => {
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

    // Spawn Leg 1: Producer → Broker/Partition
    particles.current.push({
      id: Math.random().toString(36).substring(7),
      startX: prodPos.x,
      startY: prodPos.y,
      endX: targetPos.x,
      endY: targetPos.y,
      x: prodPos.x,
      y: prodPos.y,
      progress: 0,
      speed: 0.024,
      color: '#2563eb', // Vibrant Blue
      label: `${topicName}:${String(partitionId)}`,
      leg: 1,
      topic: topicName,
      partition: partitionId,
      trail: [],
    });
  };

  // Immediate Trigger on UI Produce Action
  useEffect(() => {
    if (!produceTrigger) return;
    spawnProduceFlow(
      produceTrigger.producerId,
      produceTrigger.topic,
      produceTrigger.partition,
    );
  }, [produceTrigger]);

  // Particle Spawning on WebSocket HW Updates
  useEffect(() => {
    if (!state) return;
    const lastState = lastStateRef.current;
    if (!lastState) {
      lastStateRef.current = state;
      return;
    }

    for (const topicName in state.topics) {
      const newPartitions = state.topics[topicName] || [];
      const oldPartitions = lastState.topics[topicName] || [];

      for (const newPart of newPartitions) {
        const oldPart = oldPartitions.find((p) => p.partition === newPart.partition);
        if (oldPart && newPart.highWatermark > oldPart.highWatermark) {
          const matchingProducers = producersRef.current.filter((p) => p.topic === topicName);
          const activeProds = matchingProducers.length > 0 ? matchingProducers : producersRef.current;

          if (activeProds.length > 0) {
            const targetProd = activeProds[Math.floor(Math.random() * activeProds.length)]!;
            spawnProduceFlow(targetProd.id, topicName, newPart.partition);
          }
        }
      }
    }

    lastStateRef.current = state;
  }, [state]);

  const handleResetLayout = (): void => {
    customNodePositions.current.clear();
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

    // 2. Grid Lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    const gridSize = 36;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const currentState = stateRef.current;

    if (!currentState) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for Cluster Simulation Stream...', width / 2, height / 2);
      return;
    }

    const brokersArray = Object.values(currentState.brokers);
    const numBrokers = brokersArray.length;
    const centerX = width / 2;
    const centerY = height / 2;
    const circleRadius = Math.min(width, height) * 0.28;

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
    const activeProducers = producersRef.current;
    const numProducers = activeProducers.length;
    activeProducers.forEach((prod, index) => {
      const key = `prod-${prod.id}`;
      const custom = customNodePositions.current.get(key);
      if (custom) {
        producerPositions.current.set(prod.id, custom);
      } else {
        const x = 95;
        const y = numProducers > 1 ? 100 + (index * (height - 200)) / (numProducers - 1) : height / 2;
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
      if (!seenConsumerIds.has(localC.id) && (!localC.memberId || !seenConsumerIds.has(localC.memberId))) {
        allGroupMembers.push({
          memberId: localC.id,
          clientId: localC.id,
          groupId: 'order-processors',
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
        const y = numConsumers > 1 ? 100 + (index * (height - 200)) / (numConsumers - 1) : height / 2;
        consumerPositions.current.set(member.memberId, { x, y });
      }
    });

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

    // ── 3. Persistent Producer → Broker Connection Lines (With Dash Stream) ──
    const dashOffset = (timeNow / 35) % 16;
    activeProducers.forEach((prod) => {
      const prodPos = producerPositions.current.get(prod.id);
      if (!prodPos) return;

      const partitions = currentState.topics[prod.topic] || [];
      const activePartition = partitions.find(
        (p) => p.leaderBrokerId && currentState.brokers[p.leaderBrokerId]?.status === 'ALIVE',
      ) || partitions[0];

      const leaderBrokerId = activePartition?.leaderBrokerId;
      prod.connectedBrokerId = leaderBrokerId ?? null;

      if (leaderBrokerId) {
        const brokerPos = brokerPositions.current.get(leaderBrokerId);
        if (brokerPos) {
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
    });

    // ── 4. Consumer Assignment Lines (Partition → Consumer) ──
    allGroupMembers.forEach((member) => {
      const memberPos = consumerPositions.current.get(member.memberId);
      if (memberPos && member.joined) {
        member.assignedPartitions.forEach((ap) => {
          const partKey = `${ap.topic}-${String(ap.partition)}`;
          const partPos = partitionPositions.current.get(partKey);
          if (partPos) {
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
        const isDragged = dragTargetRef.current?.key === `prod-${prod.id}`;
        if (isDragged) {
          ctx.shadowColor = 'rgba(37, 99, 235, 0.4)';
          ctx.shadowBlur = 16;
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
      }
    });

    // ── 7. Broker Nodes ──
    brokersArray.forEach((broker) => {
      const pos = brokerPositions.current.get(broker.id);
      if (!pos) return;

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

      ctx.fillStyle = isCrashed
        ? '#fef2f2'
        : isRecovering
          ? '#fffbeb'
          : '#ecfdf5';

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
        const startX = pos.x - ((segmentWidth * totalSegments + segmentGap * (totalSegments - 1)) / 2);
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

      // Trailing glow sparks
      particle.trail.push({ x: particle.x, y: particle.y, alpha: 0.85 });
      if (particle.trail.length > 8) particle.trail.shift();

      particle.trail.forEach((t, tIdx) => {
        t.alpha *= 0.85;
        const radius = (tIdx / particle.trail.length) * 3.5;
        ctx.fillStyle = particle.leg === 1
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
                const cPos = consumerPositions.current.get(mId) || consumerPositions.current.get(member.clientId);
                if (cPos) {
                  assignedTargets.push({ memberId: mId, pos: cPos });
                }
              }
            }
          }
        }

        // Spawn Leg 2 packets to each assigned consumer
        assignedTargets.forEach((target) => {
          newlyChained.push({
            id: Math.random().toString(36).substring(7),
            startX: particle.endX,
            startY: particle.endY,
            endX: target.pos.x,
            endY: target.pos.y,
            x: particle.endX,
            y: particle.endY,
            progress: 0,
            speed: 0.028,
            color: '#7c3aed', // Purple Consume Packet
            label: `P${String(particle.partition)}→${target.memberId.substring(0, 5)}`,
            leg: 2,
            topic: particle.topic,
            partition: particle.partition,
            trail: [],
          });
        });
      }
    });

    // Remove finished particles and append new chained Leg 2 packets
    particles.current = particles.current.filter((p) => p.progress < 1).concat(newlyChained);
  };

  // ── Hit Testing for Draggable Nodes (Priority 3) ──
  const findNodeAtPosition = (
    mouseX: number,
    mouseY: number,
  ): { key: string; x: number; y: number } | null => {
    const currentState = stateRef.current;
    if (!currentState) return null;

    // 1. Check Producers
    for (const [prodId, pos] of producerPositions.current.entries()) {
      if (Math.hypot(mouseX - pos.x, mouseY - pos.y) <= 28) {
        return { key: `prod-${prodId}`, x: pos.x, y: pos.y };
      }
    }

    // 2. Check Consumers
    for (const [memberId, pos] of consumerPositions.current.entries()) {
      if (Math.hypot(mouseX - pos.x, mouseY - pos.y) <= 28) {
        return { key: `consumer-${memberId}`, x: pos.x, y: pos.y };
      }
    }

    // 3. Check Partitions
    for (const [partKey, pos] of partitionPositions.current.entries()) {
      if (
        mouseX >= pos.x - 30 &&
        mouseX <= pos.x + 30 &&
        mouseY >= pos.y - 17 &&
        mouseY <= pos.y + 17
      ) {
        return { key: `part-${partKey}`, x: pos.x, y: pos.y };
      }
    }

    // 4. Check Brokers
    for (const [brokerId, pos] of brokerPositions.current.entries()) {
      if (Math.hypot(mouseX - pos.x, mouseY - pos.y) <= 38) {
        return { key: `broker-${brokerId}`, x: pos.x, y: pos.y };
      }
    }

    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const hit = findNodeAtPosition(mouseX, mouseY);
    if (hit) {
      dragTargetRef.current = {
        key: hit.key,
        startX: mouseX,
        startY: mouseY,
        nodeStartX: hit.x,
        nodeStartY: hit.y,
      };
      setIsDraggingState(true);
      setHasCustomPositions(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    const currentState = stateRef.current;
    if (!canvas || !currentState) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Handle Active Dragging
    const drag = dragTargetRef.current;
    if (drag) {
      const dx = mouseX - drag.startX;
      const dy = mouseY - drag.startY;
      const newX = Math.max(30, Math.min(canvas.width - 30, drag.nodeStartX + dx));
      const newY = Math.max(30, Math.min(canvas.height - 30, drag.nodeStartY + dy));
      customNodePositions.current.set(drag.key, { x: newX, y: newY });
      onHoverDetails(null);
      return;
    }

    // Update cursor
    const hit = findNodeAtPosition(mouseX, mouseY);
    canvas.style.cursor = hit ? 'grab' : 'default';

    // Hover inspection
    // 1. Check Brokers
    for (const brokerId in currentState.brokers) {
      const pos = brokerPositions.current.get(brokerId);
      if (pos && Math.hypot(mouseX - pos.x, mouseY - pos.y) <= 38) {
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
      const partitions = currentState.topics[topicName] || [];
      for (const part of partitions) {
        const partKey = `${topicName}-${String(part.partition)}`;
        const pos = partitionPositions.current.get(partKey);
        if (
          pos &&
          mouseX >= pos.x - 30 &&
          mouseX <= pos.x + 30 &&
          mouseY >= pos.y - 17 &&
          mouseY <= pos.y + 17
        ) {
          onHoverDetails({
            title: `Partition [${topicName}-${String(part.partition)}]`,
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
      if (Math.hypot(mouseX - pos.x, mouseY - pos.y) <= 28) {
        const prod = producersRef.current.find((p) => p.id === prodId);
        if (prod) {
          const partitions = currentState.topics[prod.topic] || [];
          const activeLeader = partitions.find(
            (p) => p.leaderBrokerId && currentState.brokers[p.leaderBrokerId]?.status === 'ALIVE',
          )?.leaderBrokerId;

          onHoverDetails({
            title: `Producer [${prodId.startsWith('producer-') ? `P-${prodId.substring(9)}` : prodId}]`,
            subtitle: `Bound Topic: [${prod.topic}]`,
            stats: [
              { label: 'Target Topic', value: prod.topic, color: '#3b82f6' },
              {
                label: 'Connected Broker',
                value: activeLeader ? `Broker ${activeLeader}` : 'No Leader (OFFLINE)',
                color: activeLeader ? '#10b981' : '#f43f5e',
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
      if (Math.hypot(mouseX - pos.x, mouseY - pos.y) <= 28) {
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

        const localC = consumersRef.current.find((c) => c.id === memberId || c.memberId === memberId);
        const clientId = matchedMember?.clientId ?? localC?.id ?? memberId;
        const topicsStr = matchedMember?.subscribedTopics
          ? matchedMember.subscribedTopics.join(', ')
          : localC?.topic ?? 'orders';
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

  const handleMouseUp = (): void => {
    dragTargetRef.current = null;
    setIsDraggingState(false);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-full block rounded-xl bg-white"
        style={{ cursor: isDraggingState ? 'grabbing' : 'default' }}
      />
      {hasCustomPositions && (
        <button
          onClick={handleResetLayout}
          className="btn btn--ghost"
          style={{
            position: 'absolute',
            bottom: '14px',
            right: '14px',
            fontSize: '10px',
            padding: '4px 10px',
            background: 'rgba(255, 255, 255, 0.92)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            zIndex: 20,
            cursor: 'pointer',
          }}
          title="Reset all dragged node positions to default layout"
        >
          ↺ Reset Layout
        </button>
      )}
    </div>
  );
}
