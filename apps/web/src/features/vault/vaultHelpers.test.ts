import { describe, it, expect } from 'vitest';
import {
  getUserRole,
  isStricterOrEqual,
  computeLimitsDiff,
  getRolledDayStats,
  formatTokenBalance,
  formatTokenOption,
  getNextPendingSummary,
  formatLogEvent,
} from './vaultHelpers.js';
import type { LimitsData, VaultStateData, VaultLogEvent } from '../../chain/vault.js';
import { DEFAULT_TOKENS } from '../../chain/config.js';

describe('Vault Helpers', () => {
  const owner = '0x1111111111111111111111111111111111111111';
  const trader = '0x2222222222222222222222222222222222222222';
  const stranger = '0x3333333333333333333333333333333333333333';

  it('detects user roles accurately', () => {
    expect(getUserRole(owner, owner, trader)).toBe('owner');
    expect(getUserRole(trader, owner, trader)).toBe('trader');
    expect(getUserRole(stranger, owner, trader)).toBe('stranger');
    expect(getUserRole(null, owner, trader)).toBe('stranger');
    expect(getUserRole(undefined, owner, trader)).toBe('stranger');
  });

  const baseLimits: LimitsData = {
    maxTradeBase: 100_000_000n, // 100 USDC
    maxDailyBase: 500_000_000n, // 500 USDC
    maxTradesPerDay: 10,
    cooldownSec: 300,
    expiresAt: 1800000000n,
    withdrawDelaySec: 86400,
  };

  it('validates stricter or equal limits correctly', () => {
    // Exact same is valid
    expect(isStricterOrEqual(baseLimits, baseLimits)).toBe(true);

    // Stricter: smaller trade limit
    const stricterTrade = { ...baseLimits, maxTradeBase: 50_000_000n };
    expect(isStricterOrEqual(stricterTrade, baseLimits)).toBe(true);

    // Stricter: longer cooldown
    const stricterCooldown = { ...baseLimits, cooldownSec: 600 };
    expect(isStricterOrEqual(stricterCooldown, baseLimits)).toBe(true);

    // Looser: larger trade limit
    const looserTrade = { ...baseLimits, maxTradeBase: 150_000_000n };
    expect(isStricterOrEqual(looserTrade, baseLimits)).toBe(false);

    // Looser: shorter withdraw delay
    const looserDelay = { ...baseLimits, withdrawDelaySec: 3600 };
    expect(isStricterOrEqual(looserDelay, baseLimits)).toBe(false);

    // Looser: longer expiry
    const looserExpiry = { ...baseLimits, expiresAt: 1900000000n };
    expect(isStricterOrEqual(looserExpiry, baseLimits)).toBe(false);
  });

  it('computes limits diff properly', () => {
    const nextLimits: LimitsData = {
      ...baseLimits,
      maxTradeBase: 50_000_000n, // stricter
      cooldownSec: 150, // looser
    };

    const diff = computeLimitsDiff(baseLimits, nextLimits);
    const tradeDiff = diff.find((d) => d.key === 'maxTrade');
    const cooldownDiff = diff.find((d) => d.key === 'cooldown');

    expect(tradeDiff?.isStricter).toBe(true);
    expect(tradeDiff?.isLooser).toBe(false);
    expect(cooldownDiff?.isStricter).toBe(false);
    expect(cooldownDiff?.isLooser).toBe(true);
  });

  it('rolls day counters when UTC day changes', () => {
    const mockState = {
      dayIndex: 100n,
      tradesToday: 5,
      buyVolumeTodayBase: 250_000_000n,
    } as VaultStateData;

    // Same day: 100 * 86400 + 1000
    const sameDaySec = 100 * 86400 + 1000;
    const sameStats = getRolledDayStats(mockState, sameDaySec);
    expect(sameStats.tradesToday).toBe(5);
    expect(sameStats.buyVolumeTodayBase).toBe(250_000_000n);

    // Next day: 101 * 86400 + 500
    const nextDaySec = 101 * 86400 + 500;
    const nextStats = getRolledDayStats(mockState, nextDaySec);
    expect(nextStats.tradesToday).toBe(0);
    expect(nextStats.buyVolumeTodayBase).toBe(0n);
    expect(nextStats.secondsUntilMidnight).toBe(86400 - 500);
  });

  describe('formatTokenBalance', () => {
    it('formats 18 decimal token with at most 6 decimal places and provides full precision', () => {
      // 0.092387980018182294 WOKB
      const amt = 92387980018182294n;
      const res = formatTokenBalance(amt, 18, 'WOKB');
      expect(res.formatted).toBe('0.092388 WOKB');
      expect(res.full).toBe('0.092387980018182294 WOKB');
    });

    it('formats integer token balances with 2 decimal places fallback', () => {
      const amt = 5_000_000_000_000_000_000n; // 5 WOKB
      const res = formatTokenBalance(amt, 18, 'WOKB');
      expect(res.formatted).toBe('5.00 WOKB');
      expect(res.full).toBe('5 WOKB');
    });

    it('formats 6 decimal token balance (USDC) accurately', () => {
      const amt = 100_000_000n; // 100 USDC
      const res = formatTokenBalance(amt, 6, 'USDC');
      expect(res.formatted).toBe('100.00 USDC');
      expect(res.full).toBe('100 USDC');
    });

    it('formats zero balance correctly', () => {
      const res = formatTokenBalance(0n, 6, 'USDC');
      expect(res.formatted).toBe('0.00 USDC');
      expect(res.full).toBe('0 USDC');
    });

    it('handles rounding carry-over to integer', () => {
      // 0.9999999 WOKB -> rounds to 1.00 WOKB
      const amt = 999999900000000000n;
      const res = formatTokenBalance(amt, 18, 'WOKB');
      expect(res.formatted).toBe('1.00 WOKB');
      expect(res.full).toBe('0.9999999 WOKB');
    });
  });

  describe('formatTokenOption', () => {
    it('formats WOKB address with symbol and short address', () => {
      const opt = formatTokenOption(DEFAULT_TOKENS.wokb.address);
      expect(opt).toContain('WOKB');
      expect(opt).toContain('0xe538');
    });

    it('formats USDC as symbol', () => {
      const opt = formatTokenOption(DEFAULT_TOKENS.usdc.address);
      expect(opt).toBe('USDC');
    });

    it('formats unknown address as short address', () => {
      const addr = '0x1234567890123456789012345678901234567890';
      const opt = formatTokenOption(addr);
      expect(opt).toBe('0x1234...7890');
    });
  });

  describe('getNextPendingSummary', () => {
    const now = 10000;

    it('returns none when no events pending', () => {
      const summary = getNextPendingSummary(0n, 0n, now);
      expect(summary.type).toBe('none');
    });

    it('returns loosen when only loosen is pending', () => {
      const summary = getNextPendingSummary(BigInt(now + 3600), 0n, now);
      expect(summary.type).toBe('loosen');
      expect(summary.isReady).toBe(false);
      expect(summary.diffSec).toBe(3600);
    });

    it('returns withdraw when only withdraw is pending', () => {
      const summary = getNextPendingSummary(0n, BigInt(now - 10), now);
      expect(summary.type).toBe('withdraw');
      expect(summary.isReady).toBe(true);
      expect(summary.diffSec).toBe(0);
    });

    it('returns the earlier event when both are pending', () => {
      const earlier = BigInt(now + 120);
      const later = BigInt(now + 3600);
      const summary1 = getNextPendingSummary(earlier, later, now);
      expect(summary1.type).toBe('loosen');

      const summary2 = getNextPendingSummary(later, earlier, now);
      expect(summary2.type).toBe('withdraw');
    });
  });

  describe('formatLogEvent', () => {
    it('formats Deposited event log', () => {
      const log: VaultLogEvent = {
        eventName: 'Deposited',
        blockNumber: 100n,
        transactionHash: '0xabc123',
        args: { amount: 100_000_000n },
      };
      const res = formatLogEvent(log, 105n, 10000);
      expect(res.title).toBe('Deposited');
      expect(res.detail).toContain('100.00 USDC');
      expect(res.relative).toBeDefined();
    });

    it('formats Traded Buy event log', () => {
      const log: VaultLogEvent = {
        eventName: 'Traded',
        blockNumber: 100n,
        transactionHash: '0xabc123',
        args: {
          tokenIn: DEFAULT_TOKENS.usdc.address,
          tokenOut: DEFAULT_TOKENS.wokb.address,
          amountIn: 10_000_000n,
          amountOut: 92387980018182294n,
          isExit: false,
        },
      };
      const res = formatLogEvent(log, 100n, 10000);
      expect(res.title).toBe('Traded');
      expect(res.detail).toContain('Bought');
      expect(res.detail).toContain('0.092388 WOKB');
      expect(res.detail).toContain('10.00 USDC');
    });

    it('formats Traded Exit event log', () => {
      const log: VaultLogEvent = {
        eventName: 'Traded',
        blockNumber: 100n,
        transactionHash: '0xabc123',
        args: {
          tokenIn: DEFAULT_TOKENS.wokb.address,
          tokenOut: DEFAULT_TOKENS.usdc.address,
          amountIn: 92387980018182294n,
          amountOut: 10_000_000n,
          isExit: true,
        },
      };
      const res = formatLogEvent(log, 100n, 10000);
      expect(res.title).toBe('Traded');
      expect(res.detail).toContain('Sold');
      expect(res.detail).toContain('0.092388 WOKB');
      expect(res.detail).toContain('10.00 USDC');
    });
  });
});
