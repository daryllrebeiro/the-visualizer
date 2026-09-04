#!/usr/bin/env node

/**
 * Domain Visualizer Scaffolding Generator
 *
 * Usage: node scripts/create-domain.mjs <domain-id> <domain-name>
 * Example: node scripts/create-domain.mjs cassandra "Apache Cassandra"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const domainId = process.argv[2]?.toLowerCase();
const domainName = process.argv[3] || domainId?.toUpperCase();

if (!domainId) {
  console.error('❌ Usage: node scripts/create-domain.mjs <domain-id> [Domain Name]');
  console.error('Example: node scripts/create-domain.mjs cassandra "Apache Cassandra"');
  process.exit(1);
}

const PascalName = domainId
  .split('-')
  .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
  .join('');
const simDomainDir = path.join(rootDir, 'packages', 'simulation', 'src', 'domains', domainId);
const webComponentDir = path.join(rootDir, 'apps', 'web', 'src', 'components', domainId);

console.log(`🚀 Scaffolding new domain visualizer: "${domainName}" (${domainId})...`);

// 1. Create Simulation Domain Directory
if (!fs.existsSync(simDomainDir)) {
  fs.mkdirSync(simDomainDir, { recursive: true });
}

// 2. Write types file
const typesContent = `/**
 * ${domainName} Simulation Types & State Model
 */

export interface ${PascalName}Node {
  id: string;
  name: string;
  status: 'ALIVE' | 'CRASHED';
}

export interface ${PascalName}ClusterState {
  clusterId: string;
  tick: number;
  nodes: Record<string, ${PascalName}Node>;
}

export type ${PascalName}SimEvent =
  | { id: string; tick: number; type: '${domainId.toUpperCase()}_TICK'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: '${domainId.toUpperCase()}_CRASH_NODE'; payload: { nodeId: string } };
`;

fs.writeFileSync(path.join(simDomainDir, `${domainId}-types.ts`), typesContent);

// 3. Write state transitions reducer
const transitionsContent = `import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type { ${PascalName}ClusterState, ${PascalName}SimEvent } from './${domainId}-types.js';

export function createDefault${PascalName}Cluster(clusterId = '${domainId}-1'): ${PascalName}ClusterState {
  return {
    clusterId,
    tick: 0,
    nodes: {
      '1': { id: '1', name: '${domainId}-node-1', status: 'ALIVE' },
      '2': { id: '2', name: '${domainId}-node-2', status: 'ALIVE' },
      '3': { id: '3', name: '${domainId}-node-3', status: 'ALIVE' },
    },
  };
}

export function pure${PascalName}Transition(
  state: ${PascalName}ClusterState,
  event: ${PascalName}SimEvent,
  _rng: DeterministicRNG,
): { nextState: ${PascalName}ClusterState; emittedEvents: ${PascalName}SimEvent[] } {
  const nextState: ${PascalName}ClusterState = JSON.parse(JSON.stringify(state)) as ${PascalName}ClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case '${domainId.toUpperCase()}_CRASH_NODE': {
      const node = nextState.nodes[event.payload.nodeId];
      if (node) node.status = 'CRASHED';
      break;
    }
  }

  return { nextState, emittedEvents: [] };
}
`;

fs.writeFileSync(path.join(simDomainDir, `${domainId}-state-transitions.ts`), transitionsContent);

// 4. Write invariant checker
const invariantsContent = `import type { ${PascalName}ClusterState } from './${domainId}-types.js';

export class ${PascalName}InvariantChecker {
  public check(state: ${PascalName}ClusterState): { invariantName: string; description: string } | undefined {
    const aliveCount = Object.values(state.nodes).filter((n) => n.status === 'ALIVE').length;
    if (aliveCount === 0) {
      return {
        invariantName: 'CLUSTER_QUORUM_HEALTH',
        description: 'All nodes in ${domainName} cluster are crashed.',
      };
    }
    return undefined;
  }
}
`;

fs.writeFileSync(path.join(simDomainDir, `${domainId}-invariants.ts`), invariantsContent);

// 5. Write visualizer component template in apps/web
if (!fs.existsSync(webComponentDir)) {
  fs.mkdirSync(webComponentDir, { recursive: true });
}

const componentContent = `'use client';

import React from 'react';
import type { ${PascalName}ClusterState } from '@the-visualizer/simulation';

export interface ${PascalName}VisualizerProps {
  state: ${PascalName}ClusterState;
  onCrashNode?: (nodeId: string) => void;
}

export function ${PascalName}Visualizer({ state, onCrashNode }: ${PascalName}VisualizerProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px' }}>
      <div style={{ backgroundColor: '#0f172a', padding: '12px 16px', borderRadius: '8px', border: '1px solid #1e293b' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc' }}>
          ${domainName} Visualizer
        </h2>
        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
          Cluster ID: <code>{state.clusterId}</code> · Tick: <strong>{state.tick}</strong>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {Object.values(state.nodes).map((node) => (
          <div
            key={node.id}
            style={{
              backgroundColor: '#020617',
              border: node.status === 'ALIVE' ? '1px solid #334155' : '1px solid #ef4444',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontWeight: 700, color: '#f8fafc' }}>{node.name}</div>
            <div style={{ fontSize: '0.8rem', color: node.status === 'ALIVE' ? '#10b981' : '#ef4444' }}>
              Status: {node.status}
            </div>
            {node.status === 'ALIVE' && (
              <button
                onClick={() => onCrashNode?.(node.id)}
                style={{ padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                💥 Crash Node
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
`;

fs.writeFileSync(path.join(webComponentDir, `${PascalName}Visualizer.tsx`), componentContent);

// 6. Update packages/simulation/src/index.ts with domain re-exports
const simIndexPath = path.join(rootDir, 'packages', 'simulation', 'src', 'index.ts');
if (fs.existsSync(simIndexPath)) {
  let simIndexContent = fs.readFileSync(simIndexPath, 'utf8');
  const exportBlock = `
// Domain: ${domainName}
export * from './domains/${domainId}/${domainId}-types.js';
export * from './domains/${domainId}/${domainId}-state-transitions.js';
export * from './domains/${domainId}/${domainId}-invariants.js';
`;
  if (!simIndexContent.includes(`./domains/${domainId}/`)) {
    simIndexContent += exportBlock;
    fs.writeFileSync(simIndexPath, simIndexContent);
    console.log(`- Updated packages/simulation/src/index.ts with exports`);
  }
}

console.log(`✅ Successfully scaffolded ${domainName} (${domainId})!`);
console.log(`- Simulation files: packages/simulation/src/domains/${domainId}/`);
console.log(`- UI Visualizer: apps/web/src/components/${domainId}/${PascalName}Visualizer.tsx`);
