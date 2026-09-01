'use client';

import React, { useState } from 'react';
import type {
  BTreeNode,
  StorageEngineClusterState,
  StorageEngineType,
} from '@the-visualizer/simulation';

interface StorageEngineVisualizerProps {
  state: StorageEngineClusterState;
  onWrite: (key: number, value: string) => void;
  onRead: (key: number) => void;
  onSwitchEngine: (engine: StorageEngineType) => void;
  onTriggerFlush: () => void;
  onTriggerCompaction: (level: number) => void;
}

export function StorageEngineVisualizer({
  state,
  onWrite,
  onRead,
  onSwitchEngine,
  onTriggerFlush,
  onTriggerCompaction,
}: StorageEngineVisualizerProps): React.JSX.Element {
  const [keyInput, setKeyInput] = useState<string>('25');
  const [valueInput, setValueInput] = useState<string>('user_record_25');

  const handleWriteSubmit = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    const k = parseInt(keyInput.trim(), 10);
    if (isNaN(k)) return;
    onWrite(k, valueInput.trim() || `val_${String(k)}`);
  };

  const handleReadSubmit = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    const k = parseInt(keyInput.trim(), 10);
    if (isNaN(k)) return;
    onRead(k);
  };

  const nodes = Object.values(state.btree.nodes) as BTreeNode[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.4rem' }}>💾</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
              Storage Engine Internals (B+ Tree vs. LSM-Tree & Compaction)
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Engine: <strong style={{ color: state.activeEngine === 'B_TREE' ? '#14b8a6' : '#f59e0b' }}>{state.activeEngine}</strong> · Writes: <strong style={{ color: '#38bdf8' }}>{state.totalWrites}</strong> · Reads: <strong style={{ color: '#4ade80' }}>{state.totalReads}</strong> · Page Splits: <strong style={{ color: '#ec4899' }}>{state.btree.totalPageSplits}</strong> · Compactions: <strong style={{ color: '#a855f7' }}>{state.lsm.totalCompactions}</strong>
            </span>
          </div>
        </div>

        {/* Engine Switcher & Operations */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', border: '1px solid #334155', borderRadius: '4px', overflow: 'hidden' }}>
            <button
              onClick={() => onSwitchEngine('B_TREE')}
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                backgroundColor: state.activeEngine === 'B_TREE' ? '#14b8a6' : '#1e293b',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              🌳 B+ Tree (SQLite)
            </button>
            <button
              onClick={() => onSwitchEngine('LSM_TREE')}
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                backgroundColor: state.activeEngine === 'LSM_TREE' ? '#f59e0b' : '#1e293b',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ⚡ LSM-Tree (RocksDB)
            </button>
          </div>

          <form onSubmit={handleWriteSubmit} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input
              type="number"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Key"
              style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '4px', width: '60px' }}
            />
            <input
              type="text"
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              placeholder="Value"
              style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '4px', width: '110px' }}
            />
            <button type="submit" className="btn btn--primary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
              ✍️ Write
            </button>
            <button type="button" onClick={handleReadSubmit} className="btn btn--secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
              🔍 Read
            </button>
          </form>
        </div>
      </div>

      {/* Main Canvas: B+ Tree or LSM-Tree */}
      {state.activeEngine === 'B_TREE' ? (
        /* B+ Tree View */
        <div style={{ flex: 1, backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
              🌳 B+ Tree Pages & Index Structure (Order {state.btree.maxDegree})
            </span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Root: <code>{state.btree.rootId}</code> · Nodes: {nodes.length}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {nodes.map((node) => {
              const isRoot = node.id === state.btree.rootId;
              const isTraversed = state.btree.traversalPath.includes(node.id);
              return (
                <div
                  key={node.id}
                  style={{
                    backgroundColor: isTraversed ? 'rgba(20, 184, 166, 0.15)' : '#020617',
                    border: isRoot ? '2px solid #14b8a6' : isTraversed ? '1px solid #14b8a6' : '1px solid #334155',
                    borderRadius: '8px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.75rem', color: isRoot ? '#14b8a6' : '#f8fafc' }}>
                      {isRoot ? '👑 ' : ''}{node.id}
                    </span>
                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '3px', backgroundColor: node.isLeaf ? 'rgba(56, 189, 248, 0.2)' : 'rgba(168, 85, 247, 0.2)', color: node.isLeaf ? '#38bdf8' : '#c084fc' }}>
                      {node.isLeaf ? 'LEAF' : 'INTERNAL'}
                    </span>
                  </div>

                  {/* Keys Grid */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {node.keys.map((k, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #475569',
                          borderRadius: '4px',
                          padding: '3px 6px',
                          fontSize: '0.75rem',
                          fontFamily: 'monospace',
                          color: '#f8fafc',
                        }}
                      >
                        {k}
                      </div>
                    ))}
                  </div>

                  {/* Children Pointers */}
                  {!node.isLeaf && (
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                      Children: {node.childrenIds.join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* LSM-Tree View */
        <div style={{ flex: 1, backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          {/* Top Section: MemTable & WAL */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* MemTable */}
            <div style={{ backgroundColor: '#020617', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#f59e0b' }}>
                  📝 In-Memory MemTable (SkipList Buffer)
                </span>
                <button onClick={onTriggerFlush} className="btn btn--amber" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                  ⚡ Force Flush
                </button>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                Capacity: {state.lsm.memTable.length} / {state.lsm.memTableCapacity}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {state.lsm.memTable.length === 0 ? (
                  <span style={{ fontSize: '0.7rem', color: '#475569', fontStyle: 'italic' }}>(empty buffer)</span>
                ) : (
                  state.lsm.memTable.map((e) => (
                    <div key={e.key} style={{ backgroundColor: '#1e293b', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#f8fafc' }}>
                      {e.key}: &quot;{e.value}&quot;
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* WAL */}
            <div style={{ backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#38bdf8' }}>
                📜 Write-Ahead Log (WAL On-Disk Log)
              </span>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                Total Appended Records: {state.lsm.wal.length}
              </div>
              <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }}>
                {state.lsm.wal.slice(-6).map((e, idx) => (
                  <div key={idx} style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', padding: '2px 6px', borderRadius: '3px', fontSize: '0.68rem', fontFamily: 'monospace', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    +{e.key}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Section: SSTable Levels (L0 -> L1 -> L2) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                🗄️ On-Disk SSTables & Leveled Compaction Runs
              </span>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                Bloom Filter Hits: <strong style={{ color: '#4ade80' }}>{state.lsm.bloomFilterHits}</strong> · Negative Skips: <strong style={{ color: '#38bdf8' }}>{state.lsm.bloomFilterFalses}</strong>
              </span>
            </div>

            {['0', '1', '2'].map((lvl) => {
              const tables = state.lsm.levels[lvl] ?? [];
              return (
                <div key={lvl} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.75rem', color: lvl === '0' ? '#f59e0b' : '#38bdf8' }}>
                      Level {lvl} ({tables.length} SSTables)
                    </span>
                    {tables.length > 0 && lvl === '0' && (
                      <button onClick={() => onTriggerCompaction(0)} className="btn btn--indigo" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                        ⚡ Compact to L1
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                    {tables.length === 0 ? (
                      <span style={{ fontSize: '0.68rem', color: '#475569', fontStyle: 'italic' }}>(no SSTables at this level)</span>
                    ) : (
                      tables.map((t) => (
                        <div key={t.id} style={{ minWidth: '180px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '4px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#f8fafc', fontWeight: 600 }}>
                            <span>{t.id.slice(0, 16)}</span>
                            <span>[{t.minKey}..{t.maxKey}]</span>
                          </div>
                          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: '#a855f7' }}>
                            Bloom: {t.bloomFilterBitset}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                            {t.entries.length} keys ({t.sizeBytes} B)
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
