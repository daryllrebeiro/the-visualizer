import { z } from 'zod';

export const ChallengeCheckSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  severity: z.enum(['ERROR', 'WARNING', 'INFO']).default('ERROR'),
});

export const ChallengeDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(160),
  description: z.string().max(4000).default(''),
  systemId: z.string().regex(/^[a-z0-9-]+$/),
  scenarioIds: z.array(z.string().min(1).max(64)).max(32).default([]),
  constraints: z.record(z.string(), z.unknown()).default({}),
  checks: z.array(ChallengeCheckSchema).max(32).default([]),
});

export type ChallengeDefinition = z.infer<typeof ChallengeDefinitionSchema>;
