import React, { useEffect, useState } from 'react';

import { Button } from '../primitives/Button.js';
import { type ConnectionStatusType, StatusPill } from '../primitives/StatusPill.js';
import { DOMAIN_COLORS } from '../tokens.js';
import { type CommandItem, CommandPalette } from './CommandPalette.js';
import { DataTableModal, type DataTableRow } from './DataTableModal.js';
import { OnboardingTour } from './OnboardingTour.js';

export interface DomainMeta {
  id: string;
  name: string;
  icon?: string | undefined;
  category?: string | undefined;
  color?: string | undefined;
  fidelityDisplayName?: string | undefined;
}

export interface CanvasShellProps {
  currentDomain: string;
  domains: DomainMeta[];
  onSelectDomain: (domainId: string) => void;
  status?: ConnectionStatusType | undefined;
  commands?: CommandItem[] | undefined;
  leftPanel?: React.ReactNode | undefined;
  leftPanelTitle?: string | undefined;
  rightPanel?: React.ReactNode | undefined;
  rightPanelTitle?: string | undefined;
  bottomBar?: React.ReactNode | undefined;
  headerActions?: React.ReactNode | undefined;
  accessibleRows?: DataTableRow[] | undefined;
  children: React.ReactNode;
}

export const CanvasShell: React.FC<CanvasShellProps> = ({
  currentDomain,
  domains,
  onSelectDomain,
  status = 'SANDBOX',
  commands = [],
  leftPanel,
  leftPanelTitle = 'Controls & Chaos',
  rightPanel,
  rightPanelTitle = 'Inspector',
  bottomBar,
  headerActions,
  accessibleRows,
  children,
}) => {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);

  useEffect(() => {
    // Keyboard shortcuts: '/' opens command palette, '?' opens tour, 't' opens table
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === '/' && !cmdOpen) {
        e.preventDefault();
        setCmdOpen(true);
      } else if (e.key === '?' && !tourOpen) {
        e.preventDefault();
        setTourOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cmdOpen, tourOpen]);

  const activeDomain = domains.find((d) => d.id === currentDomain) ?? {
    id: currentDomain,
    name: currentDomain.toUpperCase(),
    color: '#3b82f6',
  };

  const domainTheme = DOMAIN_COLORS[currentDomain] ?? {
    primary: activeDomain.color ?? '#3b82f6',
    subtle: 'rgba(59, 130, 246, 0.1)',
    border: 'rgba(59, 130, 246, 0.3)',
  };

  const allCommands: CommandItem[] = [
    ...domains.map((d) => ({
      id: `domain-${d.id}`,
      title: `Switch to ${d.name}`,
      category: 'Domains',
      icon: d.icon ?? '⚡',
      action: () => onSelectDomain(d.id),
    })),
    ...commands,
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--bg-page, #f8fafc)',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: 'var(--text-primary, #0f172a)',
      }}
    >
      {/* 1. Global Top Navigation Header */}
      <header
        style={{
          height: '56px',
          background: 'var(--bg-white, #ffffff)',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 30,
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Left: Brand & Domain Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: '15px', letterSpacing: '-0.02em' }}>
              TheVisualizer
            </span>
          </div>

          <span style={{ color: '#cbd5e1' }}>/</span>

          {/* Domain Dropdown Selector */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: `1px solid ${domainTheme.border}`,
                background: domainTheme.subtle,
                color: domainTheme.primary,
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                outline: 'none',
              }}
            >
              {activeDomain.icon && <span>{activeDomain.icon}</span>}
              <span>{activeDomain.name}</span>
              <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
            </button>

            {dropdownOpen && (
              <>
                <div
                  onClick={() => setDropdownOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    width: '280px',
                    background: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                    border: '1px solid #e2e8f0',
                    padding: '6px',
                    zIndex: 41,
                  }}
                >
                  <div
                    style={{
                      padding: '6px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Select Visualizer
                  </div>
                  {domains.map((d) => {
                    const isCur = d.id === currentDomain;
                    return (
                      <div
                        key={d.id}
                        onClick={() => {
                          onSelectDomain(d.id);
                          setDropdownOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: isCur ? '#f1f5f9' : 'transparent',
                          color: isCur ? '#0f172a' : '#334155',
                          fontWeight: isCur ? 700 : 500,
                          fontSize: '13px',
                          transition: 'background 100ms ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{d.icon ?? '🔹'}</span>
                          <span>{d.name}</span>
                        </div>
                        {d.fidelityDisplayName && (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#e2e8f0',
                              color: '#475569',
                            }}
                          >
                            {d.fidelityDisplayName}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <StatusPill status={status} size="xs" />
        </div>

        {/* Center: Command Palette Trigger */}
        <button
          onClick={() => setCmdOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-light, #e2e8f0)',
            background: 'var(--bg-page, #f1f5f9)',
            color: 'var(--text-muted, #64748b)',
            fontSize: '12px',
            cursor: 'pointer',
            minWidth: '220px',
            justifyContent: 'space-between',
            outline: 'none',
          }}
        >
          <span>Search scenarios, chaos...</span>
          <kbd
            style={{
              padding: '1px 5px',
              fontSize: '10px',
              borderRadius: '4px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#475569',
            }}
          >
            ⌘K
          </kbd>
        </button>

        {/* Right: Actions & Panel Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {headerActions}

          {accessibleRows && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTableOpen(true)}
              title="Open Accessible Data Table View (Screen-Reader Friendly)"
            >
              📊 Table View
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTourOpen(true)}
            title="Interactive Feature Tour (?)"
          >
            💡 Tour
          </Button>

          <Button
            size="sm"
            variant={leftOpen ? 'secondary' : 'outline'}
            onClick={() => setLeftOpen((prev) => !prev)}
            title="Toggle Controls Rail"
          >
            🎛️ Controls
          </Button>

          {rightPanel && (
            <Button
              size="sm"
              variant={rightOpen ? 'secondary' : 'outline'}
              onClick={() => setRightOpen((prev) => !prev)}
              title="Toggle Inspector Drawer"
            >
              🔍 Inspector
            </Button>
          )}
        </div>
      </header>

      {/* 2. Main Center Body Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Left Rail: Controls & Chaos Panel */}
        {leftPanel && (
          <aside
            style={{
              width: leftOpen ? '320px' : '0px',
              transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
              background: 'var(--bg-white, #ffffff)',
              borderRight: leftOpen ? '1px solid var(--border-light, #e2e8f0)' : 'none',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              zIndex: 20,
            }}
          >
            <div
              style={{
                width: '320px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-light, #e2e8f0)',
                  fontWeight: 600,
                  fontSize: '13px',
                  color: 'var(--text-secondary, #334155)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{leftPanelTitle}</span>
                <span
                  style={{
                    fontSize: '11px',
                    color: domainTheme.primary,
                    fontWeight: 700,
                  }}
                >
                  {activeDomain.name}
                </span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>{leftPanel}</div>
            </div>
          </aside>
        )}

        {/* Center: Canvas Workspace */}
        <main
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>

          {/* Bottom Bar: Timeline & Scrubbing Controls */}
          {bottomBar && (
            <div
              style={{
                background: 'var(--bg-white, #ffffff)',
                borderTop: '1px solid var(--border-light, #e2e8f0)',
                zIndex: 25,
                flexShrink: 0,
              }}
            >
              {bottomBar}
            </div>
          )}
        </main>

        {/* Right Rail: Entity Inspector Drawer */}
        {rightPanel && (
          <aside
            style={{
              width: rightOpen ? '360px' : '0px',
              transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
              background: 'var(--bg-white, #ffffff)',
              borderLeft: rightOpen ? '1px solid var(--border-light, #e2e8f0)' : 'none',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              zIndex: 20,
            }}
          >
            <div
              style={{
                width: '360px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-light, #e2e8f0)',
                  fontWeight: 600,
                  fontSize: '13px',
                  color: 'var(--text-secondary, #334155)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{rightPanelTitle}</span>
                <button
                  onClick={() => setRightOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>{rightPanel}</div>
            </div>
          </aside>
        )}
      </div>

      {/* Global Command Palette */}
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} commands={allCommands} />

      {/* Onboarding Feature Tour */}
      <OnboardingTour isOpen={tourOpen} onClose={() => setTourOpen(false)} />

      {/* Accessible Non-Canvas Data Table View */}
      {accessibleRows && (
        <DataTableModal
          isOpen={tableOpen}
          onClose={() => setTableOpen(false)}
          domainName={activeDomain.name}
          rows={accessibleRows}
        />
      )}
    </div>
  );
};
