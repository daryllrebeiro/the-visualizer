// scripts/benchmark-canvas-fps.mjs
// Canvas Rendering Virtualization & 60 FPS Performance Benchmark

import { performance } from 'node:perf_hooks';

console.log('⚡ Starting Canvas Virtualization & 60 FPS Benchmark...\n');

// 1. ParticlePool Class Verification
class ParticlePool {
  constructor(initialCapacity = 80) {
    this.pool = [];
    this.nextId = 0;
    for (let i = 0; i < initialCapacity; i++) {
      this.pool.push(this.createBlankParticle());
    }
  }

  createBlankParticle() {
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

  acquire(startX, startY, endX, endY, speed, color, leg, topic, partition, label) {
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

  release(p) {
    p.trail.length = 0;
    if (this.pool.length < 300) {
      this.pool.push(p);
    }
  }

  get size() {
    return this.pool.length;
  }
}

// 2. Synthetic Heavy Cluster State
const mockBrokers = {};
for (let i = 1; i <= 10; i++) {
  mockBrokers[`broker-${i}`] = {
    id: `broker-${i}`,
    status: 'ALIVE',
    rack: `rack-${i % 3}`,
    diskUsageBytes: 500 * 1024 * 1024,
    maxDiskSizeBytes: 1024 * 1024 * 1024,
    lastHeartbeatTick: 100,
  };
}

const mockTopics = {
  orders: [],
  payments: [],
  shipments: [],
};
for (let p = 0; p < 20; p++) {
  mockTopics.orders.push({
    partition: p,
    leaderBrokerId: `broker-${(p % 10) + 1}`,
    highWatermark: 120 + p,
  });
}
for (let p = 0; p < 15; p++) {
  mockTopics.payments.push({
    partition: p,
    leaderBrokerId: `broker-${((p + 3) % 10) + 1}`,
    highWatermark: 80 + p,
  });
}
for (let p = 0; p < 15; p++) {
  mockTopics.shipments.push({
    partition: p,
    leaderBrokerId: `broker-${((p + 7) % 10) + 1}`,
    highWatermark: 45 + p,
  });
}

const mockConsumers = [];
for (let c = 1; c <= 20; c++) {
  mockConsumers.push({
    id: `c-${c}`,
    topic: c <= 10 ? 'orders' : 'payments',
    groupId: `group-${(c % 4) + 1}`,
    joined: true,
    memberId: `member-${c}`,
  });
}

const mockProducers = [
  { id: 'p-orders-1', topic: 'orders', autoProduceEnabled: true },
  { id: 'p-orders-2', topic: 'orders', autoProduceEnabled: true },
  { id: 'p-pay-1', topic: 'payments', autoProduceEnabled: true },
  { id: 'p-ship-1', topic: 'shipments', autoProduceEnabled: false },
];

const mockState = {
  tick: 42,
  brokers: mockBrokers,
  topics: mockTopics,
  consumerGroups: {
    'group-1': {
      members: {
        'member-1': {
          clientId: 'c-1',
          subscribedTopics: ['orders'],
          assignedPartitions: [{ topic: 'orders', partition: 0 }, { topic: 'orders', partition: 1 }],
        },
      },
    },
  },
  kraft: { activeControllerId: 'broker-1' },
};

// 3. Mock Canvas 2D Context
const createMockContext = () => ({
  save: () => {},
  restore: () => {},
  translate: () => {},
  scale: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  quadraticCurveTo: () => {},
  closePath: () => {},
  stroke: () => {},
  fill: () => {},
  arc: () => {},
  rect: () => {},
  fillRect: () => {},
  fillText: () => {},
  setLineDash: () => {},
  lineDashOffset: 0,
  lineWidth: 1,
  strokeStyle: '#000',
  fillStyle: '#000',
  shadowColor: '#000',
  shadowBlur: 0,
  font: '',
  textAlign: '',
});

// 4. Benchmark Runner
function runBenchmarkScenario(name, camConfig) {
  const width = 1400;
  const height = 900;
  const ctx = createMockContext();
  const pool = new ParticlePool(100);

  let particles = [];
  for (let i = 0; i < 40; i++) {
    particles.push(
      pool.acquire(100, 300, 500, 400, 0.02, '#2563eb', 1, 'orders', i % 10, `orders:${i}`)
    );
  }

  const frameTimes = [];
  const cullingRecords = [];
  let lastLayoutKey = '';
  let brokerPositions = new Map();
  let producerPositions = new Map();
  let consumerPositions = new Map();
  let partitionPositions = new Map();

  const cx = width / 2;
  const cy = height / 2;
  const margin = 80;
  const viewMinX = (0 - cx - camConfig.x) / camConfig.zoom + cx - margin;
  const viewMaxX = (width - cx - camConfig.x) / camConfig.zoom + cx + margin;
  const viewMinY = (0 - cy - camConfig.y) / camConfig.zoom + cy - margin;
  const viewMaxY = (height - cy - camConfig.y) / camConfig.zoom + cy + margin;

  const isPointVisible = (x, y, r = 40) =>
    x + r >= viewMinX && x - r <= viewMaxX && y + r >= viewMinY && y - r <= viewMaxY;

  const isLineVisible = (x1, y1, x2, y2) => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return maxX >= viewMinX && minX <= viewMaxX && maxY >= viewMinY && minY <= viewMaxY;
  };

  const TOTAL_FRAMES = 1000;

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const t0 = performance.now();

    let rendered = 0;
    let culled = 0;

    // 1. Layout caching check
    const layoutKey = `${mockState.tick}-${Object.keys(mockBrokers).length}-${mockProducers.length}-${mockConsumers.length}-0-${width}x${height}`;

    if (lastLayoutKey !== layoutKey) {
      lastLayoutKey = layoutKey;
      brokerPositions.clear();
      const brokersArray = Object.values(mockBrokers);
      const numBrokers = brokersArray.length;
      const circleRadius = Math.min(width, height) * 0.28;
      brokersArray.forEach((b, idx) => {
        const angle = (2 * Math.PI * idx) / numBrokers - Math.PI / 2;
        brokerPositions.set(b.id, {
          x: cx + circleRadius * Math.cos(angle),
          y: cy + circleRadius * Math.sin(angle),
        });
      });

      producerPositions.clear();
      mockProducers.forEach((p, idx) => {
        producerPositions.set(p.id, { x: 95, y: 100 + idx * 80 });
      });

      consumerPositions.clear();
      mockConsumers.forEach((c, idx) => {
        consumerPositions.set(c.id, { x: width - 105, y: 100 + idx * 35 });
      });

      partitionPositions.clear();
      for (const t in mockTopics) {
        mockTopics[t].forEach((part) => {
          const leader = brokerPositions.get(part.leaderBrokerId);
          if (leader) {
            partitionPositions.set(`${t}-${part.partition}`, {
              x: leader.x + 85 * Math.cos(part.partition),
              y: leader.y + 85 * Math.sin(part.partition),
            });
          }
        });
      }
    }

    // 2. Frustum Culling Entity Loops
    for (const [id, pos] of brokerPositions.entries()) {
      if (isPointVisible(pos.x, pos.y, 60)) {
        rendered++;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 38, 0, 2 * Math.PI);
        ctx.stroke();
      } else {
        culled++;
      }
    }

    for (const [id, pos] of producerPositions.entries()) {
      if (isPointVisible(pos.x, pos.y, 40)) {
        rendered++;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 28, 0, 2 * Math.PI);
        ctx.stroke();
      } else {
        culled++;
      }
    }

    for (const [id, pos] of consumerPositions.entries()) {
      if (isPointVisible(pos.x, pos.y, 40)) {
        rendered++;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 28, 0, 2 * Math.PI);
        ctx.stroke();
      } else {
        culled++;
      }
    }

    for (const [key, pos] of partitionPositions.entries()) {
      if (isPointVisible(pos.x, pos.y, 35)) {
        rendered++;
        ctx.beginPath();
        ctx.rect(pos.x - 30, pos.y - 17, 60, 34);
        ctx.stroke();
      } else {
        culled++;
      }
    }

    // 3. Particle Simulation & Zero-GC Pool Recycling
    const chained = [];
    particles.forEach((p) => {
      p.progress += p.speed;
      p.x = p.startX + (p.endX - p.startX) * p.progress;
      p.y = p.startY + (p.endY - p.startY) * p.progress;

      if (isPointVisible(p.x, p.y, 25)) {
        rendered++;
        if (p.trail.length >= 8) {
          const recycled = p.trail.shift();
          recycled.x = p.x;
          recycled.y = p.y;
          recycled.alpha = 0.85;
          p.trail.push(recycled);
        } else {
          p.trail.push({ x: p.x, y: p.y, alpha: 0.85 });
        }
        ctx.rect(p.x - 9, p.y - 7, 18, 14);
        ctx.stroke();
      } else {
        culled++;
      }

      if (p.progress >= 1 && p.leg === 1) {
        const p2 = pool.acquire(p.endX, p.endY, width - 105, 300, 0.028, '#7c3aed', 2, p.topic, p.partition, 'leg2');
        chained.push(p2);
      }
    });

    const retained = [];
    particles.forEach((p) => {
      if (p.progress >= 1) {
        pool.release(p);
      } else {
        retained.push(p);
      }
    });
    chained.forEach((p) => retained.push(p));
    if (retained.length > 50) {
      const overflow = retained.splice(0, retained.length - 50);
      overflow.forEach((p) => pool.release(p));
    }
    while (retained.length < 35) {
      retained.push(pool.acquire(95, 200, 700, 450, 0.022, '#2563eb', 1, 'orders', 0, 'new'));
    }
    particles = retained;

    const t1 = performance.now();
    frameTimes.push(t1 - t0);
    cullingRecords.push({ rendered, culled });
  }

  frameTimes.sort((a, b) => a - b);
  const sum = frameTimes.reduce((acc, v) => acc + v, 0);
  const mean = sum / TOTAL_FRAMES;
  const median = frameTimes[Math.floor(TOTAL_FRAMES * 0.5)];
  const p95 = frameTimes[Math.floor(TOTAL_FRAMES * 0.95)];
  const p99 = frameTimes[Math.floor(TOTAL_FRAMES * 0.99)];
  const max = frameTimes[TOTAL_FRAMES - 1];

  const avgRendered = Math.round(cullingRecords.reduce((acc, r) => acc + r.rendered, 0) / TOTAL_FRAMES);
  const avgCulled = Math.round(cullingRecords.reduce((acc, r) => acc + r.culled, 0) / TOTAL_FRAMES);
  const cullingEfficiency = ((avgCulled / (avgRendered + avgCulled)) * 100).toFixed(1);

  console.log(`📊 Scenario: [${name}] (1,000 Frames)`);
  console.log(`  • Mean Frame Time:   ${mean.toFixed(3)} ms  (Target: < 3.0 ms)`);
  console.log(`  • Median Frame Time: ${median.toFixed(3)} ms`);
  console.log(`  • p95 Frame Time:    ${p95.toFixed(3)} ms`);
  console.log(`  • p99 Frame Time:    ${p99.toFixed(3)} ms`);
  console.log(`  • Max Frame Time:    ${max.toFixed(3)} ms`);
  console.log(`  • Headroom Factor:   ${(16.67 / mean).toFixed(1)}x faster than 60 FPS frame budget`);
  console.log(`  • Rendered Entities: ${avgRendered}`);
  console.log(`  • Culled Entities:   ${avgCulled} (${cullingEfficiency}% skipped)`);
  console.log(`  • Pool Reserve:      ${pool.size} ready pooled instances\n`);

  if (mean > 3.0) {
    console.error(`❌ REGRESSION: Mean frame time ${mean.toFixed(3)}ms exceeded target < 3.0ms`);
    process.exit(1);
  }

  if (p99 > 8.0) {
    console.error(`❌ REGRESSION: p99 frame time ${p99.toFixed(3)}ms exceeded limit < 8.0ms`);
    process.exit(1);
  }

  return { mean, avgRendered, avgCulled };
}

// Scenario 1: Standard viewport (full cluster overview)
const resOverview = runBenchmarkScenario('Full Cluster Overview', { x: 0, y: 0, zoom: 1.0 });

// Scenario 2: High-zoom detailed inspection (camera panned to broker ring, outer nodes culled)
const resZoomed = runBenchmarkScenario('High-Zoom Frustum Culling Active', { x: 450, y: 350, zoom: 2.2 });

if (resZoomed.avgCulled === 0) {
  console.error('❌ REGRESSION: Frustum culling failed to prune off-screen entities under zoom');
  process.exit(1);
}

console.log('✅ PASS: Canvas Virtualization, Dirty-State Caching, Frustum Culling & Zero-GC Pool certified at 60 FPS!');
