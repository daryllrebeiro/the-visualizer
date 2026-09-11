import { describe, expect, it } from 'vitest';

import {
  ChallengeSchema,
  CurriculumTrackSchema,
  InterviewScriptSchema,
  QuizQuestionSchema,
} from '@the-visualizer/contracts';
import { DomainRegistry } from '@the-visualizer/simulation';

import { CHALLENGE_BANK } from './challenge-bank.js';
import { CURRICULUM_TRACKS } from './curriculum-tracks.js';
import { INTERVIEW_SCRIPTS } from './interview-scripts.js';
import { QUIZ_BANK } from './quiz-banks.js';

describe('learn content banks', () => {
  it('every quiz question validates and has a consistent answer key', () => {
    expect(QUIZ_BANK.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const q of QUIZ_BANK) {
      const parsed = QuizQuestionSchema.safeParse(q);
      expect(parsed.success, `quiz question ${q.id} must validate`).toBe(true);
      expect(ids.has(q.id), `duplicate quiz id ${q.id}`).toBe(false);
      ids.add(q.id);
      if (q.kind === 'multiple-choice') {
        expect(q.choices?.length).toBeGreaterThanOrEqual(2);
        expect(q.answerIndex).toBeLessThan(q.choices!.length);
      }
    }
  });

  it('covers every registered domain with at least 3 questions each', () => {
    // Bonus banks may exist for unregistered engine modules (rag, agents);
    // coverage is asserted against the registry as source of truth.
    const registered = new Set(DomainRegistry.list().map((m) => m.id));
    expect(registered.size).toBe(30);
    const byDomain = new Map<string, number>();
    for (const q of QUIZ_BANK) byDomain.set(q.domainId, (byDomain.get(q.domainId) ?? 0) + 1);
    for (const domainId of registered) {
      expect(byDomain.get(domainId) ?? 0, `domain ${domainId} needs >= 3 questions`).toBeGreaterThanOrEqual(3);
    }
  });

  it('every interview script validates with ordered steps and rubric items', () => {
    for (const s of INTERVIEW_SCRIPTS) {
      expect(InterviewScriptSchema.safeParse(s).success, `interview ${s.id} must validate`).toBe(true);
      expect(new Set(s.steps.map((st) => st.stepId)).size).toBe(s.steps.length);
    }
  });

  it('every challenge validates and covers every registered domain', () => {
    const registered = new Set(DomainRegistry.list().map((m) => m.id));
    const domains = new Set<string>();
    for (const c of CHALLENGE_BANK) {
      expect(ChallengeSchema.safeParse(c).success, `challenge ${c.id} must validate`).toBe(true);
      domains.add(c.domainId);
    }
    for (const domainId of registered) {
      expect(domains.has(domainId), `domain ${domainId} needs a challenge`).toBe(true);
    }
  });

  it('every curriculum track validates', () => {
    for (const t of CURRICULUM_TRACKS) {
      expect(CurriculumTrackSchema.safeParse(t).success, `track ${t.id} must validate`).toBe(true);
    }
  });
});
