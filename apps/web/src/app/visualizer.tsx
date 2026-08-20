'use client';

import React, { useEffect, useRef } from 'react';

import type { KafkaClusterState } from '@the-visualizer/contracts';

interface VisualizerProps {
  state: KafkaClusterState | null;
  onHoverDetails: (details: string | null) => void;
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
}

export function Visualizer({ state, onHoverDetails }: VisualizerProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const brokerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const partitionPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const consumerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const producerPosition = useRef<{ x: number; y: number }>({ x: 50, y: 300 });

  const particles = useRef<Particle[]>([]);
  const lastStateRef = useRef<KafkaClusterState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = rect?.width ?? 800;
      canvas.height = rect?.height ?? 600;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const animate = () => {
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
  }, [state]);

  // Particle Spawning
  useEffect(() => {
    if (!state) return;
    const lastState = lastStateRef.current;
    if (!lastState) {
      lastStateRef.current = state;
      return;
    }

    // Produce particles
    for (const topicName in state.topics) {
      const newPartitions = state.topics[topicName] || [];
      const oldPartitions = lastState.topics[topicName] || [];

      for (const newPart of newPartitions) {
        const oldPart = oldPartitions.find((p) => p.partition === newPart.partition);
        if (oldPart && newPart.highWatermark > oldPart.highWatermark) {
          const partKey = `${topicName}-${String(newPart.partition)}`;
          const partPos = partitionPositions.current.get(partKey);
          if (partPos) {
            for (let i = 0; i < 3; i++) {
              particles.current.push({
                id: Math.random().toString(36).substring(7),
                startX: producerPosition.current.x,
                startY: producerPosition.current.y,
                endX: partPos.x,
                endY: partPos.y,
                x: producerPosition.current.x,
                y: producerPosition.current.y,
                progress: 0,
                speed: 0.02 + Math.random() * 0.015,
                color: '#2563eb', // Blue particle
                size: 3 + Math.random() * 2,
              });
            }
          }
        }
      }
    }

    // Consume particles
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
              for (let i = 0; i < 3; i++) {
                particles.current.push({
                  id: Math.random().toString(36).substring(7),
                  startX: partPos.x,
                  startY: partPos.y,
                  endX: memberPos.x,
                  endY: memberPos.y,
                  x: partPos.x,
                  y: partPos.y,
                  progress: 0,
                  speed: 0.025 + Math.random() * 0.01,
                  color: '#4f46e5', // Indigo particle
                  size: 3 + Math.random() * 2,
                });
              }
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
  ) => {
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

  const render = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
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

    if (!state) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for Cluster Simulation Stream...', width / 2, height / 2);
      return;
    }

    const brokersArray = Object.values(state.brokers);
    const numBrokers = brokersArray.length;
    const centerX = width / 2;
    const centerY = height / 2;
    const circleRadius = Math.min(width, height) * 0.28;

    producerPosition.current = { x: 90, y: height / 2 };

    brokerPositions.current.clear();
    brokersArray.forEach((broker, index) => {
      const angle = (2 * Math.PI * index) / numBrokers - Math.PI / 2;
      const x = centerX + circleRadius * Math.cos(angle);
      const y = centerY + circleRadius * Math.sin(angle);
      brokerPositions.current.set(broker.id, { x, y });
    });

    consumerPositions.current.clear();
    const allGroupMembers: { memberId: string; groupId: string; label: string }[] = [];
    Object.keys(state.consumerGroups).forEach((groupId) => {
      const group = state.consumerGroups[groupId];
      if (group) {
        Object.keys(group.members).forEach((memberId) => {
          allGroupMembers.push({
            memberId,
            groupId,
            label: `${groupId} (${memberId.substring(0, 6)})`,
          });
        });
      }
    });

    const numConsumers = allGroupMembers.length;
    allGroupMembers.forEach((member, index) => {
      const x = width - 110;
      const y = numConsumers > 1 ? 100 + (index * (height - 200)) / (numConsumers - 1) : height / 2;
      consumerPositions.current.set(member.memberId, { x, y });
    });

    partitionPositions.current.clear();
    const brokerPartitionCounts = new Map<string, number>();

    for (const topicName in state.topics) {
      const partitions = state.topics[topicName] || [];
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

    // Outer Ring
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Consumer Assignment Lines
    ctx.lineWidth = 1.5;
    Object.keys(state.consumerGroups).forEach((groupId) => {
      const group = state.consumerGroups[groupId];
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

    // Producer Node
    const prodX = producerPosition.current.x;
    const prodY = producerPosition.current.y;
    ctx.fillStyle = '#eff6ff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(prodX, prodY, 34, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1d4ed8';
    ctx.font = '600 10px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRODUCER', prodX, prodY + 3);

    // Consumer Nodes
    allGroupMembers.forEach((member) => {
      const pos = consumerPositions.current.get(member.memberId);
      if (pos) {
        ctx.fillStyle = '#eef2ff';
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 30, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#4338ca';
        ctx.font = '600 10px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CONSUMER', pos.x, pos.y + 2);

        ctx.fillStyle = '#64748b';
        ctx.font = '9px monospace';
        ctx.fillText(member.memberId.substring(0, 6), pos.x, pos.y + 13);
      }
    });

    // Broker Nodes
    brokersArray.forEach((broker) => {
      const pos = brokerPositions.current.get(broker.id);
      if (!pos) return;

      const isCrashed = broker.status === 'CRASHED';
      const isRecovering = broker.status === 'RECOVERING';
      const isController = state.kraft.activeControllerId === broker.id;

      if (isController && !isCrashed) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 48, 0, 2 * Math.PI);
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

    // Topic Partitions (Draw.io style rounded rectangular cards)
    for (const topicName in state.topics) {
      const partitions = state.topics[topicName] || [];
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
        ctx.fillText(`${topicName}-${String(part.partition)}`, pos.x, pos.y - 4);

        ctx.fillStyle = '#2563eb';
        ctx.font = '8px monospace';
        ctx.fillText(
          `HW:${String(part.highWatermark)} LEO:${String(part.highWatermark + 1)}`,
          pos.x,
          pos.y + 9,
        );
      });
    }

    // Data Flow Particles
    ctx.lineWidth = 0;
    particles.current.forEach((particle, index) => {
      particle.progress += particle.speed;
      particle.x = particle.startX + (particle.endX - particle.startX) * particle.progress;
      particle.y = particle.startY + (particle.endY - particle.startY) * particle.progress;

      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, 2 * Math.PI);
      ctx.fill();

      if (particle.progress >= 1) {
        particles.current.splice(index, 1);
      }
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !state) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    for (const brokerId in state.brokers) {
      const pos = brokerPositions.current.get(brokerId);
      if (pos) {
        const dist = Math.hypot(mouseX - pos.x, mouseY - pos.y);
        if (dist < 40) {
          const broker = state.brokers[brokerId];
          if (broker) {
            onHoverDetails(
              `BROKER NODE #${broker.id}
Status: ${broker.status}
Role: ${state.kraft.activeControllerId === broker.id ? 'Active Controller (Leader)' : 'Follower Node'}
Host: ${broker.host}:${String(broker.port)}
Disk: ${String((broker.diskUsageBytes / (1024 * 1024)).toFixed(2))} MB / ${String((broker.maxDiskSizeBytes / (1024 * 1024)).toFixed(2))} MB
Last Heartbeat: Tick ${String(broker.lastHeartbeatTick)}`,
            );
            return;
          }
        }
      }
    }

    for (const topicName in state.topics) {
      const partitions = state.topics[topicName] || [];
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
            onHoverDetails(
              `TOPIC PARTITION [${topicName}-${String(part.partition)}]
Leader Broker: ${part.leaderBrokerId ?? 'No Leader (OFFLINE)'}
Leader Epoch: ${String(part.leaderEpoch)}
ISR Replicas: ${part.isr.join(', ')}
High Watermark: ${String(part.highWatermark)}
Min-ISR requirement: ${String(part.minInsyncReplicas)}
Unclean Leader Election: ${String(part.uncleanLeaderElectionEnabled)}`,
            );
            return;
          }
        }
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
