'use client';

import React from 'react';

import { DOMAIN_OPTIONS } from '../domain-options';
import { LearnNav } from '../../components/learn/LearnNav';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

interface RosterEntry {
  userId: string;
  name: string;
  role: 'PRESENTER' | 'STUDENT';
}

interface Assessment {
  userId: string;
  quizScore?: number;
  challengesSolved?: number;
  rubric: Array<{ item: string; met: boolean }>;
}

export default function ClassroomPage(): React.JSX.Element {
  const [token, setToken] = React.useState('');
  const [title, setTitle] = React.useState('Raft lab');
  const [domainId, setDomainId] = React.useState('raft');
  const [inviteCode, setInviteCode] = React.useState('');
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<string | null>(null);
  const [roster, setRoster] = React.useState<RosterEntry[]>([]);
  const [assessments, setAssessments] = React.useState<Assessment[]>([]);
  const [rubric, setRubric] = React.useState<Array<{ item: string; met: boolean }>>([
    { item: 'I can explain the quorum math', met: false },
    { item: 'I triggered the target invariant myself', met: false },
  ]);
  const [message, setMessage] = React.useState<string | null>(null);

  const headers = React.useCallback(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token],
  );

  const refresh = React.useCallback(
    async (id: string) => {
      try {
        const detail = (await (
          await fetch(`${API_URL}/classroom/sessions/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        ).json()) as { success: boolean; roster?: RosterEntry[] };
        if (detail.success && detail.roster) setRoster(detail.roster);
        const subs = (await (
          await fetch(`${API_URL}/classroom/sessions/${id}/assessments`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).json()) as { success: boolean; assessments?: Assessment[] };
        if (subs.success && subs.assessments) setAssessments(subs.assessments);
      } catch {
        // offline: roster stays stale, local tracking continues
      }
    },
    [token],
  );

  const create = async () => {
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/classroom/sessions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ title, domainId }),
      });
      const body = (await res.json()) as { success: boolean; session?: { id: string; inviteCode: string } };
      if (!res.ok || !body.success || !body.session) {
        setMessage('Could not create session (sign in first).');
        return;
      }
      setSessionId(body.session.id);
      setRole('PRESENTER');
      setInviteCode(body.session.inviteCode);
      await refresh(body.session.id);
    } catch {
      setMessage('Classroom API unreachable.');
    }
  };

  const join = async () => {
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/classroom/sessions/join`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ inviteCode: inviteCode.trim().toUpperCase() }),
      });
      const body = (await res.json()) as { success: boolean; sessionId?: string; role?: string };
      if (!res.ok || !body.success || !body.sessionId) {
        setMessage('Invalid or expired invite code.');
        return;
      }
      setSessionId(body.sessionId);
      setRole(body.role ?? 'STUDENT');
      await refresh(body.sessionId);
    } catch {
      setMessage('Classroom API unreachable.');
    }
  };

  const submit = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_URL}/classroom/sessions/${sessionId}/assessments`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ rubric }),
      });
      setMessage(res.ok ? 'Assessment submitted.' : 'Submission failed.');
      if (res.ok) await refresh(sessionId);
    } catch {
      setMessage('Classroom API unreachable.');
    }
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '0.85rem',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc' }}>
      <LearnNav active="/classroom" />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px' }}>Classroom</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
            Presenter-led rooms with invite codes, a live roster, and rubric self-assessments.
            Live presence rides the simulation gateway; no AI grading anywhere.
          </p>
        </div>

        <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
          Bearer token
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste to enable server features" style={{ ...inputStyle, width: '260px' }} />
        </label>

        {!sessionId && (
          <section style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px', border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <strong>Present a session</strong>
              <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Session title" style={inputStyle} />
              <select value={domainId} onChange={(e) => setDomainId(e.target.value)} aria-label="Domain" style={inputStyle}>
                {DOMAIN_OPTIONS.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <button onClick={() => void create()} style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>
                Create session
              </button>
            </div>
            <div style={{ flex: 1, minWidth: '240px', border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <strong>Join with invite code</strong>
              <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} aria-label="Invite code" placeholder="ABC123" style={inputStyle} />
              <button onClick={() => void join()} style={{ backgroundColor: '#0e7490', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>
                Join session
              </button>
            </div>
          </section>
        )}

        {message && <p style={{ color: '#fde68a', fontSize: '0.85rem', margin: 0 }}>{message}</p>}

        {sessionId && (
          <>
            <section style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '14px' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>
                Roster ({roster.length}) · you are {role}
                {inviteCode && role === 'PRESENTER' && (
                  <span style={{ color: '#94a3b8', fontWeight: 400 }}> · invite code: <strong style={{ color: '#f8fafc' }}>{inviteCode}</strong></span>
                )}
              </h2>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: '#e2e8f0' }}>
                {roster.map((r) => (
                  <li key={r.userId}>{r.name} — {r.role}</li>
                ))}
              </ul>
              <a href={`/${domainId}`} style={{ color: '#38bdf8', fontSize: '0.82rem' }}>Open /{domainId} to run the lab →</a>
            </section>

            {role === 'STUDENT' && (
              <section style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Self-assessment rubric</h2>
                {rubric.map((r, i) => (
                  <label key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.85rem', color: '#e2e8f0' }}>
                    <input
                      type="checkbox"
                      checked={r.met}
                      onChange={(e) => {
                        const next = [...rubric];
                        next[i] = { item: r.item, met: e.target.checked };
                        setRubric(next);
                      }}
                    />
                    {r.item}
                  </label>
                ))}
                <button onClick={() => void submit()} style={{ alignSelf: 'flex-start', backgroundColor: '#15803d', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
                  Submit assessment
                </button>
              </section>
            )}

            {role === 'PRESENTER' && (
              <section style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '14px' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>Submissions ({assessments.length})</h2>
                {assessments.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>No submissions yet.</p>}
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: '#e2e8f0' }}>
                  {assessments.map((a, i) => (
                    <li key={i}>
                      {a.userId.slice(0, 8)}… — quiz {a.quizScore ?? '—'}, {a.challengesSolved ?? 0} challenges,{' '}
                      {a.rubric.filter((r) => r.met).length}/{a.rubric.length} rubric
                    </li>
                  ))}
                </ul>
                <button onClick={() => sessionId && void refresh(sessionId)} style={{ marginTop: '8px', backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}>
                  Refresh
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
