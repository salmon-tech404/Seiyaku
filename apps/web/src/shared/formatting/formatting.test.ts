import { describe, it, expect } from 'vitest';
import { formatAmount } from './amount.js';
import { formatTime } from './time.js';
import { formatShortAddress } from './address.js';

describe('formatAmount', () => {
  it('formats standard 6-decimal token amounts (USDC)', () => {
    expect(formatAmount(1000000n, 6)).toBe('1.00');
    expect(formatAmount(25500000n, 6, 'USDC')).toBe('25.50 USDC');
    expect(formatAmount(123456789n, 6, 'USDC')).toBe('123.456789 USDC');
  });

  it('formats whole integer amounts', () => {
    expect(formatAmount(500000000n, 6, 'USDC')).toBe('500.00 USDC');
    expect(formatAmount(0n, 6, 'USDC')).toBe('0.00 USDC');
  });

  it('formats zero-decimal amounts', () => {
    expect(formatAmount(42n, 0, 'NFT')).toBe('42 NFT');
    expect(formatAmount(1000n, 0)).toBe('1,000');
  });

  it('formats negative amounts', () => {
    expect(formatAmount(-5000000n, 6, 'USDC')).toBe('-5.00 USDC');
  });
});

describe('formatTime with fixed clock inputs', () => {
  const FIXED_NOW_SEC = 1700000000; // Reference timestamp

  it('formats relative seconds remaining', () => {
    const res = formatTime(FIXED_NOW_SEC + 45, FIXED_NOW_SEC);
    expect(res.relative).toBe('45s remaining');
  });

  it('formats relative minutes remaining and past', () => {
    const future = formatTime(FIXED_NOW_SEC + 300, FIXED_NOW_SEC);
    expect(future.relative).toBe('in 5m');

    const past = formatTime(FIXED_NOW_SEC - 600, FIXED_NOW_SEC);
    expect(past.relative).toBe('10m ago');
  });

  it('formats relative hours remaining and past', () => {
    const future = formatTime(FIXED_NOW_SEC + 7200, FIXED_NOW_SEC);
    expect(future.relative).toBe('in 2h');

    const past = formatTime(FIXED_NOW_SEC - 10800, FIXED_NOW_SEC);
    expect(past.relative).toBe('3h ago');
  });

  it('formats relative days remaining and past', () => {
    const future = formatTime(FIXED_NOW_SEC + 86400 * 3, FIXED_NOW_SEC);
    expect(future.relative).toBe('in 3d');

    const past = formatTime(FIXED_NOW_SEC - 86400 * 5, FIXED_NOW_SEC);
    expect(past.relative).toBe('5d ago');
  });

  it('provides valid UTC string in output', () => {
    const res = formatTime(FIXED_NOW_SEC, FIXED_NOW_SEC);
    expect(res.utc).toContain('GMT');
  });
});

describe('formatShortAddress', () => {
  it('shortens standard Ethereum address', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    expect(formatShortAddress(addr)).toBe('0x1234...5678');
  });

  it('returns short string unchanged', () => {
    expect(formatShortAddress('0x123')).toBe('0x123');
    expect(formatShortAddress('')).toBe('');
  });
});
