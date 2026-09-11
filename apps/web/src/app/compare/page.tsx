'use client';

import React from 'react';

import { CompareShell } from '../../components/compare/CompareShell';
import { LearnNav } from '../../components/learn/LearnNav';

export default function ComparePage(): React.JSX.Element {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc' }}>
      <LearnNav active="/compare" />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px' }}>Diff / Compare Mode</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
            Two independent engine instances, one shared scrubber. Divergence points are flagged —
            jump straight to where the runs start disagreeing. Works uniformly for every domain.
          </p>
        </div>
        <CompareShell />
      </main>
    </div>
  );
}
