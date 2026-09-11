'use client';

import React from 'react';

import { LearnNav } from '../../../components/learn/LearnNav';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

export default function BadgeVerifyPage(): React.JSX.Element {
  const [result, setResult] = React.useState<string>('Verifying…');

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payload = params.get('payload');
    const sig = params.get('sig');
    if (!payload || !sig) {
      setResult('Missing payload or signature.');
      return;
    }
    fetch(`${API_URL}/learn/badges/verify?payload=${encodeURIComponent(payload)}&sig=${encodeURIComponent(sig)}`)
      .then(async (res) => {
        const body = (await res.json()) as {
          success: boolean;
          valid?: boolean;
          award?: { trackId: string; userId: string; earnedAt: number };
        };
        if (res.ok && body.success && body.valid && body.award) {
          setResult(
            `Valid badge — track "${body.award.trackId}", earned on ${new Date(body.award.earnedAt).toLocaleDateString()}. No account needed to verify.`,
          );
        } else {
          setResult('Invalid badge signature.');
        }
      })
      .catch(() => setResult('Verification service unreachable.'));
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc' }}>
      <LearnNav active="/badges" />
      <main style={{ maxWidth: '700px', margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem' }}>Badge verification</h1>
        <p style={{ color: '#94a3b8' }}>{result}</p>
      </main>
    </div>
  );
}
