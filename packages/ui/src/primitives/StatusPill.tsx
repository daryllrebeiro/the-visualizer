import React from 'react';

import { Badge, type BadgeProps } from './Badge.js';

export type ConnectionStatusType =
  'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'ERROR' | 'SANDBOX';

export interface StatusPillProps extends Omit<BadgeProps, 'variant'> {
  status: ConnectionStatusType;
  label?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, label, size = 'sm', ...props }) => {
  const getStatusConfig = (): {
    variant: NonNullable<BadgeProps['variant']>;
    defaultLabel: string;
    dot: boolean;
  } => {
    switch (status) {
      case 'CONNECTED':
        return { variant: 'success', defaultLabel: 'Live Gateway Connected', dot: true };
      case 'SANDBOX':
        return { variant: 'info', defaultLabel: 'In-Browser Sandbox Mode', dot: true };
      case 'CONNECTING':
      case 'RECONNECTING':
        return { variant: 'warning', defaultLabel: 'Connecting...', dot: true };
      case 'ERROR':
        return { variant: 'danger', defaultLabel: 'Connection Error', dot: true };
      case 'DISCONNECTED':
      default:
        return { variant: 'default', defaultLabel: 'Disconnected', dot: false };
    }
  };

  const config = getStatusConfig();

  return (
    <Badge variant={config.variant} size={size} dot={config.dot} {...props}>
      {label ?? config.defaultLabel}
    </Badge>
  );
};
