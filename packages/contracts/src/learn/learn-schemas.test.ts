import { describe, expect, it } from 'vitest';

import {
  BadgeAwardSchema,
  BookmarkSchema,
  ChallengeAttemptSchema,
  ChallengeSchema,
  CompareRunConfigSchema,
  ComposedPipelineSchema,
  CurriculumTrackSchema,
  InterviewScriptSchema,
  PermalinkPayloadV2Schema,
  QuizQuestionSchema,
  SessionTimelineEntrySchema,
  SpacedRepetitionCardSchema,
  UserProgressSchema,
} from './index.js';

const GARBAGE: unknown[] = [
  null,
  undefined,
  42,
  'string',
  [],
  { __proto__: { polluted: true } },
  { ['a'.repeat(5000)]: 'x'.repeat(100000) },
  { v: 2, domainId: '', seed: -1, events: 'nope' },
  { v: 2, domainId: 'kafka', seed: 1, events: [{ tick: -5, type: '', payload: 42 }] },
  { version: 999, domains: null, updatedAt: 'yesterday' },
];

describe('learn schema fuzz', () => {
  it('rejects garbage for every persisted shape', () => {
    const schemas = [
      UserProgressSchema,
      SessionTimelineEntrySchema,
      BookmarkSchema,
      PermalinkPayloadV2Schema,
      QuizQuestionSchema,
      SpacedRepetitionCardSchema,
      InterviewScriptSchema,
      CurriculumTrackSchema,
      BadgeAwardSchema,
      CompareRunConfigSchema,
      ComposedPipelineSchema,
      ChallengeSchema,
      ChallengeAttemptSchema,
    ];
    for (const schema of schemas) {
      for (const junk of GARBAGE) {
        expect(schema.safeParse(junk).success, `schema must reject ${JSON.stringify(junk)?.slice(0, 80)}`).toBe(false);
      }
    }
  });

  it('accepts minimal valid fixtures', () => {
    const now = 1700000000000;
    expect(UserProgressSchema.safeParse({ version: 1, domains: {}, updatedAt: now }).success).toBe(true);
    expect(
      SessionTimelineEntrySchema.safeParse({
        seq: 0,
        timestamp: now,
        domainId: 'kafka',
        frameRef: 3,
        actionKind: 'CHAOS_INJECT',
        label: 'killed broker-1',
      }).success,
    ).toBe(true);
    expect(
      BookmarkSchema.safeParse({
        id: 'b1',
        label: 'before failover',
        domainId: 'raft',
        tick: 42,
        configSnapshot: {},
        note: '',
        createdAt: now,
      }).success,
    ).toBe(true);
    expect(
      PermalinkPayloadV2Schema.safeParse({ v: 2, domainId: 'kafka', seed: 7, events: [] }).success,
    ).toBe(true);
    expect(
      QuizQuestionSchema.safeParse({
        id: 'q1',
        domainId: 'kafka',
        kind: 'flashcard',
        prompt: 'What does ISR stand for?',
        answer: 'In-Sync Replicas',
        explanation: 'Replicas fully caught up with the leader.',
      }).success,
    ).toBe(true);
    expect(
      SpacedRepetitionCardSchema.safeParse({ questionId: 'q1', box: 0, nextReviewAt: now, lapses: 0 }).success,
    ).toBe(true);
    expect(
      InterviewScriptSchema.safeParse({
        id: 's1',
        title: 'Design a rate limiter',
        question: 'Design a rate limiter.',
        timeLimitMinutes: 30,
        steps: [
          {
            stepId: 's1',
            title: 'Pick an algorithm',
            domainId: 'rate-limiter',
            instruction: 'Open /rate-limiter and compare algorithms.',
            rubricItem: 'Names a concrete algorithm with a reason.',
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      CurriculumTrackSchema.safeParse({
        id: 't1',
        title: 'Track',
        description: 'Desc',
        requirements: [{ kind: 'interview', refId: 's1' }],
      }).success,
    ).toBe(true);
    expect(BadgeAwardSchema.safeParse({ trackId: 't1', userId: 'u1', earnedAt: now }).success).toBe(true);
    expect(
      CompareRunConfigSchema.safeParse({ domainId: 'raft', seedA: 1, seedB: 2, ticks: 100 }).success,
    ).toBe(true);
    expect(
      ComposedPipelineSchema.safeParse({ id: 'p1', name: 'P', nodeIds: ['kafka'], edges: [] }).success,
    ).toBe(true);
    expect(
      ChallengeSchema.safeParse({
        id: 'c1',
        domainId: 'rate-limiter',
        title: 'Break it',
        invariantId: 'RL-1',
        brief: 'Find the flaw.',
        explanation: 'Why.',
        mitigation: 'Fix.',
      }).success,
    ).toBe(true);
    expect(ChallengeAttemptSchema.safeParse({ challengeId: 'c1', solved: true, hintsUsed: 0, elapsedMs: 5 }).success).toBe(
      true,
    );
  });

  it('caps oversized collections', () => {
    const big = Array.from({ length: 501 }, (_, i) => ({
      tick: i,
      type: 'T',
      payload: {},
    }));
    expect(
      PermalinkPayloadV2Schema.safeParse({ v: 2, domainId: 'kafka', seed: 1, events: big }).success,
    ).toBe(false);
  });
});
