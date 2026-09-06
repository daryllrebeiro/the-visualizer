import type { LlmPipelineClusterState } from './llm-pipeline-types.js';

export class LlmPipelineInvariantChecker {
  public check(
    state: LlmPipelineClusterState,
  ): { invariantName: string; description: string } | undefined {
    // PIPE-1: Context Window Non-Overflow
    if (state.currentContextTokens > state.maxContextTokens) {
      return {
        invariantName: 'PIPE-1',
        description: `Context window overflow: current ${state.currentContextTokens} tokens exceed maximum budget of ${state.maxContextTokens} tokens.`,
      };
    }

    // PIPE-2: Acyclic Tool Execution Graph
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const checkCycle = (stepId: string): boolean => {
      visited.add(stepId);
      recursionStack.add(stepId);

      const step = state.agentSteps[stepId];
      if (step) {
        for (const dep of step.dependsOn) {
          if (!visited.has(dep) && checkCycle(dep)) {
            return true;
          } else if (recursionStack.has(dep)) {
            return true;
          }
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const stepId of Object.keys(state.agentSteps)) {
      if (!visited.has(stepId)) {
        if (checkCycle(stepId)) {
          return {
            invariantName: 'PIPE-2',
            description: `Acyclic Tool DAG violation: circular dependency detected involving step '${stepId}'.`,
          };
        }
      }
    }

    // PIPE-3: MCP Schema Validity on Tool Calls
    for (const step of Object.values(state.agentSteps)) {
      if (step.type === 'TOOL_CALL') {
        if (!step.toolName || typeof step.toolName !== 'string') {
          return {
            invariantName: 'PIPE-3',
            description: `Tool call schema violation: step '${step.stepId}' missing valid toolName.`,
          };
        }
        if (!step.toolArgs || typeof step.toolArgs !== 'object') {
          return {
            invariantName: 'PIPE-3',
            description: `Tool call schema violation: step '${step.stepId}' missing tool arguments payload.`,
          };
        }
      }
    }

    // PIPE-4: Monotonic Re-Ranking Filter
    for (const candidate of state.activeCandidates) {
      if (candidate.includedInPrompt && !state.chunks[candidate.chunkId]) {
        return {
          invariantName: 'PIPE-4',
          description: `Monotonic re-ranking violation: prompt included chunk '${candidate.chunkId}' which does not exist in indexed corpus.`,
        };
      }
    }

    // PIPE-8: Flagship Provenance Lineage Traceability
    for (const resp of Object.values(state.synthesizedResponses)) {
      for (const claim of resp.claims) {
        if (claim.isLineageSevered) {
          return {
            invariantName: 'PIPE-8',
            description: `Provenance lineage severed: claim '${claim.claimId}' has been flagged as ungrounded/severed from citation source.`,
          };
        }

        const chunk = state.chunks[claim.citationChunkId];
        if (!chunk) {
          return {
            invariantName: 'PIPE-8',
            description: `Provenance lineage severed: citation chunk '${claim.citationChunkId}' for claim '${claim.claimId}' does not exist in indexed chunk store.`,
          };
        }

        const doc = state.documents[chunk.docId];
        if (!doc) {
          return {
            invariantName: 'PIPE-8',
            description: `Provenance lineage severed: source document '${chunk.docId}' for chunk '${chunk.id}' does not exist in document store.`,
          };
        }

        // Trace edge path in lineage graph: claim -> chunk OR claim -> observation -> chunk
        const directEdge = state.lineageGraph.edges.some(
          (e) => e.source === claim.claimId && e.target === chunk.id,
        );
        const indirectEdge =
          claim.observationStepId &&
          state.lineageGraph.edges.some(
            (e) => e.source === claim.claimId && e.target === claim.observationStepId,
          ) &&
          state.lineageGraph.edges.some(
            (e) => e.source === claim.observationStepId && e.target === chunk.id,
          );

        if (!directEdge && !indirectEdge) {
          return {
            invariantName: 'PIPE-8',
            description: `Provenance lineage broken: no verifiable causal edge path exists between claim '${claim.claimId}' and chunk '${chunk.id}'.`,
          };
        }
      }
    }

    return undefined;
  }
}
