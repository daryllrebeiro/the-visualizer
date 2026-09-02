import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  variant?: 'rect' | 'circle' | 'text';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '16px',
  borderRadius = '6px',
  variant = 'rect',
  style = {},
  className = '',
  ...props
}) => {
  const getRadius = () => {
    if (variant === 'circle') return '50%';
    if (variant === 'text') return '4px';
    return borderRadius;
  };

  return (
    <div
      className={`the-skeleton ${className}`}
      style={{
        width: variant === 'circle' ? height : width,
        height,
        borderRadius: getRadius(),
        background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s infinite linear',
        ...style,
      }}
      {...props}
    />
  );
};
