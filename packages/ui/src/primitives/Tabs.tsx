import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'underline' | 'pills' | 'segmented';
  domainColor?: string;
  size?: 'sm' | 'md';
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  domainColor = '#3b82f6',
  size = 'md',
}) => {
  const isSm = size === 'sm';

  if (variant === 'segmented') {
    return (
      <div
        role="tablist"
        style={{
          display: 'inline-flex',
          background: 'var(--bg-page, #f1f5f9)',
          padding: '3px',
          borderRadius: '8px',
          gap: '2px',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: isSm ? '4px 10px' : '6px 14px',
                fontSize: isSm ? '12px' : '13px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--text-primary, #0f172a)' : 'var(--text-muted, #64748b)',
                background: isActive ? 'var(--bg-white, #ffffff)' : 'transparent',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 150ms ease',
                outline: 'none',
              }}
            >
              {tab.icon && <span>{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge && <span>{tab.badge}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-light, #e2e8f0)',
        gap: variant === 'pills' ? '6px' : '16px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: isSm ? '6px 10px' : '10px 14px',
              fontSize: isSm ? '12px' : '13px',
              fontWeight: isActive ? 600 : 500,
              color: isActive
                ? variant === 'underline'
                  ? domainColor
                  : '#ffffff'
                : 'var(--text-muted, #64748b)',
              background: variant === 'pills' && isActive ? domainColor : 'transparent',
              borderRadius: variant === 'pills' ? '6px' : '0',
              border: 'none',
              borderBottom:
                variant === 'underline'
                  ? `2px solid ${isActive ? domainColor : 'transparent'}`
                  : 'none',
              marginBottom: variant === 'underline' ? '-1px' : '0',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              outline: 'none',
            }}
          >
            {tab.icon && <span>{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge && <span>{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
};
