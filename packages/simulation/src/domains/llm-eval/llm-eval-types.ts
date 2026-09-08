/**
 * LLM Evaluation & Guardrails Pipeline — simulation types.
 *
 * Structured OFFLINE evaluation: fixed eval suite scored against
 * deterministic scripted model profiles, red-team regression detection,
 * versioned guardrail policy re-scoring, and a deployment gate output
 * consumed by /model-rollout (Domain 24).
 *
 * The "model under test" is a deterministic scripted responder —
 * parameterized by (modelVersion, prompt) with configurable violation
 * rates per risk area. No real inference, ever: regressions are
 * constructible and golden-reproducible by design.
 *
 * References:
 * - Liang et al. (2022): HELM (arXiv:2211.09110)
 * - Perez et al. (2022): Red Teaming Language Models with Language
 *   Models (arXiv:2202.05285)
 * - OpenAI Evals framework — eval-case structure
 * - NeMo Guardrails — the ONLINE complement this offline gate feeds
 */

export type EvalRiskArea = 'SAFETY' | 'PRIVACY' | 'HALLUCINATION' | 'BIAS';
export type EvalSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface EvalTestCase {
  id: string;
  prompt: string;
  expectedBehavior: string;
  riskArea: EvalRiskArea;
  severity: EvalSeverity;
}

export interface RedTeamAttempt {
  id: string;
  adversarialPrompt: string;
  riskArea: EvalRiskArea;
  severity: EvalSeverity;
}

export interface ModelProfile {
  /** model version identifier */
  id: string;
  /** scripted violation probability per risk area (deterministic hash) */
  violationRateByRisk: Partial<Record<EvalRiskArea, number>>;
  /** per-case scripted overrides (constructible regressions) */
  caseOverrides: Record<string, boolean>;
  /** per-attempt scripted overrides for red-team elicitation */
  redTeamOverrides: Record<string, boolean>;
}

export interface GuardrailPolicy {
  version: number;
  /** violations at severity >= threshold fail the case */
  severityThreshold: EvalSeverity;
  rules: string[];
}

export interface EvalCaseResult {
  caseId: string;
  /** scripted response violated the policy */
  violation: boolean;
  /** the policy verdict under the run's pinned policy version */
  passed: boolean;
}

export interface RedTeamResult {
  attemptId: string;
  /** the adversarial prompt elicited a policy violation */
  elicited: boolean;
}

export interface EvalRun {
  id: string;
  modelVersion: string;
  policyVersion: number;
  caseResults: Record<string, EvalCaseResult>;
  redTeamResults: Record<string, RedTeamResult>;
  /** EVAL-1: complete iff every suite case was scored */
  completed: boolean;
  /** EVAL-2: attempts that regressed vs the baseline run */
  regressions: Array<{ attemptId: string; note: string }>;
  /** baseline run this run was compared against (null = first run) */
  baselineRunId: string | null;
  /** EVAL-4: critical-failure gate verdict */
  criticalFailures: string[];
  gateBlocked: boolean;
}

export interface RescoreRecord {
  runId: string;
  policyVersion: number;
  caseResults: Record<string, EvalCaseResult>;
  passed: boolean;
}

export interface GateOutput {
  modelVersion: string;
  sourceRunId: string;
  policyVersion: number;
  criticalPassed: boolean;
  blocked: boolean;
}

export interface LlmEvalClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  evalSuite: EvalTestCase[];
  redTeamAttempts: RedTeamAttempt[];
  modelProfiles: Record<string, ModelProfile>;
  modelOrder: string[];
  policies: Record<number, GuardrailPolicy>;
  latestPolicyVersion: number;
  /** the stable reference version whose latest run is the regression baseline */
  baselineModelVersion: string;
  evalRuns: Record<string, EvalRun>;
  evalRunOrder: string[];
  /** EVAL-3: (runId, policyVersion) -> distinct re-score records */
  rescoreRecords: Record<string, RescoreRecord>;
  /** EVAL-4: deployment gate outputs per model version */
  gateOutputs: Record<string, GateOutput>;
  stats: {
    runsExecuted: number;
    rescoresExecuted: number;
    regressionsDetected: number;
    gatesBlocked: number;
  };
}

export type LlmEvalSimEvent =
  | { id: string; tick: number; type: 'EVAL_TICK'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: 'EVAL_RUN'; payload: { modelVersion: string; policyVersion?: number; partial?: boolean } }
  | { id: string; tick: number; type: 'EVAL_RESCORE'; payload: { runId: string; policyVersion: number } }
  | { id: string; tick: number; type: 'EVAL_DECLARE_POLICY'; payload: { severityThreshold: EvalSeverity; rules?: string[] } }
  | {
      id: string;
      tick: number;
      type: 'EVAL_DECLARE_MODEL';
      payload: {
        modelVersion: string;
        violationRateByRisk?: Partial<Record<EvalRiskArea, number>>;
        caseOverrides?: Record<string, boolean>;
        redTeamOverrides?: Record<string, boolean>;
      };
    }
  | { id: string; tick: number; type: 'EVAL_GATE'; payload: { modelVersion: string } };

/** Resource caps (hard-clamped; surfaced in UI when hit). */
export const EVAL_CAPS = {
  maxSuiteCases: 200,
  maxModelVersions: 6,
  maxRedTeamAttempts: 50,
  maxPolicies: 10,
  maxRescoreRecords: 50,
} as const;
