'use client';

import React, { useState } from 'react';

import type { FeatureStoreClusterState, FeatureStoreSimEvent } from '@the-visualizer/simulation';
import { Badge, ControlButton, DataTable, Panel, StatRow } from '../new-domains/shared';

export interface FeatureStoreVisualizerProps {
  state: FeatureStoreClusterState;
  dispatch: (event: FeatureStoreSimEvent) => void;
}

export function FeatureStoreVisualizer({ state, dispatch }: FeatureStoreVisualizerProps): React.JSX.Element {
  const [asOf, setAsOf] = useState(10);
  const ev = (type: FeatureStoreSimEvent['type'], payload: Record<string, unknown>): void => {
    dispatch({ id: `fs-${Math.random().toString(36).slice(2, 8)}`, tick: state.tick + 1, type, payload } as FeatureStoreSimEvent);
  };

  const entities = Object.keys(state.offlineStore);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Panel
        title="ML Feature Store — Point-in-Time Joins & Freshness"
        subtitle={`tick ${state.tick} · sync every ${state.syncInterval}t · TTL ${Object.values(state.definitions)[0]?.ttlTicks ?? 10}t`}
        accent="#8b5cf6"
        right={<ControlButton label="Tick (sync)" tone="success" onClick={() => ev('FS_TICK', {})} />}
      >
        <StatRow
          items={[
            { label: 'Offline rows', value: String(state.stats.offlineIngests) },
            { label: 'Online syncs', value: String(state.stats.onlineSyncs) },
            { label: 'Training sets', value: String(state.stats.trainingSetJoins) },
            { label: 'Serving lookups', value: String(state.stats.servingRequests) },
            { label: 'Stale serves (FS-3)', value: String(state.stats.staleServes), color: state.stats.staleServes > 0 ? '#f59e0b' : undefined },
          ]}
        />
      </Panel>

      <Panel title="Feature timeline + draggable as-of marker (FS-1 flagship)" accent="#38bdf8">
        <div style={{ marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>as-of T =</span>
          <input
            type="range"
            min={0}
            max={30}
            value={asOf}
            onChange={(e) => setAsOf(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <strong style={{ color: '#38bdf8' }}>{asOf}</strong>
        </div>
        {entities.map((entity) =>
          state.featureOrder.map((feature) => {
            const history = state.offlineStore[entity]?.[feature] ?? [];
            if (history.length === 0) return null;
            return (
              <div key={`${entity}-${feature}`} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', minWidth: '190px' }}>
                  {entity} · {feature} <code style={{ color: '#475569' }}>v{state.definitions[feature]!.version}</code>
                </span>
                <div style={{ position: 'relative', height: '22px', flex: 1, backgroundColor: '#020617', borderRadius: '4px', border: '1px solid #1e293b' }}>
                  {history.map((h) => {
                    const visible = h.eventTime <= asOf;
                    const isLatestVisible = visible && !history.some((o) => o.eventTime > h.eventTime && o.eventTime <= asOf);
                    return (
                      <div
                        key={h.eventTime}
                        title={`t${h.eventTime}: ${h.value} (v${h.version})`}
                        style={{
                          position: 'absolute',
                          left: `${(h.eventTime / 30) * 100}%`,
                          top: '3px',
                          width: '14px',
                          height: '14px',
                          borderRadius: '3px',
                          backgroundColor: visible ? (isLatestVisible ? '#10b981' : '#334155') : '#1e293b',
                          border: isLatestVisible ? '2px solid #10b981' : '1px solid #334155',
                        }}
                      />
                    );
                  })}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${(asOf / 30) * 100}%`,
                      top: '-4px',
                      bottom: '-4px',
                      width: '2px',
                      backgroundColor: '#38bdf8',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.7rem', color: '#f8fafc', minWidth: '50px' }}>
                  {(() => {
                    const visible = history.filter((h) => h.eventTime <= asOf);
                    return visible.length > 0 ? String(visible[visible.length - 1]!.value) : '—';
                  })()}
                </span>
              </div>
            );
          }),
        )}
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <ControlButton
            label={`Join training set at T=${asOf} (FS-1)`}
            tone="success"
            onClick={() => ev('FS_JOIN_TRAINING_SET', { setId: `ts-t${asOf}-${state.stats.trainingSetJoins + 1}`, labelTimestamp: asOf })}
          />
          <ControlButton label="Sync online now (FS-2)" onClick={() => ev('FS_SYNC_ONLINE', {})} />
          <ControlButton
            label="Ingest new offline value at T"
            onClick={() =>
              ev('FS_INGEST_OFFLINE', {
                entity: 'user-1',
                feature: 'user_avg_spend',
                value: 100 + Math.floor(Math.random() * 50),
                eventTime: asOf,
              })
            }
          />
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Panel title="Online store (serving lane) vs offline (training lane)" accent="#10b981">
          <DataTable
            headers={['entity', 'feature', 'online', 'watermark', 'offline@watermark']}
            rows={entities.flatMap((entity) =>
              Object.keys(state.onlineStore[entity] ?? {}).map((feature) => {
                const online = state.onlineStore[entity]![feature]!;
                const watermark = state.syncWatermark[feature] ?? 0;
                const offlinePit = (() => {
                  const history = state.offlineStore[entity]?.[feature] ?? [];
                  const vis = history.filter((h) => h.eventTime <= watermark);
                  return vis.length > 0 ? String(vis[vis.length - 1]!.value) : '—';
                })();
                const consistent = String(online.value) === offlinePit;
                return [
                  entity,
                  feature,
                  <span key="o" style={{ color: '#10b981' }}>{online.value} (t{online.writeTick})</span>,
                  `t${watermark}`,
                  <span key="p" style={{ color: consistent ? '#10b981' : '#f59e0b' }}>
                    {offlinePit} {consistent ? '✓' : '⚠ sync lag'}
                  </span>,
                ];
              }),
            )}
            maxHeight="200px"
          />
        </Panel>

        <Panel title="Last serving request — freshness flags (FS-3)" accent="#f59e0b">
          {state.lastServing === null ? (
            <div style={{ color: '#475569', fontSize: '0.8rem' }}>
              No serving request yet.
              <div style={{ marginTop: '8px' }}>
                <ControlButton label="Serve user-1" tone="success" onClick={() => ev('FS_SERVE', { entity: 'user-1' })} />
              </div>
            </div>
          ) : (
            <>
              <DataTable
                headers={['feature', 'value', 'age', 'stale?']}
                rows={state.lastServing.results.map((r) => [
                  r.feature,
                  r.value === null ? '—' : String(r.value),
                  r.ageTicks === Infinity ? '∞' : `${r.ageTicks}t`,
                  <Badge key="s" text={r.stale ? 'STALE' : 'FRESH'} color={r.stale ? '#f59e0b' : '#10b981'} />,
                ])}
              />
              <div style={{ marginTop: '8px' }}>
                <ControlButton label={`Serve ${state.lastServing.entity} again`} tone="success" onClick={() => ev('FS_SERVE', { entity: state.lastServing!.entity })} />
              </div>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Training sets — pinned definition versions (FS-4)" accent="#ec4899">
        <DataTable
          headers={['set', 'label T', 'rows', 'pinned versions']}
          rows={state.trainingSetOrder.map((id) => {
            const set = state.trainingSets[id]!;
            return [
              <code key="i" style={{ color: '#ec4899' }}>{id}</code>,
              String(set.labelTimestamp),
              String(set.rows.length),
              Object.entries(set.definitionVersions)
                .map(([f, v]) => `${f}@v${v}`)
                .join(', '),
            ];
          })}
          maxHeight="160px"
        />
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <ControlButton
            label="✏️ Edit login_count definition (bump version, FS-4)"
            tone="warn"
            onClick={() => ev('FS_EDIT_DEFINITION', { feature: 'login_count', computation: 'count(logins) over 14d window' })}
          />
        </div>
      </Panel>
    </div>
  );
}
