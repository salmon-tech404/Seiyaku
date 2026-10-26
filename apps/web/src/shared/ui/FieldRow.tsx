import React from 'react';
import { Tooltip } from './Tooltip.js';

export interface FieldRowProps {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
  className?: string;
}

export function FieldRow({ label, tooltip, children, className = '' }: FieldRowProps) {
  return (
    <div className={`ui-field-row ${className}`}>
      <div className="ui-field-label-group">
        <span>{label}</span>
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      <div className="ui-field-control">{children}</div>
    </div>
  );
}
