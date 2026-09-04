/**
 * Design Tokens & Theme Constants for TheVisualizer Platform
 */

export interface DomainColorTheme {
  primary: string;
  subtle: string;
  border: string;
  glow: string;
}

export const DOMAIN_COLORS: Record<string, DomainColorTheme> = {
  kafka: {
    primary: '#10b981', // Emerald green
    subtle: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.3)',
    glow: '0 0 20px rgba(16, 185, 129, 0.25)',
  },
  raft: {
    primary: '#8b5cf6', // Purple
    subtle: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.3)',
    glow: '0 0 20px rgba(139, 92, 246, 0.25)',
  },
  database: {
    primary: '#ec4899', // Pink / Magenta
    subtle: 'rgba(236, 72, 153, 0.12)',
    border: 'rgba(236, 72, 153, 0.3)',
    glow: '0 0 20px rgba(236, 72, 153, 0.25)',
  },
  redis: {
    primary: '#ef4444', // Red
    subtle: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.3)',
    glow: '0 0 20px rgba(239, 68, 68, 0.25)',
  },
  kubernetes: {
    primary: '#3b82f6', // Blue
    subtle: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.3)',
    glow: '0 0 20px rgba(59, 130, 246, 0.25)',
  },
  rabbitmq: {
    primary: '#f97316', // Orange
    subtle: 'rgba(249, 115, 22, 0.12)',
    border: 'rgba(249, 115, 22, 0.3)',
    glow: '0 0 20px rgba(249, 115, 22, 0.25)',
  },
  storage: {
    primary: '#14b8a6', // Teal
    subtle: 'rgba(20, 184, 166, 0.12)',
    border: 'rgba(20, 184, 166, 0.3)',
    glow: '0 0 20px rgba(20, 184, 166, 0.25)',
  },
  networking: {
    primary: '#06b6d4', // Cyan
    subtle: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.3)',
    glow: '0 0 20px rgba(6, 182, 212, 0.25)',
  },
};

export const SPACING = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
} as const;

export const RADII = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  pill: '9999px',
} as const;

export const SHADOWS = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  glow: (color: string) => `0 0 15px ${color}`,
} as const;

export const TRANSITIONS = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)',
  spring: '500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;
