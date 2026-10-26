import React from 'react';
import { formatTime } from '../formatting/time.js';

export interface TimeTextProps {
  timestampSec: number | bigint;
  showRelative?: boolean;
  className?: string;
}

export function TimeText({ timestampSec, showRelative = false, className = '' }: TimeTextProps) {
  const { local, utc, relative } = formatTime(timestampSec);

  return (
    <time
      dateTime={new Date(Number(timestampSec) * 1000).toISOString()}
      title={utc}
      className={`ui-time-text ${className}`}
    >
      <span>{showRelative ? `${local} (${relative})` : local}</span>
    </time>
  );
}
