import React, { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/index.js';

export interface CountdownProps {
  targetTimestampSec: number | bigint;
  currentTimestampSec?: number | bigint;
  onComplete?: () => void;
  className?: string;
}

export function Countdown({
  targetTimestampSec,
  currentTimestampSec,
  onComplete,
  className = '',
}: CountdownProps) {
  const { t } = useTranslation();
  const targetSec = Number(targetTimestampSec);

  const [remaining, setRemaining] = useState<number>(() => {
    const now =
      currentTimestampSec !== undefined
        ? Number(currentTimestampSec)
        : Math.floor(Date.now() / 1000);
    return Math.max(0, targetSec - now);
  });

  useEffect(() => {
    if (currentTimestampSec !== undefined) {
      const rem = Math.max(0, targetSec - Number(currentTimestampSec));
      setRemaining(rem);
      if (rem === 0 && onComplete) {
        onComplete();
      }
      return;
    }

    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const rem = Math.max(0, targetSec - now);
      setRemaining(rem);
      if (rem === 0 && onComplete) {
        onComplete();
      }
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetSec, currentTimestampSec, onComplete]);

  if (remaining <= 0) {
    return (
      <span className={`ui-countdown-ready ${className}`} aria-live="polite">
        {t('countdown.ready')}
      </span>
    );
  }

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(t('countdown.days', { count: days }));
  if (hours > 0 || days > 0) parts.push(t('countdown.hours', { count: hours }));
  if (minutes > 0 || hours > 0 || days > 0) parts.push(t('countdown.minutes', { count: minutes }));
  parts.push(t('countdown.seconds', { count: seconds }));

  return (
    <span className={`ui-countdown ${className}`} aria-live="polite">
      {parts.join(' ')}
    </span>
  );
}
