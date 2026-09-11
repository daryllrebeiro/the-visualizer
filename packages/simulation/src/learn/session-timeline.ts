import {
  SessionTimelineEntrySchema,
  type SessionActionKind,
  type SessionTimelineEntry,
} from '@the-visualizer/contracts';

/**
 * Session-wide index across every domain visited in a session. Each entry
 * points into that domain's own existing frame history via `frameRef` — this
 * builder creates no state-capture system of its own.
 */
export class SessionTimelineBuilder {
  private entries: SessionTimelineEntry[] = [];

  append(input: {
    timestamp: number;
    domainId: string;
    frameRef: number;
    actionKind: SessionActionKind;
    label: string;
  }): SessionTimelineEntry {
    const entry = SessionTimelineEntrySchema.parse({
      seq: this.entries.length,
      ...input,
    });
    this.entries.push(entry);
    return entry;
  }

  list(): SessionTimelineEntry[] {
    return [...this.entries];
  }

  entriesForDomain(domainId: string): SessionTimelineEntry[] {
    return this.entries.filter((e) => e.domainId === domainId);
  }

  jumpTarget(seq: number): { domainId: string; frameRef: number } | null {
    const entry = this.entries.find((e) => e.seq === seq);
    return entry ? { domainId: entry.domainId, frameRef: entry.frameRef } : null;
  }
}

// ─── Spaced repetition (Leitner boxes, deterministic) ────────────────────────

/** Day-based intervals per box: new → 1d → 3d → 7d → 14d → 30d. */
export const LEITNER_INTERVALS_MS = [0, 86400000, 259200000, 604800000, 1209600000, 2592000000];

export interface ReviewOutcome {
  box: number;
  nextReviewAt: number;
  lapses: number;
}

/** Pure transition: correct promotes (max box 4), wrong resets to box 0. */
export function reviewCard(
  currentBox: number,
  currentLapses: number,
  correct: boolean,
  nowMs: number,
): ReviewOutcome {
  const box = Math.min(4, Math.max(0, Math.floor(currentBox)));
  if (correct) {
    const next = Math.min(4, box + 1);
    const interval = LEITNER_INTERVALS_MS[next + 1] ?? LEITNER_INTERVALS_MS[5] ?? 2592000000;
    return { box: next, nextReviewAt: nowMs + interval, lapses: currentLapses };
  }
  return { box: 0, nextReviewAt: nowMs + 600000, lapses: currentLapses + 1 };
}

/** Cards due for review at `nowMs`, oldest first. */
export function dueCards<T extends { nextReviewAt: number }>(cards: T[], nowMs: number): T[] {
  return cards.filter((c) => c.nextReviewAt <= nowMs).sort((a, b) => a.nextReviewAt - b.nextReviewAt);
}
