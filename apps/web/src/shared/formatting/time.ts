/**
 * Formats a unix timestamp (in seconds) to local time, relative countdown, and UTC string.
 */

export interface FormattedTime {
  local: string;
  utc: string;
  relative: string;
}

export function formatTime(timestampSec: number | bigint, nowSec?: number): FormattedTime {
  const tsMs = Number(timestampSec) * 1000;
  const date = new Date(tsMs);

  const local = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);

  const utc = date.toUTCString();

  const currentSec = nowSec !== undefined ? nowSec : Math.floor(Date.now() / 1000);
  const diffSec = Number(timestampSec) - currentSec;

  let relative = '';
  if (Math.abs(diffSec) < 60) {
    relative = diffSec >= 0 ? `${diffSec}s remaining` : `${Math.abs(diffSec)}s ago`;
  } else if (Math.abs(diffSec) < 3600) {
    const mins = Math.floor(Math.abs(diffSec) / 60);
    relative = diffSec >= 0 ? `in ${mins}m` : `${mins}m ago`;
  } else if (Math.abs(diffSec) < 86400) {
    const hours = Math.floor(Math.abs(diffSec) / 3600);
    relative = diffSec >= 0 ? `in ${hours}h` : `${hours}h ago`;
  } else {
    const days = Math.floor(Math.abs(diffSec) / 86400);
    relative = diffSec >= 0 ? `in ${days}d` : `${days}d ago`;
  }

  return { local, utc, relative };
}
