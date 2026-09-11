'use client';

import React from 'react';

import { ComposerCanvas } from '../../components/composer/ComposerCanvas';
import { LearnNav } from '../../components/learn/LearnNav';

export default function ComposerPage(): React.JSX.Element {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc' }}>
      <LearnNav active="/composer" />
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px' }}>Build Your Own System</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
            Wire curated domain pairs into a pipeline and watch a request trace flow end to end.
            Each node links into its full domain view.
          </p>
        </div>
        <ComposerCanvas />
      </main>
    </div>
  );
}
