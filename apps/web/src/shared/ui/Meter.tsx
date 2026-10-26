import React from 'react';

export interface MeterProps {
  label: string;
  value: number;
  max: number;
  unit?: string;
  displayValue?: string;
}

export function Meter({ label, value, max, unit, displayValue }: MeterProps) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const valueText =
    displayValue ?? `${value}${unit ? ` ${unit}` : ''} / ${max}${unit ? ` ${unit}` : ''}`;

  return (
    <div
      className="ui-meter"
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className="ui-meter-header">
        <span>{label}</span>
        <span>{valueText}</span>
      </div>
      <div className="ui-meter-bar-track">
        <div className="ui-meter-bar-fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
