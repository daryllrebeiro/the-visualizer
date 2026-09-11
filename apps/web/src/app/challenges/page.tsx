'use client';

import React from 'react';

import { DOMAIN_OPTIONS } from '../domain-options';
import { challengeForDomain } from '../../components/learn/challenge-bank';
import { ChallengeMode } from '../../components/learn/ChallengeMode';
import { LearnNav } from '../../components/learn/LearnNav';

export default function ChallengesPage(): React.JSX.Element {
  const [domainId, setDomainId] = React.useState<string>('rate-limiter');
  const challenges = challengeForDomain(domainId);
  const [challengeId, setChallengeId] = React.useState<string>(challenges[0]?.id ?? '');
  const challenge = challenges.find((c) => c.id === challengeId) ?? challenges[0];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc' }}>
      <LearnNav active="/challenges" />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px' }}>What Would Break This?</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
            A working system, a real invariant, and you. Find the violation before unlocking hints —
            possible only because every domain runs a real invariant checker, not animations.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
            Domain
            <select
              value={domainId}
              onChange={(e) => {
                setDomainId(e.target.value);
                const first = challengeForDomain(e.target.value)[0];
                setChallengeId(first?.id ?? '');
              }}
              style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '6px 10px' }}
            >
              {DOMAIN_OPTIONS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          {challenges.length > 1 && (
            <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
              Challenge
              <select
                value={challengeId}
                onChange={(e) => setChallengeId(e.target.value)}
                style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '6px 10px' }}
              >
                {challenges.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {challenge && <ChallengeMode key={challenge.id} challenge={challenge} />}
      </main>
    </div>
  );
}
