import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type {
  AgentDagStep,
  CandidateChunk,
  LineageEdge,
  LineageNode,
  LlmPipelineClusterState,
  LlmPipelineSimEvent,
  PipelineChunk,
  PipelineDocument,
  SynthesizedResponse,
} from './llm-pipeline-types.js';

export function createDefaultLlmPipelineCluster(
  clusterId = 'llm-pipeline-1',
): LlmPipelineClusterState {
  const doc1: PipelineDocument = {
    id: 'doc-consensus',
    title: 'Distributed Consensus & Raft Architecture',
    content:
      'Raft provides strong consistency through a leader election term mechanism and replicated write-ahead state machine logs.',
    sourceUri: 'https://raft.github.io/raft.pdf',
    ingestedTick: 0,
    byteSize: 2048,
  };

  const chunk1: PipelineChunk = {
    id: 'chunk-consensus-1',
    docId: 'doc-consensus',
    chunkIndex: 0,
    text: 'Raft provides strong consistency through leader election terms and replicated write-ahead logs.',
    tokenCount: 16,
    embedding: [0.55, 0.25, -0.4, 0.68],
    sparseTerms: { raft: 1, consistency: 1, leader: 1, election: 1, logs: 1 },
  };

  const nodes: Record<string, LineageNode> = {
    [doc1.id]: { id: doc1.id, type: 'DOC', label: doc1.title },
    [chunk1.id]: { id: chunk1.id, type: 'CHUNK', label: 'Raft Core Terms' },
    'step-plan-1': { id: 'step-plan-1', type: 'PLAN', label: 'Decompose Consensus Query' },
    'step-tool-1': { id: 'step-tool-1', type: 'TOOL_CALL', label: 'Execute Vector Search' },
    'step-obs-1': { id: 'step-obs-1', type: 'OBSERVATION', label: 'Retrieved Raft Docs' },
    'resp-init': { id: 'resp-init', type: 'OUTPUT', label: 'Synthesized Consensus Analysis' },
    'claim-init-1': { id: 'claim-init-1', type: 'CLAIM', label: 'Raft uses terms for leader safety' },
  };

  const edges: LineageEdge[] = [
    { source: chunk1.id, target: doc1.id, relation: 'DERIVED_FROM' },
    { source: 'step-tool-1', target: 'step-plan-1', relation: 'USED' },
    { source: 'step-obs-1', target: 'step-tool-1', relation: 'GENERATED_BY' },
    { source: 'step-obs-1', target: chunk1.id, relation: 'USED' },
    { source: 'resp-init', target: 'step-obs-1', relation: 'DERIVED_FROM' },
    { source: 'claim-init-1', target: 'step-obs-1', relation: 'DERIVED_FROM' },
    { source: 'claim-init-1', target: chunk1.id, relation: 'DERIVED_FROM' },
  ];

  const agentSteps: Record<string, AgentDagStep> = {
    'step-plan-1': {
      stepId: 'step-plan-1',
      taskId: 'task-consensus-01',
      type: 'PLAN',
      output: 'Plan: search corpus for Raft consensus invariants and synthesize response.',
      dependsOn: [],
      status: 'COMPLETED',
      executedTick: 0,
    },
    'step-tool-1': {
      stepId: 'step-tool-1',
      taskId: 'task-consensus-01',
      type: 'TOOL_CALL',
      toolName: 'hybrid_retriever',
      toolArgs: { query: 'Raft leader election terms', topK: 3 },
      dependsOn: ['step-plan-1'],
      status: 'COMPLETED',
      executedTick: 0,
    },
    'step-obs-1': {
      stepId: 'step-obs-1',
      taskId: 'task-consensus-01',
      type: 'OBSERVATION',
      output: 'Observation: 1 relevant chunk retrieved with cosine similarity 0.92.',
      dependsOn: ['step-tool-1'],
      status: 'COMPLETED',
      executedTick: 0,
    },
  };

  const initialResponse: SynthesizedResponse = {
    id: 'resp-init',
    queryId: 'q-init-1',
    queryText: 'How does Raft ensure leader safety?',
    answerText: 'Raft enforces leader safety using monotonic term counters and strict quorum voting.',
    claims: [
      {
        claimId: 'claim-init-1',
        text: 'Raft uses terms for leader safety',
        citationChunkId: 'chunk-consensus-1',
        observationStepId: 'step-obs-1',
        isLineageSevered: false,
      },
    ],
    tokenCount: 42,
    synthesizedTick: 0,
  };

  return {
    clusterId,
    tick: 0,
    maxContextTokens: 4096,
    currentContextTokens: 120,
    documents: { [doc1.id]: doc1 },
    chunks: { [chunk1.id]: chunk1 },
    activeCandidates: [
      {
        chunkId: chunk1.id,
        denseScore: 0.92,
        sparseScore: 4.8,
        rrfScore: 0.032,
        rerankScore: 0.95,
        includedInPrompt: true,
      },
    ],
    agentSteps,
    synthesizedResponses: { [initialResponse.id]: initialResponse },
    lineageGraph: { nodes, edges },
    metrics: {
      totalDocumentsIngested: 1,
      totalChunksIndexed: 1,
      totalToolInvocations: 1,
      totalLineageWalkbacks: 1,
      provenanceIntegrityPct: 100,
    },
    chaos: {
      lineageSeveredCount: 0,
      toolFailuresInjected: 0,
    },
  };
}

export function pureLlmPipelineTransition(
  state: LlmPipelineClusterState,
  event: LlmPipelineSimEvent,
  rng: DeterministicRNG,
): { nextState: LlmPipelineClusterState; emittedEvents: LlmPipelineSimEvent[] } {
  const nextState: LlmPipelineClusterState = JSON.parse(JSON.stringify(state)) as LlmPipelineClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'PIPE_INGEST_DOC': {
      const { docId, title, content, sourceUri } = event.payload;
      const doc: PipelineDocument = {
        id: docId,
        title,
        content,
        sourceUri: sourceUri || `https://the-visualizer.internal/docs/${docId}`,
        ingestedTick: event.tick,
        byteSize: content.length,
      };
      nextState.documents[docId] = doc;
      nextState.lineageGraph.nodes[docId] = { id: docId, type: 'DOC', label: title };

      // Deterministically split into 2 chunks
      const half = Math.floor(content.length / 2);
      const parts = [content.slice(0, half), content.slice(half)];

      for (let i = 0; i < parts.length; i++) {
        const textPart = parts[i] || '';
        const chunkId = `chunk-${docId}-${i + 1}`;
        const embedding = [
          Number((rng.nextFloat() * 2 - 1).toFixed(4)),
          Number((rng.nextFloat() * 2 - 1).toFixed(4)),
          Number((rng.nextFloat() * 2 - 1).toFixed(4)),
          Number((rng.nextFloat() * 2 - 1).toFixed(4)),
        ];

        const words = textPart.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
        const sparseTerms: Record<string, number> = {};
        for (const w of words) {
          sparseTerms[w] = (sparseTerms[w] || 0) + 1;
        }

        const chunk: PipelineChunk = {
          id: chunkId,
          docId,
          chunkIndex: i,
          text: textPart,
          tokenCount: Math.max(1, Math.round(textPart.length / 4)),
          embedding,
          sparseTerms,
        };

        nextState.chunks[chunkId] = chunk;
        nextState.lineageGraph.nodes[chunkId] = {
          id: chunkId,
          type: 'CHUNK',
          label: `${title.slice(0, 20)}... Part ${i + 1}`,
        };
        nextState.lineageGraph.edges.push({
          source: chunkId,
          target: docId,
          relation: 'DERIVED_FROM',
        });
      }

      nextState.metrics.totalDocumentsIngested = Object.keys(nextState.documents).length;
      nextState.metrics.totalChunksIndexed = Object.keys(nextState.chunks).length;
      break;
    }

    case 'PIPE_EXECUTE_HYBRID_SEARCH': {
      const { topK = 5, topN = 3 } = event.payload;
      const chunks = Object.values(nextState.chunks);
      const candidates: CandidateChunk[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (!ch) continue;
        // Deterministic scores via RNG
        const dense = Number((0.6 + rng.nextFloat() * 0.38).toFixed(4));
        const sparse = Number((1.5 + rng.nextFloat() * 4.0).toFixed(2));
        // RRF combiner with k = 60
        const rrf = Number((1 / (60 + (i + 1)) + 1 / (60 + (i + 1) * 2)).toFixed(5));
        const rerank = Number((dense * 0.7 + (sparse / 6) * 0.3).toFixed(4));

        candidates.push({
          chunkId: ch.id,
          denseScore: dense,
          sparseScore: sparse,
          rrfScore: rrf,
          rerankScore: rerank,
          includedInPrompt: false,
        });
      }

      candidates.sort((a, b) => b.rerankScore - a.rerankScore);
      const topSelected = candidates.slice(0, Math.min(candidates.length, topK));
      for (let i = 0; i < Math.min(topSelected.length, topN); i++) {
        const selected = topSelected[i];
        if (selected) selected.includedInPrompt = true;
      }

      nextState.activeCandidates = topSelected;
      break;
    }

    case 'PIPE_DISPATCH_AGENT_STEP': {
      const { stepId, taskId, type, toolName, toolArgs, output, dependsOn = [] } = event.payload;
      const step: AgentDagStep = {
        stepId,
        taskId,
        type,
        toolName,
        toolArgs,
        output: output || `Executed step ${type} successfully at tick ${event.tick}`,
        dependsOn,
        status: 'COMPLETED',
        executedTick: event.tick,
      };

      nextState.agentSteps[stepId] = step;
      nextState.lineageGraph.nodes[stepId] = {
        id: stepId,
        type: type === 'OBSERVATION' ? 'OBSERVATION' : type === 'TOOL_CALL' ? 'TOOL_CALL' : 'PLAN',
        label: toolName ? `Tool: ${toolName}` : `Step: ${type}`,
      };

      for (const dep of dependsOn) {
        nextState.lineageGraph.edges.push({
          source: stepId,
          target: dep,
          relation: 'USED',
        });
      }

      if (type === 'TOOL_CALL') {
        nextState.metrics.totalToolInvocations++;
      }
      break;
    }

    case 'PIPE_SYNTHESIZE_RESPONSE': {
      const { queryId, answerText, claims } = event.payload;
      const respId = `resp-${queryId}-${event.tick}`;
      const tokenCount = Math.max(10, Math.round(answerText.length / 4));

      const resp: SynthesizedResponse = {
        id: respId,
        queryId,
        queryText: `Query ${queryId}`,
        answerText,
        claims: claims.map((c) => ({ ...c, isLineageSevered: false })),
        tokenCount,
        synthesizedTick: event.tick,
      };

      nextState.synthesizedResponses[respId] = resp;
      nextState.lineageGraph.nodes[respId] = {
        id: respId,
        type: 'OUTPUT',
        label: `Answer (${tokenCount} tok)`,
      };

      for (const claim of resp.claims) {
        nextState.lineageGraph.nodes[claim.claimId] = {
          id: claim.claimId,
          type: 'CLAIM',
          label: claim.text.slice(0, 30),
        };
        nextState.lineageGraph.edges.push({
          source: respId,
          target: claim.claimId,
          relation: 'DERIVED_FROM',
        });

        if (claim.citationChunkId) {
          nextState.lineageGraph.edges.push({
            source: claim.claimId,
            target: claim.citationChunkId,
            relation: 'DERIVED_FROM',
          });
        }
        if (claim.observationStepId) {
          nextState.lineageGraph.edges.push({
            source: claim.claimId,
            target: claim.observationStepId,
            relation: 'DERIVED_FROM',
          });
        }
      }

      nextState.currentContextTokens = Math.min(
        nextState.maxContextTokens,
        nextState.currentContextTokens + tokenCount,
      );
      break;
    }

    case 'PIPE_SEVER_LINEAGE': {
      const { responseId, claimId } = event.payload;
      const resp = nextState.synthesizedResponses[responseId];
      if (resp) {
        const claim = resp.claims.find((c) => c.claimId === claimId);
        if (claim) {
          claim.isLineageSevered = true;
          // Sever edge in lineage graph
          nextState.lineageGraph.edges = nextState.lineageGraph.edges.filter(
            (e) => !(e.source === claimId && e.target === claim.citationChunkId),
          );
        }
      }
      nextState.chaos.lineageSeveredCount++;
      break;
    }

    case 'PIPE_INJECT_TOOL_FAILURE': {
      const { stepId, reason } = event.payload;
      const step = nextState.agentSteps[stepId];
      if (step) {
        step.status = 'FAILED';
        step.output = `FATAL TOOL FAILURE: ${reason}`;
      }
      nextState.chaos.toolFailuresInjected++;
      break;
    }

    case 'TICK' as any:
    case 'PIPE_TICK': {
      // Background metric oscillations
      const latencyJitter = Math.floor(rng.nextFloat() * 15);
      nextState.currentContextTokens = Math.max(0, nextState.currentContextTokens + (latencyJitter % 3 === 0 ? 1 : 0));

      // Recompute provenance integrity percentage
      let totalClaims = 0;
      let validClaims = 0;
      for (const resp of Object.values(nextState.synthesizedResponses)) {
        for (const claim of resp.claims) {
          totalClaims++;
          const chunk = nextState.chunks[claim.citationChunkId];
          const hasDoc = chunk && nextState.documents[chunk.docId];
          if (!claim.isLineageSevered && hasDoc) {
            validClaims++;
          }
        }
      }
      nextState.metrics.provenanceIntegrityPct =
        totalClaims > 0 ? Math.round((validClaims / totalClaims) * 100) : 100;
      break;
    }
  }

  return { nextState, emittedEvents: [] };
}
