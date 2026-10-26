import { describe, it, expect } from 'vitest';
import {
  getUserRole,
  isStricterOrEqual,
  computeLimitsDiff,
  getRolledDayStats,
} from './vaultHelpers.js';
import type { LimitsData, VaultStateData } from '../../chain/vault.js';

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
});
