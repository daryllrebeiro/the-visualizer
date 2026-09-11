'use client';

import React from 'react';

import { CURRICULUM_TRACKS } from '../../components/learn/curriculum-tracks';
import { LearnNav } from '../../components/learn/LearnNav';
import { useLearnStore } from '../../components/learn/learn-store';
import { evaluateTrack, trackComplete } from '../../components/learn/track-progress';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

export default function BadgesPage(): React.JSX.Element {
  const progress = useLearnStore((s) => s.progress);
  const interviewsCompleted = useLearnStore((s) => s.interviewsCompleted);
  const [token, setToken] = React.useState('');
  const [status, setStatus] = React.useState<string | null>(null);
  const [badgeLinks, setBadgeLinks] = React.useState<Record<string, string>>({});

  const claim = async (trackId: string) => {
    setStatus(null);
    const track = CURRICULUM_TRACKS.find((t) => t.id === trackId)!;
    const statuses = evaluateTrack(track, progress, interviewsCompleted);
    if (!trackComplete(statuses)) {
      setStatus('Requirements are not all met yet.');
      return;
    }
    if (!token) {
      setStatus('Sign-in token required: paste a Bearer token to mint a verifiable badge (anonymous badges stay local-only).');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/learn/badges/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          trackId,
          evidence: track.requirements.map((r, i) => ({
            kind: r.kind,
            refId: r.refId,
            met: statuses[i]?.met ?? false,
          })),
        }),
      });
      const body = (await res.json()) as { success: boolean; award?: unknown; sig?: string };
      if (!res.ok || !body.success || !body.sig) {
        setStatus('Badge issuance failed.');
        return;
      }
      const link = `${window.location.origin}/badges/verify?payload=${encodeURIComponent(JSON.stringify(body.award))}&sig=${body.sig}`;
      setBadgeLinks((m) => ({ ...m, [trackId]: link }));
      setStatus('Badge minted — share the verification link.');
    } catch {
      setStatus('Badge issuance failed (network).');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc' }}>
      <LearnNav active="/badges" />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px' }}>Certification Tracks</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
            Curated bundles of scenarios, quiz thresholds, and interview walkthroughs. Badges are
            self-asserted learning records signed by the platform — verifiable, not proctored.
          </p>
        </div>
        <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
          Bearer token (for verifiable badges)
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="optional"
            style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '6px 10px', width: '280px' }}
          />
        </label>
        {status && <p style={{ color: '#fde68a', fontSize: '0.85rem', margin: 0 }}>{status}</p>}
        {CURRICULUM_TRACKS.map((track) => {
          const statuses = evaluateTrack(track, progress, interviewsCompleted);
          const done = trackComplete(statuses);
          return (
            <section key={track.id} style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '16px' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>
                {done ? '🏅 ' : ''}{track.title}
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '0 0 10px' }}>{track.description}</p>
              <ul style={{ margin: '0 0 12px', paddingLeft: '20px', color: '#e2e8f0', fontSize: '0.82rem' }}>
                {statuses.map((s, i) => (
                  <li key={i} style={{ color: s.met ? '#86efac' : '#e2e8f0' }}>
                    {s.met ? '✓' : '○'} {s.label}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => void claim(track.id)}
                disabled={!done}
                style={{ backgroundColor: done ? '#4f46e5' : '#1e293b', color: done ? '#fff' : '#64748b', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 700, cursor: done ? 'pointer' : 'default' }}
              >
                {done ? 'Claim verifiable badge' : 'Locked — complete requirements'}
              </button>
              {badgeLinks[track.id] && (
                <p style={{ fontSize: '0.78rem', wordBreak: 'break-all', margin: '8px 0 0' }}>
                  <a href={badgeLinks[track.id]} style={{ color: '#38bdf8' }}>{badgeLinks[track.id]}</a>
                </p>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
