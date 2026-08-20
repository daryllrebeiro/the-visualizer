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
                speed: 0.02 + Math.random() * 0.015,
                color: '#3b82f6', // Neon Blue
                size: 3 + Math.random() * 2,
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
                  speed: 0.025 + Math.random() * 0.01,
                  color: '#a855f7', // Neon Purple
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

  const render = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // 1. Clear background
    ctx.fillStyle = '#0b0f19'; // Deep rich dark space background
    ctx.fillRect(0, 0, width, height);

    // Draw subtle tech grids
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
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
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for Cluster Simulation Stream...', width / 2, height / 2);
      return;
    }

    const brokersArray = Object.values(state.brokers);
    const numBrokers = brokersArray.length;
    const centerX = width / 2;
    const centerY = height / 2;
    const circleRadius = Math.min(width, height) * 0.25;

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
            // Arrange partitions in an offset pattern around the broker
            const angleOffset = (currentCount * Math.PI) / 4 - Math.PI / 4;
            const distance = 70;
            const x = brokerPos.x + distance * Math.cos(angleOffset);
            const y = brokerPos.y + distance * Math.sin(angleOffset);
            partitionPositions.current.set(`${topicName}-${String(part.partition)}`, { x, y });
          }
        }
      });
    }

    // 2. Draw Links (Broker-to-Broker KRaft Quorum, and Consumer-to-Partition links)
    // Draw controller replication ring
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
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
              // Draw glowing connection line
              ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)'; // Translucent Neon Purple
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
    // A. Producer Node (Left)
    const prodX = producerPosition.current.x;
    const prodY = producerPosition.current.y;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(prodX, prodY, 30, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#3b82f6';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PRODUCER', prodX, prodY + 4);

    // B. Consumer Nodes (Right)
    allGroupMembers.forEach((member) => {
      const pos = consumerPositions.current.get(member.memberId);
      if (pos) {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.1)';
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 25, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e9d5ff';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CG-MEMBER', pos.x, pos.y - 32);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(member.label, pos.x, pos.y + 4);
      }
    });

    // 4. Draw Broker Nodes (Center circle layout)
    brokersArray.forEach((broker) => {
      const pos = brokerPositions.current.get(broker.id);
      if (!pos) return;

      const isCrashed = broker.status === 'CRASHED';
      const isRecovering = broker.status === 'RECOVERING';
      const isController = state.kraft.activeControllerId === broker.id;

      // Draw Controller outer neon glow ring
      if (isController && !isCrashed) {
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)'; // Gold Controller glow
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 45, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Base Broker Circle fill
      ctx.fillStyle = isCrashed
        ? 'rgba(239, 68, 68, 0.08)' // Red translucent
        : isRecovering
          ? 'rgba(249, 115, 22, 0.08)' // Orange translucent
          : 'rgba(16, 185, 129, 0.08)'; // Green translucent

      ctx.strokeStyle = isCrashed ? '#ef4444' : isRecovering ? '#f97316' : '#10b981';

      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 35, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Draw active role/controller tag
      ctx.fillStyle = isCrashed ? '#fca5a5' : '#f8fafc';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`ID: ${broker.id}`, pos.x, pos.y - 5);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText(broker.status, pos.x, pos.y + 8);

      if (isController && !isCrashed) {
        ctx.fillStyle = '#eab308';
        ctx.fillText('KRAFT-LEADER', pos.x, pos.y + 20);
      }

      // Draw disk usage small health bar
      if (!isCrashed) {
        const diskPct = broker.diskUsageBytes / broker.maxDiskSizeBytes;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(pos.x - 20, pos.y - 25, 40, 4);

        ctx.fillStyle = diskPct > 0.85 ? '#ef4444' : '#10b981';
        ctx.fillRect(pos.x - 20, pos.y - 25, 40 * Math.min(diskPct, 1), 4);
      }
    });

    // 5. Draw Topic Partitions (Around leaders)
    for (const topicName in state.topics) {
      const partitions = state.topics[topicName] || [];
      partitions.forEach((part) => {
        const partKey = `${topicName}-${String(part.partition)}`;
        const pos = partitionPositions.current.get(partKey);
        if (!pos) return;

        // Draw partition box
        ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.fillRect(pos.x - 30, pos.y - 18, 60, 36);
        ctx.strokeRect(pos.x - 30, pos.y - 18, 60, 36);

        // Partition Text
        ctx.fillStyle = '#f8fafc';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${topicName.substring(0, 5)}-${String(part.partition)}`, pos.x, pos.y - 5);

        // LEO and HW offsets metrics
        ctx.fillStyle = '#38bdf8'; // Blue for offsets
        ctx.font = '8px monospace';
        ctx.fillText(
          `HW:${String(part.highWatermark)} LEO:${String(part.highWatermark + 1)}`,
          pos.x,
          pos.y + 10,
        );
      });
    }

    // 6. Draw and Update Data Flow Particles
    ctx.lineWidth = 0;
    particles.current.forEach((particle, index) => {
      // Linear interpolation
      particle.progress += particle.speed;
      particle.x = particle.startX + (particle.endX - particle.startX) * particle.progress;
      particle.y = particle.startY + (particle.endY - particle.startY) * particle.progress;

      // Draw particle glow
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
        if (dist < 35) {
          const broker = state.brokers[brokerId];
          if (broker) {
            onHoverDetails(
              `BROKER NODE #${broker.id}
Status: ${broker.status}
Role: ${state.kraft.activeControllerId === broker.id ? 'Active Controller (Voter)' : 'Follower Node'}
Host: ${broker.host}:${String(broker.port)}
Disk: ${String((broker.diskUsageBytes / (1024 * 1024)).toFixed(2))} MB / ${String((broker.maxDiskSizeBytes / (1024 * 1024)).toFixed(2))} MB
Last Heartbeat Tick: ${String(broker.lastHeartbeatTick)}`,
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
      className="w-full h-full block rounded-xl cursor-crosshair"
    />
  );
}
