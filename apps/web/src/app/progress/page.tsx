'use client';

import React from 'react';

import { DomainRegistry } from '@the-visualizer/simulation';

import { DOMAIN_OPTIONS } from '../domain-options';
import { BookmarksPanel } from '../../components/learn/BookmarksPanel';
import { LearnNav } from '../../components/learn/LearnNav';
import { ProgressDashboard } from '../../components/learn/ProgressDashboard';
import { SessionHistoryPanel } from '../../components/learn/SessionHistoryPanel';
import { useLearnStore } from '../../components/learn/learn-store';
import { quizForDomain } from '../../components/learn/quiz-banks';

export default function ProgressPage(): React.JSX.Element {
  const progress = useLearnStore((s) => s.progress);
  const timeline = useLearnStore((s) => s.timeline);
  const bookmarks = useLearnStore((s) => s.bookmarks);
  const clearTimeline = useLearnStore((s) => s.clearTimeline);
  const removeBookmark = useLearnStore((s) => s.removeBookmark);

  const totals = React.useMemo(
    () =>
      DOMAIN_OPTIONS.map((d) => ({
        domainId: d.id,
        name: d.name,
        color: d.color,
        scenarios: DomainRegistry.get(d.id)?.scenarioLibrary.length ?? 0,
        quizzes: quizForDomain(d.id).length,
      })),
    [],
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc' }}>
      <LearnNav active="/progress" />
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px' }}>Mastery Map</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
            Tracked locally on this device — no account required. Sign in to sync across devices when the
            server sync is enabled.
          </p>
        </div>
        <ProgressDashboard progress={progress} totals={totals} />
        <SessionHistoryPanel
          entries={timeline}
          onJump={(e) => {
            window.location.href = `/${e.domainId}`;
          }}
          onClear={clearTimeline}
        />
        <BookmarksPanel
          bookmarks={bookmarks}
          onJump={(b) => {
            window.location.href = `/${b.domainId}`;
          }}
          onRemove={removeBookmark}
        />
      </main>
    </div>
  );
}
