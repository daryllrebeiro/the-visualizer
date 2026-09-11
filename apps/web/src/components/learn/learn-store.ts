'use client';

import { create } from 'zustand';

import {
  BookmarkSchema,
  ChallengeAttemptSchema,
  SpacedRepetitionCardSchema,
  UserProgressSchema,
  createEmptyDomainProgress,
  type Bookmark,
  type ChallengeAttempt,
  type SessionTimelineEntry,
  type SpacedRepetitionCard,
  type UserProgress,
} from '@the-visualizer/contracts';
import { reviewCard } from '@the-visualizer/simulation';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

/**
 * Pushes local progress to the server record (authenticated only).
 * Returns false when offline, unauthenticated, or rejected — local tracking
 * always keeps working regardless.
 */
export async function syncProgressToServer(progress: UserProgress, token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(`${API_URL}/learn/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ progress }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Pulls the server record and keeps whichever copy is newer (by updatedAt).
 * Returns the winning progress, or null when there is nothing to merge.
 */
export async function pullServerProgress(local: UserProgress, token: string): Promise<UserProgress | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/learn/progress`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { success: boolean; progress: unknown };
    const parsed = UserProgressSchema.safeParse(body.progress);
    if (!parsed.success) return null;
    return parsed.data.updatedAt >= local.updatedAt ? parsed.data : local;
  } catch {
    return null;
  }
}

const STORAGE_KEY = 'the-visualizer:learn:v1';

interface LearnPersisted {
  progress: UserProgress;
  bookmarks: Bookmark[];
  cards: Record<string, SpacedRepetitionCard>;
  attempts: Record<string, ChallengeAttempt>;
  interviewsCompleted: string[];
}

function emptyPersisted(nowMs: number): LearnPersisted {
  return {
    progress: { version: 1, domains: {}, updatedAt: nowMs },
    bookmarks: [],
    cards: {},
    attempts: {},
    interviewsCompleted: [],
  };
}

function loadPersisted(): LearnPersisted {
  const fallback = emptyPersisted(Date.now());
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return fallback;
    const blob = parsed as Partial<LearnPersisted>;
    const progress = UserProgressSchema.safeParse(blob.progress);
    const bookmarks = Array.isArray(blob.bookmarks)
      ? blob.bookmarks.filter((b) => BookmarkSchema.safeParse(b).success)
      : [];
    const cards: Record<string, SpacedRepetitionCard> = {};
    if (blob.cards !== null && typeof blob.cards === 'object' && !Array.isArray(blob.cards)) {
      for (const [k, v] of Object.entries(blob.cards as Record<string, unknown>)) {
        const c = SpacedRepetitionCardSchema.safeParse(v);
        if (c.success) cards[k] = c.data;
      }
    }
    const attempts: Record<string, ChallengeAttempt> = {};
    if (blob.attempts !== null && typeof blob.attempts === 'object' && !Array.isArray(blob.attempts)) {
      for (const [k, v] of Object.entries(blob.attempts as Record<string, unknown>)) {
        const a = ChallengeAttemptSchema.safeParse(v);
        if (a.success) attempts[k] = a.data;
      }
    }
    const interviewsCompleted = Array.isArray(blob.interviewsCompleted)
      ? blob.interviewsCompleted.filter((s): s is string => typeof s === 'string').slice(0, 200)
      : [];
    return {
      progress: progress.success ? progress.data : fallback.progress,
      bookmarks: bookmarks as Bookmark[],
      cards,
      attempts,
      interviewsCompleted,
    };
  } catch {
    return fallback;
  }
}

function savePersisted(state: LearnPersisted): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or privacy mode — anonymous tracking degrades silently.
  }
}

export interface LearnStore extends LearnPersisted {
  /** Session-only timeline (not persisted, not synced). */
  timeline: SessionTimelineEntry[];
  timelineSeq: number;

  recordVisit: (domainId: string, timeSpentMs?: number) => void;
  recordScenario: (domainId: string, scenarioId: string) => void;
  recordInvariant: (domainId: string, invariantId: string) => void;
  recordQuizAnswer: (domainId: string, questionId: string, correct: boolean) => void;
  recordTimeline: (entry: Omit<SessionTimelineEntry, 'seq' | 'timestamp'>) => void;
  clearTimeline: () => void;
  addBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (id: string) => void;
  recordChallengeAttempt: (attempt: ChallengeAttempt) => void;
  recordInterviewComplete: (scriptId: string) => void;
  replaceAll: (persisted: LearnPersisted) => void;
}

function touchProgress(progress: UserProgress, domainId: string, nowMs: number): UserProgress {
  const existing = progress.domains[domainId] ?? createEmptyDomainProgress(domainId, nowMs);
  return {
    ...progress,
    domains: { ...progress.domains, [domainId]: existing },
    updatedAt: nowMs,
  };
}

export const useLearnStore = create<LearnStore>((set, get) => {
  const initial = loadPersisted();

  const persist = () => {
    const s = get();
    savePersisted({
      progress: s.progress,
      bookmarks: s.bookmarks,
      cards: s.cards,
      attempts: s.attempts,
      interviewsCompleted: s.interviewsCompleted,
    });
  };

  return {
    ...initial,
    timeline: [],
    timelineSeq: 0,

    recordVisit: (domainId, timeSpentMs = 0) => {
      const now = Date.now();
      const progress = touchProgress(get().progress, domainId, now);
      const d = progress.domains[domainId]!;
      progress.domains[domainId] = { ...d, timeSpentMs: d.timeSpentMs + timeSpentMs, lastVisitedAt: now };
      progress.updatedAt = now;
      set({ progress });
      persist();
    },

    recordScenario: (domainId, scenarioId) => {
      const now = Date.now();
      const progress = touchProgress(get().progress, domainId, now);
      const d = progress.domains[domainId]!;
      if (!d.scenariosCompleted.includes(scenarioId)) {
        progress.domains[domainId] = {
          ...d,
          scenariosCompleted: [...d.scenariosCompleted, scenarioId].slice(-500),
          lastVisitedAt: now,
        };
      }
      progress.updatedAt = now;
      set({ progress });
      persist();
    },

    recordInvariant: (domainId, invariantId) => {
      const now = Date.now();
      const progress = touchProgress(get().progress, domainId, now);
      const d = progress.domains[domainId]!;
      if (!d.invariantsTriggered.includes(invariantId)) {
        progress.domains[domainId] = {
          ...d,
          invariantsTriggered: [...d.invariantsTriggered, invariantId].slice(-500),
          lastVisitedAt: now,
        };
      }
      progress.updatedAt = now;
      set({ progress });
      persist();
    },

    recordQuizAnswer: (domainId, questionId, correct) => {
      const now = Date.now();
      const progress = touchProgress(get().progress, domainId, now);
      const d = progress.domains[domainId]!;
      const prev = d.quizAnswered[questionId];
      const attempts = (prev?.attempts ?? 0) + 1;
      const wasCorrect = prev?.correct ?? false;
      progress.domains[domainId] = {
        ...d,
        quizAnswered: {
          ...d.quizAnswered,
          [questionId]: { correct: wasCorrect || correct, attempts, lastAnsweredAt: now },
        },
        lastVisitedAt: now,
      };
      progress.updatedAt = now;

      const prevCard = get().cards[questionId];
      const outcome = reviewCard(prevCard?.box ?? 0, prevCard?.lapses ?? 0, correct, now);
      const cards = {
        ...get().cards,
        [questionId]: {
          questionId,
          box: outcome.box,
          nextReviewAt: outcome.nextReviewAt,
          lapses: outcome.lapses,
          lastCorrect: correct,
        },
      };
      set({ progress, cards });
      persist();
    },

    recordTimeline: (entry) => {
      const seq = get().timelineSeq;
      const full: SessionTimelineEntry = { ...entry, seq, timestamp: Date.now() };
      set({ timeline: [...get().timeline, full].slice(-500), timelineSeq: seq + 1 });
    },

    clearTimeline: () => set({ timeline: [], timelineSeq: 0 }),

    addBookmark: (bookmark) => {
      const parsed = BookmarkSchema.safeParse(bookmark);
      if (!parsed.success) return;
      set({ bookmarks: [...get().bookmarks.filter((b) => b.id !== parsed.data.id), parsed.data].slice(-200) });
      persist();
    },

    removeBookmark: (id) => {
      set({ bookmarks: get().bookmarks.filter((b) => b.id !== id) });
      persist();
    },

    recordChallengeAttempt: (attempt) => {
      const parsed = ChallengeAttemptSchema.safeParse(attempt);
      if (!parsed.success) return;
      set({ attempts: { ...get().attempts, [parsed.data.challengeId]: parsed.data } });
      persist();
    },

    recordInterviewComplete: (scriptId) => {
      if (get().interviewsCompleted.includes(scriptId)) return;
      set({ interviewsCompleted: [...get().interviewsCompleted, scriptId].slice(-200) });
      persist();
    },

    replaceAll: (persisted) => {
      set({ ...persisted });
      persist();
    },
  };
});

/** Mastery percentages per domain: scenarios / quizzes / invariants (0..1 each). */
export function domainMastery(
  progress: UserProgress,
  domainId: string,
  totals: { scenarios: number; quizzes: number; invariants: number },
): { scenarios: number; quizzes: number; invariants: number } {
  const d = progress.domains[domainId];
  if (!d) return { scenarios: 0, quizzes: 0, invariants: 0 };
  const quizCorrect = Object.values(d.quizAnswered).filter((q) => q.correct).length;
  return {
    scenarios: totals.scenarios === 0 ? 0 : Math.min(1, d.scenariosCompleted.length / totals.scenarios),
    quizzes: totals.quizzes === 0 ? 0 : Math.min(1, quizCorrect / totals.quizzes),
    invariants: totals.invariants === 0 ? 0 : Math.min(1, d.invariantsTriggered.length / totals.invariants),
  };
}
