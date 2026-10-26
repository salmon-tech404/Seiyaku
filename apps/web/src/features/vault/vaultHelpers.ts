import type { Address } from 'viem';
import type { LimitsData, VaultStateData } from '../../chain/vault.js';

export type UserRole = 'owner' | 'trader' | 'stranger';

export function getUserRole(
  connectedAccount: Address | null | undefined,
  vaultOwner: Address,
  vaultTrader: Address,
): UserRole {
  if (!connectedAccount) return 'stranger';
  const acc = connectedAccount.toLowerCase();
  if (acc === vaultOwner.toLowerCase()) return 'owner';
  if (acc === vaultTrader.toLowerCase()) return 'trader';
  return 'stranger';
}

/**
 * Checks whether proposed limits are strictly stricter or equal to current limits.
 * Corresponds to LimitsLib.isStricterOrEqual:
 * maxTradeBase <= cur.maxTradeBase
 * maxDailyBase <= cur.maxDailyBase
 * maxTradesPerDay <= cur.maxTradesPerDay
 * cooldownSec >= cur.cooldownSec
 * expiresAt <= cur.expiresAt
 * withdrawDelaySec >= cur.withdrawDelaySec
 */
export function isStricterOrEqual(next: LimitsData, cur: LimitsData): boolean {
  return (
    next.maxTradeBase <= cur.maxTradeBase &&
    next.maxDailyBase <= cur.maxDailyBase &&
    next.maxTradesPerDay <= cur.maxTradesPerDay &&
    next.cooldownSec >= cur.cooldownSec &&
    next.expiresAt <= cur.expiresAt &&
    next.withdrawDelaySec >= cur.withdrawDelaySec
  );
}

export interface LimitsDiffItem {
  key: string;
  currentValue: string;
  nextValue: string;
  isStricter: boolean;
  isLooser: boolean;
}

export function computeLimitsDiff(cur: LimitsData, next: LimitsData): LimitsDiffItem[] {
  return [
    {
      key: 'maxTrade',
      currentValue: `${Number(cur.maxTradeBase) / 1e6} USDC`,
      nextValue: `${Number(next.maxTradeBase) / 1e6} USDC`,
      isStricter: next.maxTradeBase < cur.maxTradeBase,
      isLooser: next.maxTradeBase > cur.maxTradeBase,
    },
    {
      key: 'maxDaily',
      currentValue: `${Number(cur.maxDailyBase) / 1e6} USDC`,
      nextValue: `${Number(next.maxDailyBase) / 1e6} USDC`,
      isStricter: next.maxDailyBase < cur.maxDailyBase,
      isLooser: next.maxDailyBase > cur.maxDailyBase,
    },
    {
      key: 'maxTradesPerDay',
      currentValue: `${cur.maxTradesPerDay}`,
      nextValue: `${next.maxTradesPerDay}`,
      isStricter: next.maxTradesPerDay < cur.maxTradesPerDay,
      isLooser: next.maxTradesPerDay > cur.maxTradesPerDay,
    },
    {
      key: 'cooldown',
      currentValue: `${cur.cooldownSec}s`,
      nextValue: `${next.cooldownSec}s`,
      isStricter: next.cooldownSec > cur.cooldownSec,
      isLooser: next.cooldownSec < cur.cooldownSec,
    },
    {
      key: 'expiry',
      currentValue: new Date(Number(cur.expiresAt) * 1000).toISOString().split('T')[0] ?? '',
      nextValue: new Date(Number(next.expiresAt) * 1000).toISOString().split('T')[0] ?? '',
      isStricter: next.expiresAt < cur.expiresAt,
      isLooser: next.expiresAt > cur.expiresAt,
    },
    {
      key: 'withdrawDelay',
      currentValue: `${cur.withdrawDelaySec}s`,
      nextValue: `${next.withdrawDelaySec}s`,
      isStricter: next.withdrawDelaySec > cur.withdrawDelaySec,
      isLooser: next.withdrawDelaySec < cur.withdrawDelaySec,
    },
  ];
}

export function getRolledDayStats(state: VaultStateData, nowSec: number) {
  const currentDayIndex = BigInt(Math.floor(nowSec / 86400));
  const isRolled = state.dayIndex !== currentDayIndex;

  const tradesToday = isRolled ? 0 : state.tradesToday;
  const buyVolumeTodayBase = isRolled ? 0n : state.buyVolumeTodayBase;

  const secondsUntilMidnight = 86400 - (nowSec % 86400);

  return {
    dayIndex: currentDayIndex,
    tradesToday,
    buyVolumeTodayBase,
    secondsUntilMidnight,
  };
}
