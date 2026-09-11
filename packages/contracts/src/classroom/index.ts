import { z } from 'zod';

/**
 * Multi-player classroom (Phase 3).
 *
 * Presenter-led rooms where students follow a guided scenario and submit
 * rubric self-assessments. Live presence rides the existing gateway
 * (`PRESENCE_UPDATE` with roles); the roster and assessments are the only
 * server state, stored in Redis with a 7-day TTL. No LLM grading — assessment
 * is the learner's own rubric checklist plus their verifiable quiz/challenge
 * record.
 */

export const ClassroomRoleSchema = z.enum(['PRESENTER', 'STUDENT']);
export type ClassroomRole = z.infer<typeof ClassroomRoleSchema>;

export const ClassroomSessionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  domainId: z.string().min(1).max(64),
  scenarioId: z.string().min(1).max(128).optional(),
  presenterUserId: z.string().min(1).max(128),
  inviteCode: z.string().min(6).max(16),
  createdAt: z.number().int().nonnegative(),
  endsAt: z.number().int().nonnegative().optional(),
});

export type ClassroomSession = z.infer<typeof ClassroomSessionSchema>;

export const ClassroomRosterEntrySchema = z.object({
  userId: z.string().min(1).max(128),
  name: z.string().min(1).max(255),
  role: ClassroomRoleSchema,
  joinedAt: z.number().int().nonnegative(),
});

export type ClassroomRosterEntry = z.infer<typeof ClassroomRosterEntrySchema>;

export const RubricResultSchema = z.object({
  item: z.string().min(1).max(500),
  met: z.boolean(),
});

export const ClassroomAssessmentSchema = z.object({
  sessionId: z.string().min(1).max(64),
  userId: z.string().min(1).max(128),
  quizScore: z.number().min(0).max(1).optional(),
  challengesSolved: z.number().int().nonnegative().max(1000).optional(),
  rubric: z.array(RubricResultSchema).min(1).max(40),
  submittedAt: z.number().int().nonnegative(),
});

export type ClassroomAssessment = z.infer<typeof ClassroomAssessmentSchema>;

/** 6-char invite codes from an unambiguous alphabet (no 0/O/1/I). */
export function makeInviteCode(randomBytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    const byte = randomBytes[i % randomBytes.length] ?? 0;
    code += alphabet[byte % alphabet.length] ?? 'A';
  }
  return code;
}
