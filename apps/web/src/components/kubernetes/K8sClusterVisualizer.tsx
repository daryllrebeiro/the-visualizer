'use client';

import React, { useState } from 'react';

import type { K8sClusterState, K8sNode, PodSpec, ReplicaSetSpec } from '@the-visualizer/simulation';

interface K8sClusterVisualizerProps {
  state: K8sClusterState;
  onScaleDeployment: (deploymentId: string, replicas: number) => void;
  onUpdateImage: (deploymentId: string, newImage: string) => void;
  onNodeCordon: (nodeId: string) => void;
  onNodeDrain: (nodeId: string) => void;
  onNodeCrash: (nodeId: string) => void;
  onNodeRecover: (nodeId: string) => void;
}

export function K8sClusterVisualizer({
  state,
  onScaleDeployment,
  onUpdateImage,
  onNodeCordon,
  onNodeDrain,
  onNodeCrash,
  onNodeRecover,
}: K8sClusterVisualizerProps): React.JSX.Element {
  const [selectedDepId, setSelectedDepId] = useState<string>('dep-api');
  const [newImageInput, setNewImageInput] = useState<string>('api:v2.0.0');

  const nodes = Object.values(state.nodes) as K8sNode[];
  const pods = Object.values(state.pods) as PodSpec[];
  const deployments = Object.values(state.deployments);
  const currentDep = state.deployments[selectedDepId];

  const replicaSets = (Object.values(state.replicaSets) as ReplicaSetSpec[]).filter(
    (rs) => rs.deploymentId === selectedDepId,
  );

  const pendingPods = pods.filter((p) => p.status === 'Pending');
  const runningPods = pods.filter((p) => p.status === 'Running');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '16px',
      }}
    >
      {/* Top Banner: Cluster Metrics & Rolling Update Actions */}
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
          <span style={{ fontSize: '1.4rem' }}>☸️</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
              Kubernetes Cluster (Two-Phase Scheduler & Declarative Control Loops)
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Pods: <strong style={{ color: '#4ade80' }}>{runningPods.length} Running</strong> ·{' '}
              <strong style={{ color: '#fbbf24' }}>{pendingPods.length} Pending</strong> ·
              Reconciliations: <strong>{state.totalReconciliations}</strong> · Evictions:{' '}
              <strong>{state.totalPodsEvicted}</strong>
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        {currentDep && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
              Replicas ({currentDep.replicas}):
            </span>
            <button
              onClick={() => onScaleDeployment(currentDep.id, Math.max(0, currentDep.replicas - 1))}
              className="btn btn--secondary"
              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
            >
              -1
            </button>
            <button
              onClick={() => onScaleDeployment(currentDep.id, currentDep.replicas + 1)}
              className="btn btn--secondary"
              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
            >
              +1
            </button>

            <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
              <input
                type="text"
                value={newImageInput}
                onChange={(e) => setNewImageInput(e.target.value)}
                placeholder="New Image e.g. api:v2.0.0"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  width: '120px',
                }}
              />
              <button
                onClick={() => onUpdateImage(currentDep.id, newImageInput.trim())}
                className="btn btn--indigo"
                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
              >
                🚀 Rollout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Workload Rollout Tree & Worker Node Bin-Packing Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 340px) 1fr',
          gap: '16px',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left Column: Workload Tree & "Why is this Pod Pending?" Inspector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          {/* Deployment Spec Card */}
          <div
            style={{
              backgroundColor: '#0f172a',
              borderRadius: '8px',
              padding: '12px',
              border: '1px solid #1e293b',
            }}
          >
            <div
              style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}
            >
              📦 Deployments & Revisions
            </div>
            {deployments.map((dep) => (
              <div
                key={dep.id}
                onClick={() => setSelectedDepId(dep.id)}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  backgroundColor: selectedDepId === dep.id ? '#1e293b' : '#020617',
                  border: selectedDepId === dep.id ? '1px solid #38bdf8' : '1px solid #1e293b',
                  cursor: 'pointer',
                  marginBottom: '6px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#f8fafc',
                  }}
                >
                  <span>{dep.name}</span>
                  <span style={{ color: '#38bdf8' }}>Rev #{dep.currentRevision}</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                  Image: <code>{dep.image}</code> · Replicas: {dep.replicas}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                  Req: {dep.resources.cpuMillis}m CPU / {dep.resources.memoryMb}Mi Mem (maxSurge:{' '}
                  {dep.maxSurge})
                </div>
              </div>
            ))}

            {/* ReplicaSet Hierarchy */}
            <div style={{ marginTop: '10px' }}>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>
                ReplicaSets:
              </span>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}
              >
                {replicaSets.map((rs) => {
                  const rsPods = pods.filter((p) => p.replicaSetId === rs.id);
                  return (
                    <div
                      key={rs.id}
                      style={{
                        fontSize: '0.65rem',
                        fontFamily: 'monospace',
                        padding: '4px 6px',
                        backgroundColor: '#020617',
                        borderRadius: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: rs.revision === currentDep?.currentRevision ? '#4ade80' : '#94a3b8',
                      }}
                    >
                      <span>{rs.name}</span>
                      <span>
                        {rsPods.length}/{rs.replicas} pods
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* "Why is this Pod Pending?" Diagnostic Inspector */}
          {pendingPods.length > 0 && (
            <div
              style={{
                backgroundColor: 'rgba(234, 179, 8, 0.05)',
                border: '1px solid rgba(234, 179, 8, 0.4)',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>⚠️</span> Why is this Pod Pending?
              </div>
              <div
                style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}
              >
                {pendingPods.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      fontSize: '0.7rem',
                      backgroundColor: '#020617',
                      padding: '6px',
                      borderRadius: '4px',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#f8fafc' }}>Pod: {p.name}</div>
                    <div style={{ color: '#fca5a5', marginTop: '2px' }}>
                      {p.pendingReason ?? 'Evaluating scheduler predicates...'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Worker Nodes Bin-Packing Canvas */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px',
            overflowY: 'auto',
          }}
        >
          {nodes.map((node) => {
            const isNodeDown = node.status === 'NotReady';
            const isCordoned = node.status === 'SchedulingDisabled';
            const nodePods = pods.filter((p) => p.nodeName === node.name);

            const cpuPct = Math.min(
              100,
              (node.allocated.cpuMillis / node.capacity.cpuMillis) * 100,
            );
            const memPct = Math.min(100, (node.allocated.memoryMb / node.capacity.memoryMb) * 100);

            return (
              <div
                key={node.id}
                style={{
                  backgroundColor: isNodeDown
                    ? 'rgba(244, 63, 94, 0.05)'
                    : isCordoned
                      ? 'rgba(234, 179, 8, 0.05)'
                      : '#0f172a',
                  border: isNodeDown
                    ? '1px solid rgba(244, 63, 94, 0.4)'
                    : isCordoned
                      ? '1px solid rgba(234, 179, 8, 0.4)'
                      : `1px solid ${node.color}60`,
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {/* Node Header */}
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: node.color,
                      }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f8fafc' }}>
                      {node.name}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: isNodeDown
                        ? '#f43f5e20'
                        : isCordoned
                          ? '#eab30820'
                          : '#22c55e20',
                      color: isNodeDown ? '#f43f5e' : isCordoned ? '#fbbf24' : '#4ade80',
                      fontWeight: 700,
                    }}
                  >
                    {node.status}
                  </span>
                </div>

                {/* Dual Resource Meters: CPU & Memory */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* CPU Meter */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.65rem',
                        color: '#cbd5e1',
                      }}
                    >
                      <span>CPU Allocation</span>
                      <span>
                        {node.allocated.cpuMillis} / {node.capacity.cpuMillis} mcores (
                        {cpuPct.toFixed(0)}%)
                      </span>
                    </div>
                    <div
                      style={{
                        height: '4px',
                        backgroundColor: '#1e293b',
                        borderRadius: '2px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${cpuPct}%`,
                          backgroundColor: cpuPct > 80 ? '#f43f5e' : '#38bdf8',
                          transition: 'width 0.2s linear',
                        }}
                      />
                    </div>
                  </div>

                  {/* Memory Meter */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.65rem',
                        color: '#cbd5e1',
                      }}
                    >
                      <span>Memory Allocation</span>
                      <span>
                        {node.allocated.memoryMb} / {node.capacity.memoryMb} MiB (
                        {memPct.toFixed(0)}%)
                      </span>
                    </div>
                    <div
                      style={{
                        height: '4px',
                        backgroundColor: '#1e293b',
                        borderRadius: '2px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${memPct}%`,
                          backgroundColor: memPct > 80 ? '#f43f5e' : '#34d399',
                          transition: 'width 0.2s linear',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Scheduled Pods Container */}
                <div
                  style={{
                    flex: 1,
                    backgroundColor: '#020617',
                    padding: '6px',
                    borderRadius: '4px',
                    minHeight: '80px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                    Scheduled Pods ({nodePods.length}):
                  </span>
                  {nodePods.length === 0 ? (
                    <span style={{ fontSize: '0.65rem', color: '#475569', fontStyle: 'italic' }}>
                      (no pods scheduled)
                    </span>
                  ) : (
                    nodePods.map((pod) => (
                      <div
                        key={pod.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '3px 6px',
                          backgroundColor: '#0f172a',
                          borderRadius: '4px',
                          border: '1px solid #1e293b',
                          fontSize: '0.65rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: '#4ade80',
                            }}
                          />
                          <span style={{ color: '#f8fafc', fontWeight: 600 }}>{pod.name}</span>
                        </div>
                        <span style={{ color: '#94a3b8', fontSize: '0.6rem' }}>{pod.image}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Node Actions Toolbar */}
                <div
                  style={{
                    display: 'flex',
                    gap: '6px',
                    paddingTop: '4px',
                    borderTop: '1px solid #1e293b',
                  }}
                >
                  <button
                    onClick={() => onNodeCordon(node.id)}
                    className="btn btn--secondary"
                    style={{ flex: 1, fontSize: '0.65rem', padding: '3px 4px' }}
                  >
                    {isCordoned ? '🔓 Uncordon' : '🔒 Cordon'}
                  </button>
                  <button
                    onClick={() => onNodeDrain(node.id)}
                    className="btn btn--indigo"
                    style={{ flex: 1, fontSize: '0.65rem', padding: '3px 4px' }}
                  >
                    🧹 Drain
                  </button>
                  {isNodeDown ? (
                    <button
                      onClick={() => onNodeRecover(node.id)}
                      className="btn btn--emerald"
                      style={{ flex: 1, fontSize: '0.65rem', padding: '3px 4px' }}
                    >
                      ⚡ Recover
                    </button>
                  ) : (
                    <button
                      onClick={() => onNodeCrash(node.id)}
                      className="btn btn--rose"
                      style={{ flex: 1, fontSize: '0.65rem', padding: '3px 4px' }}
                    >
                      💥 Crash
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
