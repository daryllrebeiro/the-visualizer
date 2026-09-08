import { policyVerdict, scriptedViolates } from './llm-eval-state-transitions.js';
import type { LlmEvalClusterState } from './llm-eval-types.js';

export interface LlmEvalInvariantViolation {
  ruleId: 'EVAL-1' | 'EVAL-2' | 'EVAL-3' | 'EVAL-4';
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

/**
 * State-level checks for the llm-eval domain.
 *
 * EVAL-1: a run marked complete has a result for every suite case (and
 * every risk area); a partial run is never marked complete.
 * EVAL-2: each recorded regression is a genuine flip (no elicitation on
 * the baseline run, elicitation on this run).
 * EVAL-3: rescore records are keyed (run, policyVersion) and their
 * verdicts recompute exactly from the run's recorded violations; the
 * source run's own results still recompute under its pinned policy.
 * EVAL-4: gate outputs carry blocked === (critical failures > 0) for
 * the version's latest completed run.
 */
export class LlmEvalInvariantChecker {
  public check(state: LlmEvalClusterState): LlmEvalInvariantViolation | undefined {
    // EVAL-1: full suite coverage.
    for (const run of Object.values(state.evalRuns)) {
      const resultCount = Object.keys(run.caseResults).length;
      if (run.completed && resultCount !== state.evalSuite.length) {
        return {
          ruleId: 'EVAL-1',
          invariantName: 'Full Suite Coverage',
          description: `Run ${run.id} is marked complete with ${resultCount}/${state.evalSuite.length} cases scored — a partial run reported as complete`,
          affectedEntities: [run.id],
        };
      }
      if (!run.completed && resultCount === state.evalSuite.length) {
        return {
          ruleId: 'EVAL-1',
          invariantName: 'Full Suite Coverage',
          description: `Run ${run.id} scored the full suite but is not marked complete — status drift`,
          affectedEntities: [run.id],
        };
      }
      // No risk area silently skipped in a complete run.
      if (run.completed) {
        const riskAreas = new Set(state.evalSuite.map((c) => c.riskArea));
        for (const area of riskAreas) {
          const areaCases = state.evalSuite.filter((c) => c.riskArea === area);
          const scored = areaCases.filter((c) => run.caseResults[c.id] !== undefined);
          if (scored.length !== areaCases.length) {
            return {
              ruleId: 'EVAL-1',
              invariantName: 'Full Suite Coverage',
              description: `Run ${run.id} skipped the ${area} risk area (${scored.length}/${areaCases.length} cases scored)`,
              affectedEntities: [run.id, area],
            };
          }
        }
      }
    }

    // EVAL-2: regression detection.
    for (const run of Object.values(state.evalRuns)) {
      for (const regression of run.regressions) {
        const baseline = run.baselineRunId ? state.evalRuns[run.baselineRunId] : null;
        const before = baseline?.redTeamResults[regression.attemptId]?.elicited;
        const after = run.redTeamResults[regression.attemptId]?.elicited;
        if (before !== false || after !== true) {
          return {
            ruleId: 'EVAL-2',
            invariantName: 'Red-Team Regression Detection',
            description: `Run ${run.id} flags ${regression.attemptId} as a regression, but baseline elicited=${before} and current elicited=${after} — not a genuine flip`,
            affectedEntities: [run.id, regression.attemptId],
          };
        }
      }
      // Reverse: genuine flips MUST be flagged (nothing silently absorbed).
      if (run.baselineRunId) {
        const baseline = state.evalRuns[run.baselineRunId];
        if (baseline) {
          for (const attempt of state.redTeamAttempts) {
            const before = baseline.redTeamResults[attempt.id]?.elicited;
            const after = run.redTeamResults[attempt.id]?.elicited;
            const flagged = run.regressions.some((r) => r.attemptId === attempt.id);
            if (before === false && after === true && !flagged) {
              return {
                ruleId: 'EVAL-2',
                invariantName: 'Red-Team Regression Detection',
                description: `Run ${run.id}: attempt ${attempt.id} newly elicits a violation but is NOT flagged — the regression was silently absorbed into the aggregate pass rate`,
                affectedEntities: [run.id, attempt.id],
              };
            }
          }
        }
      }
    }

    // EVAL-3: policy version pinning and rescore recomputation.
    for (const run of Object.values(state.evalRuns)) {
      const policy = state.policies[run.policyVersion];
      if (!policy) {
        return {
          ruleId: 'EVAL-3',
          invariantName: 'Guardrail Policy Version Pinning',
          description: `Run ${run.id} is pinned to policy v${run.policyVersion} which no longer exists`,
          affectedEntities: [run.id],
        };
      }
      for (const [caseId, result] of Object.entries(run.caseResults)) {
        const testCase = state.evalSuite.find((c) => c.id === caseId);
        if (!testCase) continue;
        const expectedPass = policyVerdict(result.violation, testCase.severity, policy);
        if (expectedPass !== result.passed) {
          return {
            ruleId: 'EVAL-3',
            invariantName: 'Guardrail Policy Version Pinning',
            description: `Run ${run.id} case ${caseId} pass=${result.passed} but recomputes to ${expectedPass} under its pinned policy v${run.policyVersion}`,
            affectedEntities: [run.id, caseId],
          };
        }
      }
    }
    for (const [key, record] of Object.entries(state.rescoreRecords)) {
      const run = state.evalRuns[record.runId];
      const policy = state.policies[record.policyVersion];
      if (!run || !policy) {
        return {
          ruleId: 'EVAL-3',
          invariantName: 'Guardrail Policy Version Pinning',
          description: `Rescore record ${key} references a missing run or policy`,
          affectedEntities: [key],
        };
      }
      // Same violations, new verdicts — the original must be untouched.
      for (const [caseId, result] of Object.entries(record.caseResults)) {
        const original = run.caseResults[caseId];
        const testCase = state.evalSuite.find((c) => c.id === caseId);
        if (!original || !testCase) continue;
        if (original.violation !== result.violation) {
          return {
            ruleId: 'EVAL-3',
            invariantName: 'Guardrail Policy Version Pinning',
            description: `Rescore record ${key} altered case ${caseId}'s recorded violation (${original.violation} -> ${result.violation}) — rescores re-judge, they never rewrite history`,
            affectedEntities: [key, caseId],
          };
        }
        const expectedPass = policyVerdict(result.violation, testCase.severity, policy);
        if (expectedPass !== result.passed) {
          return {
            ruleId: 'EVAL-3',
            invariantName: 'Guardrail Policy Version Pinning',
            description: `Rescore record ${key} case ${caseId} pass=${result.passed} but recomputes to ${expectedPass} under policy v${record.policyVersion}`,
            affectedEntities: [key, caseId],
          };
        }
      }
    }

    // EVAL-4: deployment gate enforcement.
    for (const gate of Object.values(state.gateOutputs)) {
      const run = state.evalRuns[gate.sourceRunId];
      if (!run) {
        return {
          ruleId: 'EVAL-4',
          invariantName: 'Deployment Gate Enforcement',
          description: `Gate for ${gate.modelVersion} references missing run ${gate.sourceRunId}`,
          affectedEntities: [gate.modelVersion],
        };
      }
      const criticalViolations = state.evalSuite.filter(
        (c) => c.severity === 'CRITICAL' && run.caseResults[c.id]?.violation === true,
      );
      const shouldBlock = criticalViolations.length > 0;
      if (gate.blocked !== shouldBlock) {
        return {
          ruleId: 'EVAL-4',
          invariantName: 'Deployment Gate Enforcement',
          description: `Gate for ${gate.modelVersion} has blocked=${gate.blocked} but the source run has ${criticalViolations.length} critical violations`,
          affectedEntities: [gate.modelVersion, gate.sourceRunId],
        };
      }
      if (gate.policyVersion !== run.policyVersion) {
        return {
          ruleId: 'EVAL-4',
          invariantName: 'Deployment Gate Enforcement',
          description: `Gate for ${gate.modelVersion} cites policy v${gate.policyVersion} but the source run was scored under v${run.policyVersion}`,
          affectedEntities: [gate.modelVersion],
        };
      }
    }

    return undefined;
  }
}

export { scriptedViolates };
