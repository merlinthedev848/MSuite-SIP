import React from 'react';

export interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
  size?: 'sm' | 'md';
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  dot = false,
  children,
  className = ''
}) => {
  return (
    <span className={`badge badge-${variant} badge-${size} ${className}`}>
      {dot && <span className={`badge-dot badge-dot-${variant}`} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
};
