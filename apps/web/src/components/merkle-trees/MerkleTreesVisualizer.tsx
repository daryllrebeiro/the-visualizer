'use client';

import React from 'react';

import type { MerkleTreesClusterState, MerkleTreesSimEvent } from '@the-visualizer/simulation';
import { Badge, ControlButton, DataTable, Panel, StatRow } from '../new-domains/shared';

export interface MerkleTreesVisualizerProps {
  state: MerkleTreesClusterState;
  dispatch: (event: MerkleTreesSimEvent) => void;
}

function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}

export function MerkleTreesVisualizer({ state, dispatch }: MerkleTreesVisualizerProps): React.JSX.Element {
  const ev = (type: MerkleTreesSimEvent['type'], payload: Record<string, unknown>): void => {
    dispatch({ id: `mt-${Math.random().toString(36).slice(2, 8)}`, tick: state.tick + 1, type, payload } as MerkleTreesSimEvent);
  };

  // Build a compact tree layout: leaves at the bottom, root on top.
  const levels = state.primary.levels;
  const leafCount = state.primary.leaves.length;
  const nodeWidth = 72;
  const rowHeight = 52;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Panel
        title="Merkle Trees — Construction, Proofs, Anti-Entropy"
        subtitle={`${leafCount} leaves (padded) · root ${shortHash(state.primary.root)} · tick ${state.tick}`}
        accent="#06b6d4"
        right={
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <ControlButton label="Tick" onClick={() => ev('MERKLE_TICK', {})} />
            <ControlButton label="Rebuild (16 blocks)" onClick={() => ev('MERKLE_BUILD', { blocks: Array.from({ length: 16 }, (_, i) => `blk-${i}`) })} />
          </div>
        }
      >
        <StatRow
          items={[
            { label: 'Primary root', value: shortHash(state.primary.root) },
            { label: 'Replica root', value: shortHash(state.replica.root), color: state.replica.root === state.primary.root ? '#10b981' : '#ef4444' },
            { label: 'Hash computations', value: String(state.hashComputations) },
          ]}
        />
      </Panel>

      <Panel title="Tree construction (bottom-up hashing — flagship view)" accent="#38bdf8">
        <div style={{ overflowX: 'auto', padding: '4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: `${rowHeight - 34}px`, minWidth: leafCount * nodeWidth }}>
            {levels.map((level, li) => {
              const scale = leafCount / level.length;
              return (
                <div key={li} style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                  {level.map((hash, i) => {
                    const isLeaf = li === 0;
                    const leaf = isLeaf ? state.primary.leaves[i] : null;
                    return (
                      <div
                        key={i}
                        title={`${isLeaf ? `leaf: "${leaf?.data}"` : `internal ${li}`}: ${hash}`}
                        style={{
                          width: `${nodeWidth * Math.min(scale, 4)}px`,
                          padding: '4px 6px',
                          borderRadius: '6px',
                          border: `1px solid ${isLeaf ? '#334155' : '#164e63'}`,
                          backgroundColor: '#020617',
                          textAlign: 'center',
                          fontSize: '0.6rem',
                          color: isLeaf ? '#94a3b8' : '#22d3ee',
                          fontFamily: 'ui-monospace, monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isLeaf ? `${leaf?.data.slice(0, 8) || '∅'}` : shortHash(hash)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
          <ControlButton
            label="✨ Flip one bit in leaf 5 (MERKLE-1: root must change)"
            tone="danger"
            onClick={() => ev('MERKLE_FLIP_BIT', { leafIndex: 5 })}
          />
          {state.lastFlip && (
            <span style={{ fontSize: '0.7rem', color: '#f59e0b', alignSelf: 'center' }}>
              root {shortHash(state.lastFlip.rootBefore)} → <strong>{shortHash(state.lastFlip.rootAfter)}</strong> {state.lastFlip.rootBefore === state.lastFlip.rootAfter ? '⚠ UNCHANGED (COLLISION!)' : '✓ changed'}
            </span>
          )}
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Panel title="Inclusion proof — sibling path (MERKLE-2)" accent="#10b981">
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            <ControlButton label="Prove leaf 3" tone="success" onClick={() => ev('MERKLE_PROVE', { leafIndex: 3 })} />
            <ControlButton label="Tamper: wrong leaf data" tone="danger" disabled={!state.lastProof} onClick={() => ev('MERKLE_TAMPER_PROOF', { leafIndex: state.lastProof!.leafIndex, part: 'LEAF_DATA' })} />
            <ControlButton label="Tamper: sibling hash" tone="danger" disabled={!state.lastProof} onClick={() => ev('MERKLE_TAMPER_PROOF', { leafIndex: state.lastProof!.leafIndex, part: 'SIBLING_HASH' })} />
            <ControlButton label="Tamper: root" tone="danger" disabled={!state.lastProof} onClick={() => ev('MERKLE_TAMPER_PROOF', { leafIndex: state.lastProof!.leafIndex, part: 'ROOT' })} />
          </div>
          {state.lastProof ? (
            <>
              <DataTable
                headers={['level', 'sibling side', 'sibling hash']}
                rows={state.lastProof.proof.map((step, i) => [
                  String(i),
                  step.siblingSide,
                  <code key="h" style={{ color: '#38bdf8' }}>{shortHash(step.siblingHash)}</code>,
                ])}
                maxHeight="140px"
              />
              <div style={{ marginTop: '6px', fontSize: '0.7rem' }}>
                <Badge text={`proof verifies: ${state.lastProof.verified ? '✓ YES' : '✗ NO'}`} color={state.lastProof.verified ? '#10b981' : '#ef4444'} />
                {state.lastTamper && (
                  <Badge
                    text={`tamper (${state.lastTamper.part}) accepted: ${state.lastTamper.verified ? '⚠ YES — BUG!' : '✗ rejected'}`}
                    color={state.lastTamper.verified ? '#ef4444' : '#10b981'}
                  />
                )}
              </div>
            </>
          ) : (
            <div style={{ color: '#475569', fontSize: '0.8rem' }}>Generate a proof first.</div>
          )}
        </Panel>

        <Panel title="Anti-entropy replica comparison (MERKLE-3)" accent="#f59e0b">
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <ControlButton
              label="Diverge replica at leaves 2, 9"
              tone="warn"
              onClick={() => ev('MERKLE_DIVERGE', { leafIndices: [2, 9] })}
            />
            <ControlButton label="Run anti-entropy walk" tone="success" onClick={() => ev('MERKLE_ANTI_ENTROPY', {})} />
          </div>
          {state.antiEntropy ? (
            <>
              <StatRow
                items={[
                  { label: 'Divergent leaves', value: JSON.stringify(state.antiEntropy.divergentLeaves), color: '#f59e0b' },
                  { label: 'Hash comparisons', value: String(state.antiEntropy.comparisons), color: '#10b981' },
                  { label: 'Full scan cost', value: String(state.antiEntropy.fullScanCost), color: '#ef4444' },
                ]}
              />
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '6px' }}>
                {state.antiEntropy.comparisons < state.antiEntropy.fullScanCost
                  ? `✓ localized with ${state.antiEntropy.comparisons} comparisons vs ${state.antiEntropy.fullScanCost} for a full scan (${(state.antiEntropy.fullScanCost / Math.max(1, state.antiEntropy.comparisons)).toFixed(1)}× cheaper)`
                  : '⚠ walk not cheaper than full scan'}
              </div>
              <div style={{ marginTop: '6px', fontFamily: 'ui-monospace, monospace', fontSize: '0.65rem', color: '#94a3b8', maxHeight: '90px', overflowY: 'auto' }}>
                {state.antiEntropy.walkLog.slice(0, 25).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: '#475569', fontSize: '0.8rem' }}>Diverge the replica, then run the walk.</div>
          )}
        </Panel>
      </div>

      <Panel title="Merkle-Patricia trie — membership AND non-membership proofs (MERKLE-4)" accent="#8b5cf6">
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <ControlButton label="Insert key account-alice = 100" onClick={() => ev('MERKLE_PAT_INSERT', { key: 'account-alice', value: '100' })} />
          <ControlButton label="Insert key account-bob = 250" onClick={() => ev('MERKLE_PAT_INSERT', { key: 'account-bob', value: '250' })} />
          <ControlButton label="Insert key tx-0001 = 10" onClick={() => ev('MERKLE_PAT_INSERT', { key: 'tx-0001', value: '10' })} />
        </div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <ControlButton label="Prove membership: account-alice" tone="success" onClick={() => ev('MERKLE_PAT_PROVE_MEMBERSHIP', { key: 'account-alice' })} />
          <ControlButton label="Prove absence: account-zoe" tone="success" onClick={() => ev('MERKLE_PAT_PROVE_ABSENCE', { key: 'account-zoe' })} />
          <ControlButton label="🗡 Forge absence for account-bob" tone="danger" onClick={() => ev('MERKLE_PAT_FORGE_ABSENCE', { key: 'account-bob' })} />
        </div>
        <StatRow
          items={[
            { label: 'Trie keys', value: String(state.patricia.keyCount) },
            { label: 'Trie root hash', value: shortHash(state.patricia.rootHash) },
          ]}
        />
        {state.lastPatProof && (
          <div style={{ marginTop: '6px', fontSize: '0.75rem' }}>
            <Badge
              text={`${state.lastPatProof.claim} "${state.lastPatProof.key}": ${state.lastPatProof.verified ? 'VERIFIED' : 'REJECTED'}`}
              color={state.lastPatProof.verified ? '#10b981' : '#ef4444'}
            />
            {state.lastPatProof.value !== null && (
              <span style={{ color: '#94a3b8', marginLeft: '8px' }}>value: {state.lastPatProof.value}</span>
            )}
            <div style={{ color: '#64748b', marginTop: '4px', fontSize: '0.7rem' }}>{state.lastPatProof.note}</div>
          </div>
        )}
      </Panel>
    </div>
  );
}
