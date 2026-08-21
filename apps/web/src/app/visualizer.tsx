'use client';

import React, { useEffect, useRef } from 'react';

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

interface VisualizerProps {
  state: KafkaClusterState | null;
  producers: ProducerConfig[];
  consumers?: ConsumerConfig[] | undefined;
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
  size: number;
  leg: 1 | 2;
  chainedTarget?: { x: number; y: number; color: string } | undefined;
}

export function Visualizer({ state, producers, consumers = [], onHoverDetails }: VisualizerProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const brokerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const partitionPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const consumerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const producerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

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

  // Particle Spawning on HW and Offset Advances
  useEffect(() => {
    if (!state) return;
    const lastState = lastStateRef.current;
    if (!lastState) {
      lastStateRef.current = state;
      return;
    }

    // Two-leg Produce particles: Producer -> Broker Partition -> Consumers
    for (const topicName in state.topics) {
      const newPartitions = state.topics[topicName] || [];
      const oldPartitions = lastState.topics[topicName] || [];

      for (const newPart of newPartitions) {
        const oldPart = oldPartitions.find((p) => p.partition === newPart.partition);
        if (oldPart && newPart.highWatermark > oldPart.highWatermark) {
          const partKey = `${topicName}-${String(newPart.partition)}`;
          const partPos = partitionPositions.current.get(partKey);

          // Find producer matching this topic
          const matchingProducers = producersRef.current.filter((p) => p.topic === topicName);
          const activeProds = matchingProducers.length > 0 ? matchingProducers : producersRef.current;

          if (partPos && activeProds.length > 0) {
            const targetProd = activeProds[Math.floor(Math.random() * activeProds.length)]!;
            const prodPos = producerPositions.current.get(targetProd.id);

            if (prodPos) {
              // Find assigned consumers for second leg
              let consumerPos: { x: number; y: number } | null = null;
              for (const gId in state.consumerGroups) {
                const group = state.consumerGroups[gId];
                if (group) {
                  for (const mId in group.members) {
                    const member = group.members[mId];
                    if (
                      member?.assignedPartitions.some(
                        (ap) => ap.topic === topicName && ap.partition === newPart.partition,
                      )
                    ) {
                      const cPos = consumerPositions.current.get(mId);
                      if (cPos) consumerPos = cPos;
                      break;
                    }
                  }
                }
              }

              // Leg 1: Producer to Partition/Broker
              particles.current.push({
                id: Math.random().toString(36).substring(7),
                startX: prodPos.x,
                startY: prodPos.y,
                endX: partPos.x,
                endY: partPos.y,
                x: prodPos.x,
                y: prodPos.y,
                progress: 0,
                speed: 0.03 + Math.random() * 0.01,
                color: '#2563eb', // Blue produce envelope
                size: 4,
                leg: 1,
                chainedTarget: consumerPos ? { x: consumerPos.x, y: consumerPos.y, color: '#4f46e5' } : undefined,
              });
            }
          }
        }
      }
    }

    // Direct Consume particles on offset commits
    for (const groupId in state.consumerGroups) {
      const group = state.consumerGroups[groupId];
      const oldGroup = lastState.consumerGroups[groupId];
      if (!group) continue;

      for (const topicName in group.committedOffsets) {
        const newOffsets = group.committedOffsets[topicName] || {};
        const oldOffsets = oldGroup?.committedOffsets[topicName] || {};

        for (const partStr in newOffsets) {
          const newOff = newOffsets[partStr] ?? 0;
          const oldOff = oldOffsets[partStr] ?? 0;

          if (newOff > oldOff) {
            const partKey = `${topicName}-${partStr}`;
            const partPos = partitionPositions.current.get(partKey);

            let memberId = '';
            for (const mId in group.members) {
              const member = group.members[mId];
              if (
                member?.assignedPartitions.some(
                  (ap) => ap.topic === topicName && String(ap.partition) === partStr,
                )
              ) {
                memberId = mId;
                break;
              }
            }

            const memberPos = consumerPositions.current.get(memberId);
            if (partPos && memberPos) {
              particles.current.push({
                id: Math.random().toString(36).substring(7),
                startX: partPos.x,
                startY: partPos.y,
                endX: memberPos.x,
                endY: memberPos.y,
                x: partPos.x,
                y: partPos.y,
                progress: 0,
                speed: 0.035,
                color: '#4f46e5', // Indigo consume envelope
                size: 4,
                leg: 2,
              });
            }
          }
        }
      }
    }

    lastStateRef.current = state;
  }, [state]);

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
    // Light Canvas Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Subtle Light Grid Lines
    ctx.strokeStyle = '#e2e8f0';
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

    // 1. Calculate Broker positions
    brokerPositions.current.clear();
    brokersArray.forEach((broker, index) => {
      const angle = (2 * Math.PI * index) / numBrokers - Math.PI / 2;
      const x = centerX + circleRadius * Math.cos(angle);
      const y = centerY + circleRadius * Math.sin(angle);
      brokerPositions.current.set(broker.id, { x, y });
    });

    // 2. Calculate Producer positions
    producerPositions.current.clear();
    const activeProducers = producersRef.current;
    const numProducers = activeProducers.length;
    activeProducers.forEach((prod, index) => {
      const x = 90;
      const y = numProducers > 1 ? 100 + (index * (height - 200)) / (numProducers - 1) : height / 2;
      producerPositions.current.set(prod.id, { x, y });
    });

    // 3. Calculate Consumer positions (Cluster Joined + Configured Local)
    consumerPositions.current.clear();
    const allGroupMembers: {
      memberId: string;
      clientId: string;
      groupId: string;
      label: string;
      joined: boolean;
      subscribedTopics?: string[] | undefined;
    }[] = [];

    // Joined members from cluster
    Object.keys(currentState.consumerGroups).forEach((groupId) => {
      const group = currentState.consumerGroups[groupId];
      if (group) {
        Object.keys(group.members).forEach((memberId) => {
          const m = group.members[memberId];
          allGroupMembers.push({
            memberId,
            clientId: m?.clientId ?? memberId,
            groupId,
            label: `${groupId} (${memberId.substring(0, 6)})`,
            joined: true,
            subscribedTopics: m?.subscribedTopics,
          });
        });
      }
    });

    // Add any configured consumers that haven't joined yet
    consumersRef.current.forEach((localC) => {
      if (!localC.joined || !localC.memberId) {
        allGroupMembers.push({
          memberId: localC.id,
          clientId: localC.id,
          groupId: 'order-processors',
          label: `${localC.id} (Idle)`,
          joined: false,
          subscribedTopics: [localC.topic],
        });
      }
    });

    const numConsumers = allGroupMembers.length;
    allGroupMembers.forEach((member, index) => {
      const x = width - 110;
      const y = numConsumers > 1 ? 100 + (index * (height - 200)) / (numConsumers - 1) : height / 2;
      consumerPositions.current.set(member.memberId, { x, y });
    });

    // 4. Calculate Partition positions
    partitionPositions.current.clear();
    const brokerPartitionCounts = new Map<string, number>();

    for (const topicName in currentState.topics) {
      const partitions = currentState.topics[topicName] || [];
      partitions.forEach((part) => {
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
            partitionPositions.current.set(`${topicName}-${String(part.partition)}`, { x, y });
          }
        }
      });
    }

    // ── Persistent Producer → Broker Connection Lines (Priority 2.1) ──
    activeProducers.forEach((prod) => {
      const prodPos = producerPositions.current.get(prod.id);
      if (!prodPos) return;

      const partitions = currentState.topics[prod.topic] || [];
      // Resolve current leader broker for producer's topic
      const activePartition = partitions.find(
        (p) => p.leaderBrokerId && currentState.brokers[p.leaderBrokerId]?.status === 'ALIVE',
      ) || partitions[0];

      const leaderBrokerId = activePartition?.leaderBrokerId;
      prod.connectedBrokerId = leaderBrokerId ?? null;

      if (leaderBrokerId) {
        const brokerPos = brokerPositions.current.get(leaderBrokerId);
        if (brokerPos) {
          // Draw subtle dashed connection edge
          ctx.strokeStyle = '#93c5fd';
          ctx.lineWidth = 1.75;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(prodPos.x, prodPos.y);
          ctx.lineTo(brokerPos.x, brokerPos.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Connection indicator dot on edge
          const midX = (prodPos.x + brokerPos.x) / 2;
          const midY = (prodPos.y + brokerPos.y) / 2;
          ctx.fillStyle = '#3b82f6';
          ctx.beginPath();
          ctx.arc(midX, midY, 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    });

    // ── Consumer Assignment Lines ──
    ctx.lineWidth = 1.5;
    Object.keys(currentState.consumerGroups).forEach((groupId) => {
      const group = currentState.consumerGroups[groupId];
      if (!group) return;

      Object.keys(group.members).forEach((memberId) => {
        const member = group.members[memberId];
        const memberPos = consumerPositions.current.get(memberId);
        if (member && memberPos) {
          member.assignedPartitions.forEach((ap) => {
            const partKey = `${ap.topic}-${String(ap.partition)}`;
            const partPos = partitionPositions.current.get(partKey);
            if (partPos) {
              ctx.strokeStyle = '#c7d2fe';
              ctx.beginPath();
              ctx.moveTo(memberPos.x, memberPos.y);
              ctx.lineTo(partPos.x, partPos.y);
              ctx.stroke();
            }
          });
        }
      });
    });

    // ── Producer Nodes ──
    activeProducers.forEach((prod) => {
      const pos = producerPositions.current.get(prod.id);
      if (pos) {
        ctx.fillStyle = '#eff6ff';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 30, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1d4ed8';
        ctx.font = '600 10px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PRODUCER', pos.x, pos.y);

        ctx.fillStyle = '#64748b';
        ctx.font = '8px monospace';
        const label = prod.id.startsWith('producer-') ? `P-${prod.id.substring(9)}` : prod.id;
        ctx.fillText(`${label} → [${prod.topic}]`, pos.x, pos.y + 11);
      }
    });

    // ── Consumer Nodes ──
    allGroupMembers.forEach((member) => {
      const pos = consumerPositions.current.get(member.memberId);
      if (pos) {
        ctx.fillStyle = member.joined ? '#eef2ff' : '#f8fafc';
        ctx.strokeStyle = member.joined ? '#4f46e5' : '#94a3b8';
        ctx.lineWidth = 2;
        if (!member.joined) ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 30, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = member.joined ? '#4338ca' : '#64748b';
        ctx.font = '600 9px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(member.joined ? 'CONSUMER' : 'IDLE', pos.x, pos.y - 1);

        ctx.fillStyle = '#64748b';
        ctx.font = '8px monospace';
        const clientLabel = member.memberId.startsWith('consumer-')
          ? `C-${member.memberId.substring(9)}`
          : member.memberId.substring(0, 6);
        const subStr = member.subscribedTopics ? member.subscribedTopics.join(',') : 'all';
        ctx.fillText(`${clientLabel} → [${subStr}]`, pos.x, pos.y + 10);
      }
    });

    // ── Broker Nodes ──
    brokersArray.forEach((broker) => {
      const pos = brokerPositions.current.get(broker.id);
      if (!pos) return;

      const isCrashed = broker.status === 'CRASHED';
      const isRecovering = broker.status === 'RECOVERING';
      const isController = currentState.kraft.activeControllerId === broker.id;

      // Heartbeat pulse ring for alive brokers
      if (!isCrashed) {
        const pulseCycle = (Date.now() / 1500) % 1;
        ctx.strokeStyle = isRecovering ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 40 + pulseCycle * 25, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.fillStyle = isCrashed
        ? '#fef2f2' // Light Pastel Red
        : isRecovering
          ? '#fffbeb' // Light Pastel Yellow
          : '#ecfdf5'; // Light Pastel Emerald Green

      ctx.strokeStyle = isCrashed ? '#ef4444' : isRecovering ? '#f59e0b' : '#10b981';

      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 40, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isCrashed ? '#dc2626' : '#0f172a';
      ctx.font = '600 11px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Broker ${broker.id}`, pos.x, pos.y - 4);

      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(broker.status, pos.x, pos.y + 8);

      if (isController && !isCrashed) {
        ctx.fillStyle = '#d97706';
        ctx.font = '600 8px "Inter", sans-serif';
        ctx.fillText('CONTROLLER', pos.x, pos.y + 20);
      }

      if (!isCrashed) {
        const diskPct = broker.diskUsageBytes / broker.maxDiskSizeBytes;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(pos.x - 22, pos.y - 25, 44, 3);

        ctx.fillStyle = diskPct > 0.85 ? '#ef4444' : '#10b981';
        ctx.fillRect(pos.x - 22, pos.y - 25, 44 * Math.min(diskPct, 1), 3);
      }
    });

    // ── Topic Partitions ──
    for (const topicName in currentState.topics) {
      const partitions = currentState.topics[topicName] || [];
      partitions.forEach((part) => {
        const partKey = `${topicName}-${String(part.partition)}`;
        const pos = partitionPositions.current.get(partKey);
        if (!pos) return;

        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        drawRoundRect(ctx, pos.x - 32, pos.y - 18, 64, 36, 6);

        ctx.fillStyle = '#0f172a';
        ctx.font = '600 9px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${topicName}-${String(part.partition)}`, pos.x, pos.y - 5);

        // Draw log queue segments indicator
        const totalSegments = 4;
        const activeSegments = Math.min(part.highWatermark, totalSegments);
        const segmentWidth = 8;
        const segmentGap = 2;
        const startX = pos.x - ((segmentWidth * totalSegments + segmentGap * (totalSegments - 1)) / 2);
        const segmentY = pos.y + 10;

        for (let s = 0; s < totalSegments; s++) {
          ctx.fillStyle = s < activeSegments ? '#3b82f6' : '#e2e8f0';
          ctx.fillRect(startX + s * (segmentWidth + segmentGap), segmentY, segmentWidth, 4);
        }

        ctx.fillStyle = '#2563eb';
        ctx.font = '600 7px monospace';
        ctx.fillText(`HW:${String(part.highWatermark)}`, pos.x, pos.y + 5);
      });
    }

    // ── Animated Message Packets (Priority 2.2) ──
    particles.current.forEach((particle, index) => {
      particle.progress += particle.speed;
      particle.x = particle.startX + (particle.endX - particle.startX) * particle.progress;
      particle.y = particle.startY + (particle.endY - particle.startY) * particle.progress;

      // Draw crisp envelope token
      ctx.fillStyle = particle.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.rect(particle.x - 8, particle.y - 6, 16, 12);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(particle.x - 8, particle.y - 6);
      ctx.lineTo(particle.x, particle.y + 1);
      ctx.lineTo(particle.x + 8, particle.y - 6);
      ctx.stroke();

      if (particle.progress >= 1) {
        // If Leg 1 finishes and chained consumer target exists, spawn Leg 2!
        if (particle.leg === 1 && particle.chainedTarget) {
          particles.current.push({
            id: Math.random().toString(36).substring(7),
            startX: particle.endX,
            startY: particle.endY,
            endX: particle.chainedTarget.x,
            endY: particle.chainedTarget.y,
            x: particle.endX,
            y: particle.endY,
            progress: 0,
            speed: 0.035,
            color: particle.chainedTarget.color,
            size: 4,
            leg: 2,
          });
        }
        particles.current.splice(index, 1);
      }
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    const currentState = stateRef.current;
    if (!canvas || !currentState) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check Brokers
    for (const brokerId in currentState.brokers) {
      const pos = brokerPositions.current.get(brokerId);
      if (pos) {
        const dist = Math.hypot(mouseX - pos.x, mouseY - pos.y);
        if (dist < 40) {
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
                { label: 'Host', value: `${broker.host}:${String(broker.port)}` },
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
    }

    // Check Partitions
    for (const topicName in currentState.topics) {
      const partitions = currentState.topics[topicName] || [];
      for (const part of partitions) {
        const partKey = `${topicName}-${String(part.partition)}`;
        const pos = partitionPositions.current.get(partKey);
        if (pos) {
          if (
            mouseX >= pos.x - 32 &&
            mouseX <= pos.x + 32 &&
            mouseY >= pos.y - 18 &&
            mouseY <= pos.y + 18
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
    }

    // Check Producers (Priority 1.1 / 1.3 HUD Tooltip)
    for (const [prodId, pos] of producerPositions.current.entries()) {
      const dist = Math.hypot(mouseX - pos.x, mouseY - pos.y);
      if (dist < 30) {
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

    // Check Consumers (Priority 3.1 Detail Tooltip)
    for (const [memberId, pos] of consumerPositions.current.entries()) {
      const dist = Math.hypot(mouseX - pos.x, mouseY - pos.y);
      if (dist < 30) {
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

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      className="w-full h-full block rounded-xl cursor-crosshair bg-white"
    />
  );
}
