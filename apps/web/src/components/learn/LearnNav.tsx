'use client';

import React from 'react';

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/', label: 'Simulator' },
  { href: '/progress', label: 'Progress' },
  { href: '/quizzes', label: 'Quizzes' },
  { href: '/interview', label: 'Interview' },
  { href: '/badges', label: 'Badges' },
  { href: '/compare', label: 'Compare' },
  { href: '/composer', label: 'Composer' },
  { href: '/challenges', label: 'Challenges' },
  { href: '/classroom', label: 'Classroom' },
  { href: '/analytics', label: 'Analytics' },
];

export function LearnNav({ active }: { active?: string }): React.JSX.Element {
  return (
    <nav
      aria-label="Learning features"
      style={{
        display: 'flex',
        gap: '4px',
        flexWrap: 'wrap',
        alignItems: 'center',
        padding: '10px 16px',
        backgroundColor: '#0f172a',
        borderBottom: '1px solid #334155',
      }}
    >
      {LINKS.map((l) => (
        <a
          key={l.href}
          href={l.href}
          aria-current={active === l.href ? 'page' : undefined}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: active === l.href ? '#f8fafc' : '#94a3b8',
            backgroundColor: active === l.href ? '#1e293b' : 'transparent',
            border: active === l.href ? '1px solid #475569' : '1px solid transparent',
            textDecoration: 'none',
          }}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}
