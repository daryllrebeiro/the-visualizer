'use client';

import React, { useMemo } from 'react';

import type { ConsistentHashingClusterState, ConsistentHashingSimEvent } from '@the-visualizer/simulation';
import { Badge, ControlButton, DataTable, Panel, StatRow } from '../new-domains/shared';

export interface ConsistentHashingVisualizerProps {
  state: ConsistentHashingClusterState;
  dispatch: (event: ConsistentHashingSimEvent) => void;
}

const NODE_COLORS = ['#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#06b6d4', '#a3e635'];

export function ConsistentHashingVisualizer({ state, dispatch }: ConsistentHashingVisualizerProps): React.JSX.Element {
  const ev = (type: ConsistentHashingSimEvent['type'], payload: Record<string, unknown>): void => {
    dispatch({ id: `ch-${Math.random().toString(36).slice(2, 8)}`, tick: state.tick + 1, type, payload } as ConsistentHashingSimEvent);
  };

  const colorFor = (nodeId: string): string =>
    NODE_COLORS[state.ringNodes.findIndex((n) => n.id === nodeId) % NODE_COLORS.length] ?? '#64748b';

  // Ring geometry: vnodes as colored ticks; sampled for display density.
  const ringSize = 300;
  const center = ringSize / 2;
  const radius = 120;
  const sampledVnodes = useMemo(
    () => state.ring.filter((_, i) => i % Math.max(1, Math.ceil(state.ring.length / 120)) === 0),
    [state.ring],
  );

  const loadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of state.ringNodes) counts[node.id] = 0;
    for (const key of state.keyOrder) {
      const target = state.keyAssignments[key]?.ring;
      if (target) counts[target] = (counts[target] ?? 0) + 1;
    }
    return counts;
  }, [state.keyOrder, state.keyAssignments, state.ringNodes]);

  const totalKeys = state.keyOrder.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Panel
        title="Consistent Hashing — Ring vs Jump vs Rendezvous vs Naive"
        subtitle={`${state.ringNodes.length} nodes · ${state.vnodesPerNode} vnodes/node · ${totalKeys} keys · tick ${state.tick}`}
        accent="#f59e0b"
        right={
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <ControlButton label="+ Node" tone="success" onClick={() => ev('CHASH_ADD_NODE', { nodeId: `node-${String.fromCharCode(65 + state.ringNodes.length)}` })} />
            <ControlButton
              label="− Node"
              tone="danger"
              disabled={state.ringNodes.length <= 1}
              onClick={() => ev('CHASH_REMOVE_NODE', { nodeId: state.ringNodes.at(-1)!.id })}
            />
            <ControlButton label="+ 200 keys" onClick={() => ev('CHASH_ADD_KEY_BATCH', { keys: Array.from({ length: 200 }, (_, i) => `key-${totalKeys + i}`) })} />
          </div>
        }
      >
        <StatRow
          items={[
            { label: 'Keys', value: String(totalKeys) },
            { label: 'Ring positions', value: String(state.ring.length) },
            {
              label: 'Last movement',
              value: state.lastMovement
                ? `ring ${state.lastMovement.ring} · jump ${state.lastMovement.jump} · hrw ${state.lastMovement.hrw} · naive ${state.lastMovement.naive}`
                : '—',
              color: state.lastMovement ? '#f59e0b' : undefined,
            },
          ]}
        />
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px' }}>
        <Panel title="The ring (vnodes as colored ticks)" accent="#38bdf8">
          <svg width={ringSize} height={ringSize} role="img" aria-label="consistent hash ring">
            <circle cx={center} cy={center} r={radius} fill="none" stroke="#1e293b" strokeWidth={2} />
            {sampledVnodes.map((vnode) => {
              const angle = (vnode.position / 0x100000000) * 2 * Math.PI - Math.PI / 2;
              const x = center + radius * Math.cos(angle);
              const y = center + radius * Math.sin(angle);
              return (
                <circle
                  key={`${vnode.nodeId}-${vnode.position}`}
                  cx={x}
                  cy={y}
                  r={3}
                  fill={colorFor(vnode.nodeId)}
                />
              );
            })}
            {state.lastLookup && (
              <g>
                <circle cx={center} cy={center} r={4} fill="#f8fafc" />
                <text x={center} y={center + 20} textAnchor="middle" fill="#94a3b8" fontSize="9">
                  last: {state.lastLookup.key}
                </text>
                <text x={center} y={center + 32} textAnchor="middle" fill={colorFor(state.lastLookup.ring)} fontSize="9">
                  → {state.lastLookup.ring}
                </text>
              </g>
            )}
          </svg>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            {state.ringNodes.map((node) => (
              <Badge key={node.id} text={`${node.id} (${loadCounts[node.id] ?? 0})`} color={colorFor(node.id)} />
            ))}
          </div>
        </Panel>

        <Panel title="Rebalance history — movement counts per algorithm on the SAME event" accent="#ef4444">
          <DataTable
            headers={['event', 'node', 'ring (K/N)', 'jump', 'hrw', 'naive (hash % N)']}
            rows={[...state.rebalanceEvents]
              .reverse()
              .slice(0, 12)
              .map((m) => [
                m.event,
                m.changedNodeId,
                <strong key="r" style={{ color: '#10b981' }}>{m.ring}</strong>,
                <strong key="j" style={{ color: '#38bdf8' }}>{m.jump}</strong>,
                <strong key="h" style={{ color: '#8b5cf6' }}>{m.hrw}</strong>,
                <strong key="n" style={{ color: '#ef4444' }}>{m.naive}</strong>,
              ])}
            maxHeight="240px"
          />
          <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#64748b' }}>
            Consistent schemes move ≈ K/N keys; the naive baseline reshuffles nearly everything — the entire point of consistent hashing.
          </div>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Panel title="Load distribution per algorithm" accent="#10b981">
          {(['ring', 'jump', 'hrw', 'naive'] as const).map((scheme) => {
            const counts: Record<string, number> = {};
            for (const node of state.ringNodes) counts[node.id] = 0;
            for (const key of state.keyOrder) {
              const target = state.keyAssignments[key]?.[scheme];
              if (target !== undefined && target in counts) {
                counts[target] = (counts[target] ?? 0) + 1;
              }
            }
            const max = Math.max(1, ...Object.values(counts));
            return (
              <div key={scheme} style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '3px' }}>
                  {scheme === 'naive' ? 'naive hash % N' : scheme}
                </div>
                {state.ringNodes.map((node) => (
                  <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', minWidth: '60px' }}>{node.id}</span>
                    <div style={{ flex: 1, height: '8px', backgroundColor: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${((counts[node.id] ?? 0) / max) * 100}%`,
                          height: '100%',
                          backgroundColor: scheme === 'naive' ? '#ef4444' : colorFor(node.id),
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8', minWidth: '28px' }}>{counts[node.id] ?? 0}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </Panel>

        <Panel title="Controls — vnodes, jump buckets, lookups" accent="#8b5cf6">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>vnodes/node:</span>
              {[1, 16, 64, 100, 200].map((v) => (
                <ControlButton
                  key={v}
                  label={String(v)}
                  tone={state.vnodesPerNode === v ? 'success' : 'default'}
                  onClick={() => ev('CHASH_SET_VNODES', { vnodesPerNode: v })}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>jump buckets (independent remap):</span>
              {[state.ringNodes.length - 1, state.ringNodes.length, state.ringNodes.length + 1]
                .filter((b) => b >= 1 && b <= 32)
                .map((b) => (
                  <ControlButton key={b} label={String(b)} onClick={() => ev('CHASH_SET_JUMP_BUCKETS', { buckets: b })} />
                ))}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
              Lookup instrumentation (last): ring {state.lookupStats.ringComparisons} comparisons (O(log vN)) · hrw{' '}
              {state.lookupStats.hrwHashComputations} hashes (O(N)) · jump {state.lookupStats.jumpLoopIterations} loop steps.
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <ControlButton
                label="Lookup probe"
                onClick={() => ev('CHASH_LOOKUP', { key: `probe-${Math.floor(Math.random() * 100000)}` })}
              />
            </div>
            {state.lastLookup && (
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                key <code style={{ color: '#38bdf8' }}>{state.lastLookup.key}</code> → ring{' '}
                <strong style={{ color: '#10b981' }}>{state.lastLookup.ring}</strong> · jump{' '}
                <strong style={{ color: '#38bdf8' }}>{state.lastLookup.jump}</strong> · hrw{' '}
                <strong style={{ color: '#8b5cf6' }}>{state.lastLookup.hrw}</strong>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
