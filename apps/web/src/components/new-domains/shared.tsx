'use client';

import React from 'react';

/**
 * Shared visual primitives for the Domains 19-28 batch — matching the
 * platform's dark design system (see components/domains/design-system).
 */

export function Panel({
  title,
  subtitle,
  children,
  accent = '#38bdf8',
  right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: string;
  right?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      style={{
        backgroundColor: '#0f172a',
        padding: '12px 16px',
        borderRadius: '8px',
        border: `1px solid #1e293b`,
        borderTop: `2px solid ${accent}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '8px',
          marginBottom: '8px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#f8fafc' }}>{title}</h3>
          {subtitle !== undefined && (
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{subtitle}</span>
          )}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function StatRow({
  items,
}: {
  items: ReadonlyArray<{ label: string; value: string; color?: string | undefined }>;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>
            {item.label}
          </span>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: item.color ?? '#e2e8f0' }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ControlButton({
  label,
  onClick,
  tone = 'default',
  disabled,
}: {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'success' | 'warn';
  disabled?: boolean;
}): React.JSX.Element {
  const toneColor =
    tone === 'danger' ? '#ef4444' : tone === 'success' ? '#10b981' : tone === 'warn' ? '#f59e0b' : '#38bdf8';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 10px',
        fontSize: '0.75rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? '#475569' : toneColor,
        backgroundColor: '#020617',
        border: `1px solid ${disabled ? '#1e293b' : toneColor}55`,
        borderRadius: '6px',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

export function Badge({
  text,
  color,
}: {
  text: string;
  color: string;
}): React.JSX.Element {
  return (
    <span
      style={{
        fontSize: '0.65rem',
        fontWeight: 700,
        padding: '1px 6px',
        borderRadius: '999px',
        color,
        border: `1px solid ${color}66`,
        backgroundColor: `${color}1a`,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

export function DataTable({
  headers,
  rows,
  maxHeight = '300px',
}: {
  headers: ReadonlyArray<string>;
  rows: ReadonlyArray<ReadonlyArray<React.ReactNode>>;
  maxHeight?: string;
}): React.JSX.Element {
  return (
    <div style={{ overflowX: 'auto', maxHeight, overflowY: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.75rem',
          color: '#cbd5e1',
        }}
      >
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '4px 8px',
                  borderBottom: '1px solid #334155',
                  color: '#94a3b8',
                  position: 'sticky',
                  top: 0,
                  backgroundColor: '#0f172a',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '3px 8px', verticalAlign: 'top' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LogView({
  lines,
  maxHeight = '180px',
}: {
  lines: ReadonlyArray<string>;
  maxHeight?: string;
}): React.JSX.Element {
  return (
    <div
      style={{
        maxHeight,
        overflowY: 'auto',
        fontFamily: 'ui-monospace, monospace',
        fontSize: '0.7rem',
        color: '#94a3b8',
        lineHeight: 1.6,
      }}
    >
      {lines.length === 0 && <div style={{ color: '#475569' }}>— no events yet —</div>}
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}
