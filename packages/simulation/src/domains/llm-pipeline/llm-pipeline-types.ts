/**
 * LLM Pipeline & Lineage Simulation Types & State Model
 *
 * Consolidates ETL document ingestion, dense/sparse hybrid retrieval (RRF),
 * agentic tool execution DAG, and end-to-end W3C PROV / OpenLineage provenance tracking.
 */

export interface PipelineDocument {
  id: string;
  title: string;
  content: string;
  sourceUri: string;
  ingestedTick: number;
  byteSize: number;
}

export interface PipelineChunk {
  id: string;
  docId: string;
  chunkIndex: number;
  text: string;
  tokenCount: number;
  embedding: number[];
  sparseTerms: Record<string, number>;
}

export interface CandidateChunk {
  chunkId: string;
  denseScore: number;
  sparseScore: number;
  rrfScore: number;
  rerankScore: number;
  includedInPrompt: boolean;
}

export interface AgentDagStep {
  stepId: string;
  taskId: string;
  type: 'PLAN' | 'TOOL_CALL' | 'OBSERVATION' | 'SYNTHESIS';
  toolName?: string | undefined;
  toolArgs?: Record<string, unknown> | undefined;
  output?: string | undefined;
  dependsOn: string[];
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  executedTick: number;
}

export interface LineageNode {
  id: string;
  type: 'DOC' | 'CHUNK' | 'TOOL_CALL' | 'OBSERVATION' | 'CLAIM' | 'OUTPUT' | 'PLAN';
  label: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface LineageEdge {
  source: string;
  target: string;
  relation: 'DERIVED_FROM' | 'GENERATED_BY' | 'USED';
}

export interface ResponseClaim {
  claimId: string;
  text: string;
  citationChunkId: string;
  observationStepId?: string;
  isLineageSevered?: boolean;
}

export interface SynthesizedResponse {
  id: string;
  queryId: string;
  queryText: string;
  answerText: string;
  claims: ResponseClaim[];
  tokenCount: number;
  synthesizedTick: number;
}

export interface LlmPipelineClusterState {
  clusterId: string;
  tick: number;
  maxContextTokens: number;
  currentContextTokens: number;
  documents: Record<string, PipelineDocument>;
  chunks: Record<string, PipelineChunk>;
  activeCandidates: CandidateChunk[];
  agentSteps: Record<string, AgentDagStep>;
  synthesizedResponses: Record<string, SynthesizedResponse>;
  lineageGraph: {
    nodes: Record<string, LineageNode>;
    edges: LineageEdge[];
  };
  metrics: {
    totalDocumentsIngested: number;
    totalChunksIndexed: number;
    totalToolInvocations: number;
    totalLineageWalkbacks: number;
    provenanceIntegrityPct: number;
  };
  chaos: {
    lineageSeveredCount: number;
    toolFailuresInjected: number;
  };
}

export type LlmPipelineSimEvent =
  | {
      id: string;
      tick: number;
      type: 'PIPE_INGEST_DOC';
      payload: { docId: string; title: string; content: string; sourceUri?: string };
    }
  | {
      id: string;
      tick: number;
      type: 'PIPE_EXECUTE_HYBRID_SEARCH';
      payload: { queryId: string; queryText: string; topK?: number; topN?: number };
    }
  | {
      id: string;
      tick: number;
      type: 'PIPE_DISPATCH_AGENT_STEP';
      payload: {
        stepId: string;
        taskId: string;
        type: 'PLAN' | 'TOOL_CALL' | 'OBSERVATION' | 'SYNTHESIS';
        toolName?: string;
        toolArgs?: Record<string, unknown>;
        output?: string;
        dependsOn?: string[];
      };
    }
  | {
      id: string;
      tick: number;
      type: 'PIPE_SYNTHESIZE_RESPONSE';
      payload: { queryId: string; answerText: string; claims: ResponseClaim[] };
    }
  | {
      id: string;
      tick: number;
      type: 'PIPE_SEVER_LINEAGE';
      payload: { responseId: string; claimId: string };
    }
  | {
      id: string;
      tick: number;
      type: 'PIPE_INJECT_TOOL_FAILURE';
      payload: { stepId: string; reason: string };
    }
  | {
      id: string;
      tick: number;
      type: 'PIPE_TICK';
      payload?: Record<string, unknown>;
    };
