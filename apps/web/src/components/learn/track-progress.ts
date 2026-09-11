'use client';

import type { CurriculumTrack, UserProgress } from '@the-visualizer/contracts';

import { quizForDomain } from './quiz-banks';

export interface RequirementStatus {
  met: boolean;
  label: string;
}

/** Evaluates every requirement of a track against local progress. Pure. */
export function evaluateTrack(
  track: CurriculumTrack,
  progress: UserProgress,
  interviewsCompleted: string[],
): RequirementStatus[] {
  return track.requirements.map((req) => {
    if (req.kind === 'scenario') {
      const done = req.domainId ? (progress.domains[req.domainId]?.scenariosCompleted.includes(req.refId) ?? false) : false;
      return { met: done, label: `Complete scenario ${req.refId}${req.domainId ? ` in /${req.domainId}` : ''}` };
    }
    if (req.kind === 'quiz-threshold') {
      const domainId = req.domainId ?? req.refId;
      const bank = quizForDomain(domainId);
      const answered = progress.domains[domainId]?.quizAnswered ?? {};
      const correct = bank.filter((q) => answered[q.id]?.correct).length;
      const ratio = bank.length === 0 ? 0 : correct / bank.length;
      const threshold = req.threshold ?? 0.8;
      return {
        met: ratio >= threshold,
        label: `Score ≥ ${String(Math.round(threshold * 100))}% on ${domainId} quiz (${correct}/${bank.length} correct)`,
      };
    }
    const done = interviewsCompleted.includes(req.refId);
    return { met: done, label: `Complete interview walkthrough ${req.refId}` };
  });
}

export function trackComplete(statuses: RequirementStatus[]): boolean {
  return statuses.length > 0 && statuses.every((s) => s.met);
}
