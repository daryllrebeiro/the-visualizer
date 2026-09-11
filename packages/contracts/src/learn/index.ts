import { z } from 'zod';

// ─── Shared primitives ───────────────────────────────────────────────────────

/** Domain ids are validated against the registry at the call site; the schema
 *  enforces shape only so persisted blobs can never break the UI. */
export const DomainIdSchema = z.string().min(1).max(64);

const IsoMsSchema = z.number().int().nonnegative().max(4102444800000);

// ─── Feature 1: Personal Progress Dashboard / Mastery Map ───────────────────

export const QuizAnswerRecordSchema = z.object({
  correct: z.boolean(),
  attempts: z.number().int().nonnegative().max(100000),
  lastAnsweredAt: IsoMsSchema,
});

export const DomainProgressSchema = z.object({
  domainId: DomainIdSchema,
  scenariosCompleted: z.array(z.string().min(1).max(128)).max(500),
  quizAnswered: z.record(z.string().min(1).max(128), QuizAnswerRecordSchema).default({}),
  invariantsTriggered: z.array(z.string().min(1).max(128)).max(500),
  timeSpentMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  lastVisitedAt: IsoMsSchema,
});

export const UserProgressSchema = z.object({
  version: z.literal(1),
  domains: z.record(z.string().min(1).max(64), DomainProgressSchema).default({}),
  updatedAt: IsoMsSchema,
});

export type DomainProgress = z.infer<typeof DomainProgressSchema>;
export type UserProgress = z.infer<typeof UserProgressSchema>;

export function createEmptyDomainProgress(domainId: string, nowMs: number): DomainProgress {
  return {
    domainId,
    scenariosCompleted: [],
    quizAnswered: {},
    invariantsTriggered: [],
    timeSpentMs: 0,
    lastVisitedAt: nowMs,
  };
}

// ─── Feature 2: Session-Level Version History ───────────────────────────────

export const SessionActionKindSchema = z.enum([
  'CONFIG_CHANGE',
  'CHAOS_INJECT',
  'SCENARIO_LOAD',
  'DOMAIN_SWITCH',
  'RESET',
  'BOOKMARK',
]);

export type SessionActionKind = z.infer<typeof SessionActionKindSchema>;

export const SessionTimelineEntrySchema = z.object({
  seq: z.number().int().nonnegative(),
  /** Wall-clock display timestamp only — never fed into simulation state. */
  timestamp: IsoMsSchema,
  domainId: DomainIdSchema,
  /** Tick index into that domain's own frame history. */
  frameRef: z.number().int().nonnegative().max(1000000),
  actionKind: SessionActionKindSchema,
  label: z.string().min(1).max(280),
});

export type SessionTimelineEntry = z.infer<typeof SessionTimelineEntrySchema>;

// ─── Feature 3: Time-Travel Bookmarking & Annotations ───────────────────────

export const BookmarkSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(140),
  domainId: DomainIdSchema,
  tick: z.number().int().nonnegative().max(1000000),
  configSnapshot: z.record(z.string().min(1).max(128), z.unknown()).default({}),
  note: z.string().max(2000).default(''),
  createdAt: IsoMsSchema,
});

export type Bookmark = z.infer<typeof BookmarkSchema>;

// ─── Feature 4: Shareable Scenario Permalinks ───────────────────────────────

const PermalinkEventSchema = z.object({
  tick: z.number().int().nonnegative().max(1000000),
  type: z.string().min(1).max(128),
  payload: z.record(z.string().min(1).max(128), z.unknown()).default({}),
});

export const PermalinkPayloadV2Schema = z.object({
  v: z.literal(2),
  domainId: DomainIdSchema,
  seed: z.number().int().nonnegative().max(4294967295),
  events: z.array(PermalinkEventSchema).max(500),
});

export type PermalinkPayloadV2 = z.infer<typeof PermalinkPayloadV2Schema>;

// ─── Feature 5: Quiz & Flashcard Mode ───────────────────────────────────────

export const QuizQuestionSchema = z.object({
  id: z.string().min(1).max(128),
  domainId: DomainIdSchema,
  invariantId: z.string().min(1).max(128).optional(),
  kind: z.enum(['multiple-choice', 'flashcard']),
  prompt: z.string().min(1).max(2000),
  choices: z.array(z.string().min(1).max(500)).min(2).max(6).optional(),
  answerIndex: z.number().int().nonnegative().max(5).optional(),
  answer: z.string().min(1).max(2000),
  explanation: z.string().min(1).max(3000),
  tags: z.array(z.string().min(1).max(64)).max(12).default([]),
});

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export const SpacedRepetitionCardSchema = z.object({
  questionId: z.string().min(1).max(128),
  /** Leitner box 0..4; next interval derived deterministically. */
  box: z.number().int().min(0).max(4),
  nextReviewAt: IsoMsSchema,
  lapses: z.number().int().nonnegative().max(100000),
  lastCorrect: z.boolean().optional(),
});

export type SpacedRepetitionCard = z.infer<typeof SpacedRepetitionCardSchema>;

// ─── Feature 6: Guided Interview Mode ───────────────────────────────────────

export const InterviewStepSchema = z.object({
  stepId: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  domainId: DomainIdSchema,
  instruction: z.string().min(1).max(2000),
  hint: z.string().max(2000).default(''),
  rubricItem: z.string().min(1).max(500),
});

export const InterviewScriptSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  question: z.string().min(1).max(2000),
  topicTags: z.array(z.string().min(1).max(64)).max(12).default([]),
  timeLimitMinutes: z.number().int().positive().max(180),
  steps: z.array(InterviewStepSchema).min(1).max(20),
});

export type InterviewScript = z.infer<typeof InterviewScriptSchema>;
export type InterviewStep = z.infer<typeof InterviewStepSchema>;

// ─── Feature 7: Certification / Skill Badge Paths ───────────────────────────

export const TrackRequirementSchema = z.object({
  kind: z.enum(['scenario', 'quiz-threshold', 'interview']),
  domainId: DomainIdSchema.optional(),
  refId: z.string().min(1).max(128),
  /** For quiz-threshold: minimum fraction correct, 0..1. */
  threshold: z.number().min(0).max(1).optional(),
});

export const CurriculumTrackSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  requirements: z.array(TrackRequirementSchema).min(1).max(40),
});

export type CurriculumTrack = z.infer<typeof CurriculumTrackSchema>;

/** Unsigned award payload; the server attaches an HMAC `sig` for the badge link. */
export const BadgeAwardSchema = z.object({
  trackId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  earnedAt: IsoMsSchema,
});

export type BadgeAward = z.infer<typeof BadgeAwardSchema>;

// ─── Feature 8: Diff/Compare Mode ───────────────────────────────────────────

export const CompareRunConfigSchema = z.object({
  domainId: DomainIdSchema,
  seedA: z.number().int().nonnegative().max(4294967295),
  seedB: z.number().int().nonnegative().max(4294967295),
  ticks: z.number().int().positive().max(5000),
});

export type CompareRunConfig = z.infer<typeof CompareRunConfigSchema>;

// ─── Feature 9: Composer ────────────────────────────────────────────────────

export const ComposedPipelineSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  nodeIds: z.array(DomainIdSchema).min(1).max(12),
  edges: z
    .array(
      z.object({
        from: DomainIdSchema,
        to: DomainIdSchema,
        label: z.string().min(1).max(200),
      }),
    )
    .max(24),
});

export type ComposedPipeline = z.infer<typeof ComposedPipelineSchema>;

// ─── Feature 10: Challenge Mode ─────────────────────────────────────────────

export const ChallengeSchema = z.object({
  id: z.string().min(1).max(128),
  domainId: DomainIdSchema,
  title: z.string().min(1).max(200),
  invariantId: z.string().min(1).max(128),
  brief: z.string().min(1).max(2000),
  chaosScenarioId: z.string().min(1).max(128).optional(),
  hints: z.array(z.string().min(1).max(1000)).max(5).default([]),
  explanation: z.string().min(1).max(4000),
  mitigation: z.string().min(1).max(2000),
});

export type Challenge = z.infer<typeof ChallengeSchema>;

export const ChallengeAttemptSchema = z.object({
  challengeId: z.string().min(1).max(128),
  solved: z.boolean(),
  hintsUsed: z.number().int().nonnegative().max(5),
  elapsedMs: z.number().int().nonnegative().max(86400000),
  solvedAt: IsoMsSchema.optional(),
});

export type ChallengeAttempt = z.infer<typeof ChallengeAttemptSchema>;
