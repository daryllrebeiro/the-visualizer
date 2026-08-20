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
  progress: number; // 0 to 1
  speed: number;
  color: string;
  size: number;
}

export function Visualizer({ state, onHoverDetails }: VisualizerProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Track positions to spawn particles
  const brokerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const partitionPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const consumerPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const producerPosition = useRef<{ x: number; y: number }>({ x: 50, y: 300 });

  // Floating particles list
  const particles = useRef<Particle[]>([]);
  // Store previous state to detect log offset increases
  const lastStateRef = useRef<KafkaClusterState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize handler
    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = rect?.width ?? 800;
      canvas.height = rect?.height ?? 600;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Main animation loop
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

  // Spawn particles when offsets change
  useEffect(() => {
    if (!state) return;
    const lastState = lastStateRef.current;
    if (!lastState) {
      lastStateRef.current = state;
      return;
    }

    // A. Detect topic LEO increases -> spawn write particles (Producer -> Partition Leader)
    for (const topicName in state.topics) {
      const newPartitions = state.topics[topicName] || [];
      const oldPartitions = lastState.topics[topicName] || [];

      for (const newPart of newPartitions) {
        const oldPart = oldPartitions.find((p) => p.partition === newPart.partition);
        if (oldPart && newPart.highWatermark > oldPart.highWatermark) {
          // Offsets advanced! Spawn write particles
          const partKey = `${topicName}-${String(newPart.partition)}`;
          const partPos = partitionPositions.current.get(partKey);
          if (partPos) {
            // Spawn 3 particles
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
                speed: 0.025 + Math.random() * 0.015,
                color: '#3b82f6', // Neon Blue particle
                size: 3 + Math.random() * 2.5,
              });
            }
          }
        }
      }
    }

    // B. Detect consumer committed offset increases -> spawn read particles (Partition -> Consumer)
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
            // Consumer committed new offset! Spawn read particles
            const partKey = `${topicName}-${partStr}`;
            const partPos = partitionPositions.current.get(partKey);

            // Find which consumer member has this partition assigned
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
                  speed: 0.03 + Math.random() * 0.01,
                  color: '#a855f7', // Neon Purple particle
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

  // Helper to draw rounded rectangles
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
    // 1. Clear background
    ctx.fillStyle = '#090d16'; // Match globals.css
    ctx.fillRect(0, 0, width, height);

    // Draw subtle grid overlay
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    ctx.lineWidth = 1;
    const gridSize = 40;
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
      ctx.font = '13px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for Cluster Simulation Stream...', width / 2, height / 2);
      return;
    }

    const brokersArray = Object.values(state.brokers);
    const numBrokers = brokersArray.length;
    const centerX = width / 2;
    const centerY = height / 2;
    const circleRadius = Math.min(width, height) * 0.26;

    // Save positions
    producerPosition.current = { x: 80, y: height / 2 };

    // Layout Broker positions in a central circle
    brokerPositions.current.clear();
    brokersArray.forEach((broker, index) => {
      const angle = (2 * Math.PI * index) / numBrokers - Math.PI / 2;
      const x = centerX + circleRadius * Math.cos(angle);
      const y = centerY + circleRadius * Math.sin(angle);
      brokerPositions.current.set(broker.id, { x, y });
    });

    // Layout Consumer positions on the right side
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
      const x = width - 120;
      const y = numConsumers > 1 ? 100 + (index * (height - 200)) / (numConsumers - 1) : height / 2;
      consumerPositions.current.set(member.memberId, { x, y });
    });

    // Layout Partition positions orbiting their assigned broker leaders
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
            // Arrange partitions orbiting the broker
            const angleOffset = (currentCount * Math.PI) / 4.5 - Math.PI / 4;
            const distance = 80;
            const x = brokerPos.x + distance * Math.cos(angleOffset);
            const y = brokerPos.y + distance * Math.sin(angleOffset);
            partitionPositions.current.set(`${topicName}-${String(part.partition)}`, { x, y });
          }
        }
      });
    }

    // 2. Draw Links (Broker-to-Broker controller ring and Consumer assignments)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw lines from consumers to their assigned partitions
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
              ctx.strokeStyle = 'rgba(168, 85, 247, 0.15)'; // Translucent Neon Purple
              ctx.beginPath();
              ctx.moveTo(memberPos.x, memberPos.y);
              ctx.lineTo(partPos.x, partPos.y);
              ctx.stroke();
            }
          });
        }
      });
    });

    // 3. Draw Nodes (Producers, Consumers)
    // A. Producer Node (Left side)
    const prodX = producerPosition.current.x;
    const prodY = producerPosition.current.y;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(prodX, prodY, 32, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 9px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRODUCER', prodX, prodY + 3);

    // B. Consumer Nodes (Right side)
    allGroupMembers.forEach((member) => {
      const pos = consumerPositions.current.get(member.memberId);
      if (pos) {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.06)';
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 28, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#d8b4fe';
        ctx.font = 'bold 9px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CONSUMER', pos.x, pos.y + 3);

        ctx.fillStyle = '#64748b';
        ctx.font = '8px monospace';
        ctx.fillText(member.memberId.substring(0, 6), pos.x, pos.y + 14);
      }
    });

    // 4. Draw Broker Nodes (Central Ring Layout - Draw.io style colors)
    brokersArray.forEach((broker) => {
      const pos = brokerPositions.current.get(broker.id);
      if (!pos) return;

      const isCrashed = broker.status === 'CRASHED';
      const isRecovering = broker.status === 'RECOVERING';
      const isController = state.kraft.activeControllerId === broker.id;

      // Draw active controller glowing boundary ring
      if (isController && !isCrashed) {
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.25)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 48, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Draw.io soft pastel palette for broker statuses
      if (isCrashed) {
        ctx.fillStyle = '#fce8e6'; // Soft Red
        ctx.strokeStyle = '#ea4335'; // Darker Red border
      } else if (isRecovering) {
        ctx.fillStyle = '#fef7e0'; // Soft Orange/Yellow
        ctx.strokeStyle = '#fbbc04'; // Darker Yellow border
      } else {
        ctx.fillStyle = '#e6f4ea'; // Soft Green
        ctx.strokeStyle = '#34a853'; // Darker Green border
      }

      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 38, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Broker role text
      ctx.fillStyle = isCrashed ? '#c5221f' : '#202124';
      ctx.font = 'bold 11px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Broker ${broker.id}`, pos.x, pos.y - 4);

      ctx.fillStyle = isCrashed ? '#ea4335' : '#5f6368';
      ctx.font = '9px monospace';
      ctx.fillText(broker.status, pos.x, pos.y + 8);

      if (isController && !isCrashed) {
        ctx.fillStyle = '#b06000';
        ctx.font = 'bold 7.5px "Outfit", sans-serif';
        ctx.fillText('LEADER', pos.x, pos.y + 19);
      }

      // Disk usage health bar
      if (!isCrashed) {
        const diskPct = broker.diskUsageBytes / broker.maxDiskSizeBytes;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(pos.x - 22, pos.y - 25, 44, 4);

        ctx.fillStyle = diskPct > 0.85 ? '#ea4335' : '#34a853';
        ctx.fillRect(pos.x - 22, pos.y - 25, 44 * Math.min(diskPct, 1), 4);
      }
    });

    // 5. Draw Topic Partitions (Orbiting Broker nodes)
    for (const topicName in state.topics) {
      const partitions = state.topics[topicName] || [];
      partitions.forEach((part) => {
        const partKey = `${topicName}-${String(part.partition)}`;
        const pos = partitionPositions.current.get(partKey);
        if (!pos) return;

        // Draw partition box - clean modular card
        ctx.fillStyle = '#161e2e'; // Dark panel match
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        drawRoundRect(ctx, pos.x - 30, pos.y - 18, 60, 36, 6);

        // Partition Title
        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 8.5px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${topicName}-${String(part.partition)}`, pos.x, pos.y - 4);

        // LEO & HW offset numbers
        ctx.fillStyle = '#60a5fa'; // Pastel blue metrics
        ctx.font = '7.5px monospace';
        ctx.fillText(
          `HW:${String(part.highWatermark)} LEO:${String(part.highWatermark + 1)}`,
          pos.x,
          pos.y + 9,
        );
      });
    }

    // 6. Draw and Update Data Flow Particles
    ctx.lineWidth = 0;
    particles.current.forEach((particle, index) => {
      // Linear interpolation progress update
      particle.progress += particle.speed;
      particle.x = particle.startX + (particle.endX - particle.startX) * particle.progress;
      particle.y = particle.startY + (particle.endY - particle.startY) * particle.progress;

      // Draw particle glowing arc
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, 2 * Math.PI);
      ctx.fill();

      // Clean up finished particles
      if (particle.progress >= 1) {
        particles.current.splice(index, 1);
      }
    });
  };

  // Canvas Mouse interaction to show detailed status configs
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !state) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // A. Check hover on Broker Nodes
    for (const brokerId in state.brokers) {
      const pos = brokerPositions.current.get(brokerId);
      if (pos) {
        const dist = Math.hypot(mouseX - pos.x, mouseY - pos.y);
        if (dist < 38) {
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

    // B. Check hover on Partition boxes
    for (const topicName in state.topics) {
      const partitions = state.topics[topicName] || [];
      for (const part of partitions) {
        const partKey = `${topicName}-${String(part.partition)}`;
        const pos = partitionPositions.current.get(partKey);
        if (pos) {
          if (
            mouseX >= pos.x - 30 &&
            mouseX <= pos.x + 30 &&
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
      className="w-full h-full block rounded-2xl cursor-crosshair"
    />
  );
}
