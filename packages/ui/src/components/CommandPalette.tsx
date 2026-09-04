import React, { useEffect, useState } from 'react';

export interface CommandItem {
  id: string;
  title: string;
  category: string;
  icon?: string;
  shortcut?: string;
  action: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filtered = commands.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filtered[selectedIndex];
      if (selected) {
        selected.action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          animation: 'fadeIn 120ms ease-out',
        }}
      />

      {/* Palette Container */}
      <div
        style={{
          position: 'relative',
          zIndex: 201,
          width: '100%',
          maxWidth: '540px',
          background: 'var(--bg-white, #ffffff)',
          borderRadius: '14px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border-light, #e2e8f0)',
          overflow: 'hidden',
          fontFamily: 'Inter, system-ui, sans-serif',
          animation: 'scaleIn 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-light, #e2e8f0)',
          }}
        >
          <span style={{ fontSize: '18px', color: '#94a3b8' }}>🔍</span>
          <input
            type="text"
            autoFocus
            placeholder="Type a domain name, chaos action, or scenario..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '15px',
              fontFamily: 'inherit',
              color: 'var(--text-primary, #0f172a)',
              background: 'transparent',
            }}
          />
          <kbd
            style={{
              padding: '2px 6px',
              fontSize: '11px',
              borderRadius: '4px',
              background: '#f1f5f9',
              color: '#64748b',
              border: '1px solid #cbd5e1',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-muted, #64748b)',
                fontSize: '13px',
              }}
            >
              No matching commands or domains found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: isSelected ? '#eff6ff' : 'transparent',
                    color: isSelected ? '#1e40af' : 'var(--text-primary, #0f172a)',
                    transition: 'background 100ms ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {item.icon && <span style={{ fontSize: '16px' }}>{item.icon}</span>}
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{item.category}</div>
                    </div>
                  </div>
                  {item.shortcut && (
                    <kbd
                      style={{
                        padding: '2px 6px',
                        fontSize: '11px',
                        borderRadius: '4px',
                        background: isSelected ? '#dbeafe' : '#f1f5f9',
                        color: isSelected ? '#1e40af' : '#64748b',
                        border: '1px solid #cbd5e1',
                      }}
                    >
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
