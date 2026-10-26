import React from 'react';

export type ChipVariant =
  | 'active'
  | 'frozen'
  | 'expired'
  | 'pending'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info';

export interface ChipProps {
  variant?: ChipVariant;
  children: React.ReactNode;
  className?: string;
}

export function Chip({ variant = 'info', children, className = '' }: ChipProps) {
  let styleVariant = variant as string;
  if (variant === 'active') styleVariant = 'success';
  if (variant === 'frozen') styleVariant = 'danger';
  if (variant === 'expired') styleVariant = 'warning';
  if (variant === 'pending') styleVariant = 'info';

  return <span className={`ui-chip ui-chip-${styleVariant} ${className}`}>{children}</span>;
}
