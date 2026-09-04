import React from 'react';

import { Button, type ButtonProps } from './Button.js';

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'iconPosition'> {
  'aria-label': string;
  icon: React.ReactNode;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  size = 'md',
  style = {},
  ...props
}) => {
  const sizeMap: Record<string, string> = {
    sm: '28px',
    md: '34px',
    lg: '40px',
  };

  const dim = sizeMap[size] ?? '34px';

  return (
    <Button
      size={size}
      style={{
        width: dim,
        height: dim,
        padding: 0,
        borderRadius: '8px',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    >
      {icon}
    </Button>
  );
};
