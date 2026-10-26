// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChainClock } from './useChainClock.js';

describe('useChainClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes to the provided block timestamp', () => {
    const blockTime = 1774000000;
    const { result } = renderHook(() => useChainClock(blockTime));
    expect(result.current).toBe(blockTime);
  });

  it('advances estimated chain time as fake time ticks', () => {
    const blockTime = 1774000000;
    const { result } = renderHook(() => useChainClock(blockTime));

    act(() => {
      vi.advanceTimersByTime(3000); // 3 seconds elapsed
    });

    expect(result.current).toBe(blockTime + 3);

    act(() => {
      vi.advanceTimersByTime(7000); // 7 more seconds
    });

    expect(result.current).toBe(blockTime + 10);
  });

  it('re-anchors when a fresh block timestamp arrives', () => {
    let blockTime = 1774000000;
    const { result, rerender } = renderHook(({ t }) => useChainClock(t), {
      initialProps: { t: blockTime },
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(blockTime + 5);

    // New block mined onchain 12 seconds in the future
    blockTime = 1774000012;
    rerender({ t: blockTime });

    expect(result.current).toBe(1774000012);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(1774000014);
  });
});
