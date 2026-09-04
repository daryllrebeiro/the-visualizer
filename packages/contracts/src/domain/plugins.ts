import { z } from 'zod';

export const FidelityTagSchema = z.enum([
  'CONCEPTUAL',
  'BEHAVIORAL',
  'ORACLE_TESTED',
  'PROTOCOL_COMPATIBLE',
  'VERSION_COMPATIBLE',
]);
export type FidelityTag = z.infer<typeof FidelityTagSchema>;

export const DomainPluginMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  category: z.enum(['STREAMING', 'CONSENSUS', 'DATABASE', 'CACHE', 'ORCHESTRATION', 'NETWORKING']),
  description: z.string().max(1000),
  fidelityTag: FidelityTagSchema,
  fidelityDisplayName: z.string().optional(),
  oracleSystemName: z.string().optional(), // e.g. "apache/kafka:4.3", "etcd-io/raft", "cassandra:4.1", "redis:7.2", "kind/k8s:v1.30"
  icon: z.string().default('⚡'),
  color: z.string().default('#6366f1'),
});
export type DomainPluginMetadata = z.infer<typeof DomainPluginMetadataSchema>;

export interface OracleScenarioAssertion {
  actionName: string;
  expectedStateMatch: boolean;
  actualOracleOutput?: string | undefined;
  simulationOutput?: string | undefined;
}

export interface OracleAdapter<TInput = unknown, TOutput = unknown> {
  domainId: string;
  oracleName: string;
  isAvailable: () => Promise<boolean>;
  executeScenario: (scenarioId: string, input: TInput) => Promise<TOutput>;
  compareOutputs: (simResult: TOutput, oracleResult: TOutput) => OracleScenarioAssertion[];
}

export interface DomainPlugin<TState = unknown, TEvent = unknown> {
  metadata: DomainPluginMetadata;
  createDefaultState: () => TState;
  reduceState: (
    state: TState,
    event: TEvent,
    rngSeed?: number,
  ) => { nextState: TState; emittedEvents: TEvent[] };
  validateInvariants: (state: TState) => {
    passed: boolean;
    violation?: { name: string; description: string };
  };
  oracleAdapter?: OracleAdapter | undefined;
}
