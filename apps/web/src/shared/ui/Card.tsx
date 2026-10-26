import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  children: React.ReactNode;
}

export function Card({ selected = false, children, className = '', ...props }: CardProps) {
  return (
    <div className={`ui-card ${selected ? 'ui-card-selected' : ''} ${className}`} {...props}>
      {children}
    </div>
  );
}
