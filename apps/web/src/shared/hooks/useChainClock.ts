import { useState, useEffect, useRef } from 'react';

/**
 * apps/web/src/shared/hooks/useChainClock.ts
 *
 * Tracks an estimate of onchain time (in Unix seconds) based on the latest block timestamp
 * observed from RPC plus local elapsed performance time since that block was read.
 * Prevents countdown drift when browser clock and chain clock differ.
 */
export function useChainClock(latestBlockTimestampSec?: bigint | number): number {
  const [chainTimeSec, setChainTimeSec] = useState<number>(() => {
    return latestBlockTimestampSec != null
      ? Number(latestBlockTimestampSec)
      : Math.floor(Date.now() / 1000);
  });

  const anchorRef = useRef<{ blockTimeSec: number; localAnchorMs: number }>({
    blockTimeSec:
      latestBlockTimestampSec != null
        ? Number(latestBlockTimestampSec)
        : Math.floor(Date.now() / 1000),
    localAnchorMs: Date.now(),
  });

  useEffect(() => {
    if (latestBlockTimestampSec != null) {
      anchorRef.current = {
        blockTimeSec: Number(latestBlockTimestampSec),
        localAnchorMs: Date.now(),
      };
      setChainTimeSec(Number(latestBlockTimestampSec));
    }
  }, [latestBlockTimestampSec]);

  useEffect(() => {
    const tick = () => {
      const nowMs = Date.now();
      const elapsedSec = Math.floor((nowMs - anchorRef.current.localAnchorMs) / 1000);
      setChainTimeSec(anchorRef.current.blockTimeSec + elapsedSec);
    };

    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return chainTimeSec;
}
