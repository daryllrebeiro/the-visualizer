'use client';

import React, { useState } from 'react';
import type {
  AgentDagStep,
  LlmPipelineClusterState,
  PipelineChunk,
  PipelineDocument,
  ResponseClaim,
  SynthesizedResponse,
} from '@the-visualizer/simulation';

export interface LlmPipelineVisualizerProps {
  state: LlmPipelineClusterState;
  onIngestDoc?: (docId: string, title: string, content: string) => void;
  onExecuteHybridSearch?: (queryId: string, queryText: string) => void;
  onDispatchAgentStep?: (step: {
    stepId: string;
    taskId: string;
    type: 'PLAN' | 'TOOL_CALL' | 'OBSERVATION' | 'SYNTHESIS';
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    output?: string;
    dependsOn?: string[];
  }) => void;
  onSynthesizeResponse?: (queryId: string, answerText: string, claims: ResponseClaim[]) => void;
  onSeverLineage?: (responseId: string, claimId: string) => void;
  onInjectToolFailure?: (stepId: string, reason: string) => void;
}

export function LlmPipelineVisualizer({
  state,
  onIngestDoc,
  onExecuteHybridSearch,
  onDispatchAgentStep,
  onSynthesizeResponse,
  onSeverLineage,
  onInjectToolFailure,
}: LlmPipelineVisualizerProps): React.JSX.Element {
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>('claim-init-1');
  const [inspectNodeId, setInspectNodeId] = useState<string | null>(null);
  const [isTableViewOpen, setIsTableViewOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('distributed consensus leader election');

  // Compute active walk-back path for the selected claim
  const responses = Object.values(state.synthesizedResponses) as SynthesizedResponse[];
  const activeResponse: SynthesizedResponse | undefined = responses[0];
  const activeClaim: ResponseClaim | undefined = activeResponse?.claims.find(
    (c: ResponseClaim) => c.claimId === selectedClaimId,
  );
  const activeChunk: PipelineChunk | undefined = activeClaim
    ? (state.chunks[activeClaim.citationChunkId] as PipelineChunk | undefined)
    : undefined;
  const activeDoc: PipelineDocument | undefined = activeChunk
    ? (state.documents[activeChunk.docId] as PipelineDocument | undefined)
    : undefined;
  const activeObsStep: AgentDagStep | undefined = activeClaim?.observationStepId
    ? (state.agentSteps[activeClaim.observationStepId] as AgentDagStep | undefined)
    : undefined;
  const activeToolStep: AgentDagStep | undefined =
    activeObsStep && activeObsStep.dependsOn[0]
      ? (state.agentSteps[activeObsStep.dependsOn[0]] as AgentDagStep | undefined)
      : undefined;

  const isLineageIntact = Boolean(activeClaim && !activeClaim.isLineageSevered && activeChunk && activeDoc);

  return (
    <main
      role="main"
      aria-label="LLM Pipeline Simulation Dashboard"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '16px',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header Banner */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          padding: '14px 18px',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.25rem' }}>🧬</span>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
              LLM Pipeline: ETL, RAG & Agentic Tool Use
            </h1>
            <span
              style={{
                backgroundColor: '#0e7490',
                color: '#cffafe',
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              W3C PROV / OpenLineage
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
            Cluster: <code>{state.clusterId}</code> · Tick: <strong>{state.tick}</strong> · Documents:{' '}
            {Object.keys(state.documents).length} · Chunks: {Object.keys(state.chunks).length} ·
            Context: {state.currentContextTokens} / {state.maxContextTokens} tok
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Flagship Invariant PIPE-8 Status Pill */}
          <div
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: isLineageIntact ? '#064e3b' : '#7f1d1d',
              border: isLineageIntact ? '1px solid #059669' : '1px solid #dc2626',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>INVARIANT PIPE-8</div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: isLineageIntact ? '#6ee7b7' : '#fca5a5',
              }}
            >
              {isLineageIntact ? 'LINEAGE VERIFIED' : 'LINEAGE SEVERED'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsTableViewOpen(!isTableViewOpen)}
            aria-label="Toggle accessible data table view"
            style={{
              padding: '8px 12px',
              fontSize: '0.8rem',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            📊 {isTableViewOpen ? 'Hide Table View' : 'Table View'}
          </button>
        </div>
      </header>

      {/* Accessible Table View Modal */}
      {isTableViewOpen && (
        <section
          aria-label="Accessible Tabular State View"
          style={{
            backgroundColor: '#020617',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #334155',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          <h2 style={{ fontSize: '0.9rem', margin: '0 0 8px 0', color: '#38bdf8' }}>
            Entity Provenance & Lineage Ledger Table
          </h2>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.75rem',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                <th style={{ padding: '6px' }}>Entity Type</th>
                <th style={{ padding: '6px' }}>Entity ID</th>
                <th style={{ padding: '6px' }}>Label / Details</th>
                <th style={{ padding: '6px' }}>Causal Parent</th>
                <th style={{ padding: '6px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(Object.values(state.documents) as PipelineDocument[]).map((d: PipelineDocument) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '6px', color: '#06b6d4' }}>DOCUMENT</td>
                  <td style={{ padding: '6px' }}>{d.id}</td>
                  <td style={{ padding: '6px' }}>{d.title}</td>
                  <td style={{ padding: '6px' }}>ROOT</td>
                  <td style={{ padding: '6px', color: '#10b981' }}>INGESTED</td>
                </tr>
              ))}
              {(Object.values(state.chunks) as PipelineChunk[]).map((c: PipelineChunk) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '6px', color: '#3b82f6' }}>CHUNK</td>
                  <td style={{ padding: '6px' }}>{c.id}</td>
                  <td style={{ padding: '6px' }}>{c.text.slice(0, 40)}...</td>
                  <td style={{ padding: '6px' }}>{c.docId}</td>
                  <td style={{ padding: '6px', color: '#10b981' }}>INDEXED</td>
                </tr>
              ))}
              {responses.flatMap((r: SynthesizedResponse) =>
                r.claims.map((claim: ResponseClaim) => (
                  <tr key={claim.claimId} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '6px', color: '#ec4899' }}>CLAIM</td>
                    <td style={{ padding: '6px' }}>{claim.claimId}</td>
                    <td style={{ padding: '6px' }}>{claim.text}</td>
                    <td style={{ padding: '6px' }}>{claim.citationChunkId}</td>
                    <td
                      style={{
                        padding: '6px',
                        color: claim.isLineageSevered ? '#ef4444' : '#10b981',
                        fontWeight: 700,
                      }}
                    >
                      {claim.isLineageSevered ? 'SEVERED' : 'VERIFIED'}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* Action Controls & Chaos Injections */}
      <section
        aria-label="Simulation Action & Chaos Controls"
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          backgroundColor: '#020617',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Query:</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Enter query text..."
          style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            color: '#f8fafc',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            minWidth: '220px',
          }}
        />

        <button
          type="button"
          onClick={() =>
            onIngestDoc?.(
              `doc-kv-${state.tick + 1}`,
              'PagedAttention Virtual Memory',
              'PagedAttention allocates non-contiguous physical GPU blocks with virtual page tables.',
            )
          }
          style={{
            backgroundColor: '#0284c7',
            color: '#fff',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          📄 Ingest Doc
        </button>
        <button
          type="button"
          onClick={() => onExecuteHybridSearch?.(`q-${state.tick}`, searchQuery)}
          style={{
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          🔍 Hybrid Search (RRF)
        </button>
        <button
          type="button"
          onClick={() =>
            onDispatchAgentStep?.({
              stepId: `tool-${state.tick}`,
              taskId: 'task-live',
              type: 'TOOL_CALL',
              toolName: 'knowledge_search',
              toolArgs: { query: searchQuery },
              dependsOn: ['step-plan-1'],
            })
          }
          style={{
            backgroundColor: '#7c3aed',
            color: '#fff',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          🤖 Dispatch Tool Call
        </button>
        <button
          type="button"
          onClick={() => {
            const chunks = Object.values(state.chunks) as PipelineChunk[];
            const firstChunk = chunks[0];
            if (firstChunk) {
              onSynthesizeResponse?.(`q-${state.tick}`, 'Synthesized grounded answer from pipeline.', [
                {
                  claimId: `claim-${state.tick}`,
                  text: 'Verified statement referencing retrieved chunk',
                  citationChunkId: firstChunk.id,
                  observationStepId: 'step-obs-1',
                },
              ]);
            }
          }}
          style={{
            backgroundColor: '#059669',
            color: '#fff',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          ✍️ Synthesize Answer
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => {
              if (activeResponse && activeClaim) {
                onSeverLineage?.(activeResponse.id, activeClaim.claimId);
              }
            }}
            style={{
              backgroundColor: '#991b1b',
              color: '#fee2e2',
              border: '1px solid #ef4444',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            💥 Sever Lineage (PIPE-8 Violation)
          </button>
          <button
            type="button"
            onClick={() => onInjectToolFailure?.('step-tool-1', 'Upstream tool timeout')}
            style={{
              backgroundColor: '#854d0e',
              color: '#fef08a',
              border: '1px solid #eab308',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⚠️ Tool Failure Chaos
          </button>
        </div>
      </section>

      {/* Flagship Visual: Provenance Graph Walk-Back Canvas */}
      <section
        aria-label="Flagship Visual: Provenance Graph Walk-Back"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          backgroundColor: '#020617',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          padding: '16px',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#38bdf8' }}>
              Flagship Visual: Provenance Graph Walk-Back
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              Click any claim in the synthesized answer to animate backward causal lineage through
              tool execution to source passage.
            </p>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {state.lineageGraph.edges.length} Causal Edges · {Object.keys(state.lineageGraph.nodes).length} Lineage Nodes
          </span>
        </div>

        {/* Synthesized Response Claims Picker */}
        <div
          style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '12px',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>
            Synthesized Output Response:
          </div>
          <div style={{ fontSize: '0.85rem', color: '#f8fafc', marginBottom: '10px' }}>
            &ldquo;{activeResponse?.answerText || 'No response synthesized yet.'}&rdquo;
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {activeResponse?.claims.map((claim: ResponseClaim) => (
              <button
                key={claim.claimId}
                type="button"
                onClick={() => setSelectedClaimId(claim.claimId)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  border:
                    selectedClaimId === claim.claimId
                      ? '2px solid #38bdf8'
                      : claim.isLineageSevered
                        ? '1px solid #ef4444'
                        : '1px solid #334155',
                  backgroundColor:
                    selectedClaimId === claim.claimId
                      ? '#0369a1'
                      : claim.isLineageSevered
                        ? '#450a0a'
                        : '#1e293b',
                  color: claim.isLineageSevered ? '#fca5a5' : '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{claim.isLineageSevered ? '❌' : '🔍'}</span>
                <span>Claim: {claim.text}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Multi-Stage Walk-Back Ribbon */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            alignItems: 'stretch',
          }}
        >
          {/* Stage 1: Synthesized Claim */}
          <div
            onClick={() => setInspectNodeId(activeClaim?.claimId || null)}
            style={{
              backgroundColor: '#090d16',
              border: activeClaim?.isLineageSevered ? '2px solid #ef4444' : '1px solid #ec4899',
              borderRadius: '6px',
              padding: '12px',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '0.65rem', color: '#ec4899', fontWeight: 700 }}>
              STAGE 4: SYNTHESIZED CLAIM
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '4px' }}>
              {activeClaim?.text || 'No claim selected'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '6px' }}>
              Status:{' '}
              <strong style={{ color: activeClaim?.isLineageSevered ? '#ef4444' : '#10b981' }}>
                {activeClaim?.isLineageSevered ? 'SEVERED' : 'VERIFIED CAUSAL'}
              </strong>
            </div>
          </div>

          {/* Arrow */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              fontSize: '1.2rem',
            }}
          >
            ←
          </div>

          {/* Stage 2: Agent Tool Execution Observation */}
          <div
            onClick={() => setInspectNodeId(activeObsStep?.stepId || null)}
            style={{
              backgroundColor: '#090d16',
              border: '1px solid #8b5cf6',
              borderRadius: '6px',
              padding: '12px',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '0.65rem', color: '#8b5cf6', fontWeight: 700 }}>
              STAGE 3: AGENT TOOL OBSERVATION
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '4px' }}>
              {activeToolStep?.toolName ? `Tool: ${activeToolStep.toolName}` : 'Retrieval Execution'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '6px' }}>
              {activeObsStep?.output || 'Direct chunk synthesis'}
            </div>
          </div>

          {/* Arrow */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              fontSize: '1.2rem',
            }}
          >
            ←
          </div>

          {/* Stage 3: Retrieved Chunk */}
          <div
            onClick={() => setInspectNodeId(activeChunk?.id || null)}
            style={{
              backgroundColor: '#090d16',
              border: activeChunk ? '1px solid #3b82f6' : '1px dashed #ef4444',
              borderRadius: '6px',
              padding: '12px',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '0.65rem', color: '#3b82f6', fontWeight: 700 }}>
              STAGE 2: RETRIEVED CHUNK
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '4px' }}>
              {activeChunk?.id || 'Missing chunk pointer'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '6px' }}>
              {activeChunk?.text ? `"${activeChunk.text.slice(0, 50)}..."` : 'Lineage broken'}
            </div>
          </div>

          {/* Arrow */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              fontSize: '1.2rem',
            }}
          >
            ←
          </div>

          {/* Stage 4: Ingested Source Document */}
          <div
            onClick={() => setInspectNodeId(activeDoc?.id || null)}
            style={{
              backgroundColor: '#090d16',
              border: activeDoc ? '1px solid #06b6d4' : '1px dashed #ef4444',
              borderRadius: '6px',
              padding: '12px',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '0.65rem', color: '#06b6d4', fontWeight: 700 }}>
              STAGE 1: SOURCE DOCUMENT
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '4px' }}>
              {activeDoc?.title || 'Missing parent document'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '6px' }}>
              URI: {activeDoc?.sourceUri || 'N/A'}
            </div>
          </div>
        </div>

        {/* Node Inspector Drawer */}
        {inspectNodeId && (
          <aside
            aria-label="Node Metadata Inspector Drawer"
            style={{
              backgroundColor: '#0f172a',
              padding: '12px 16px',
              borderRadius: '6px',
              border: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>INSPECTED LINEAGE NODE:</div>
              <code style={{ fontSize: '0.85rem', color: '#38bdf8' }}>{inspectNodeId}</code>
            </div>
            <button
              type="button"
              onClick={() => setInspectNodeId(null)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              ✕ Dismiss
            </button>
          </aside>
        )}
      </section>
    </main>
  );
}
