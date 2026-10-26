import React from 'react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`ui-state-box ${className}`}>
      <h3 className="ui-state-title">{title}</h3>
      <p className="ui-state-desc">{description}</p>
      {action && <div className="ui-state-action">{action}</div>}
    </div>
  );
}
