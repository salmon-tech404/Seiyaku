import { isAddress, getAddress, type Address } from 'viem';
import type { LimitsData, VaultStateData, VaultLogEvent } from '../../chain/vault.js';
import { DEFAULT_TOKENS } from '../../chain/config.js';
import { formatAmount } from '../../shared/formatting/amount.js';
import { formatTime } from '../../shared/formatting/time.js';
import type { TranslationKey } from '../../shared/i18n/index.js';

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

/**
 * Formats a token balance showing at most maxFractionDigits (default 6) with Intl.NumberFormat,
 * while returning the full precision value for tooltip display.
 */
export function formatTokenBalance(
  amount: bigint,
  decimals: number = 18,
  unit?: string,
  maxFractionDigits: number = 6,
): { formatted: string; full: string } {
  const isNegative = amount < 0n;
  const absVal = isNegative ? -amount : amount;
  const divisor = 10n ** BigInt(decimals);

  let integerPart = absVal / divisor;
  const fractionPart = absVal % divisor;

  // Full precision representation
  const fullFracPadded = fractionPart.toString().padStart(decimals, '0');
  const fullFracTrimmed = fullFracPadded.replace(/0+$/, '');
  const fullValStr =
    fullFracTrimmed.length > 0 ? `${integerPart}.${fullFracTrimmed}` : `${integerPart}`;
  const full = `${isNegative ? '-' : ''}${fullValStr}${unit ? ` ${unit}` : ''}`;

  // Formatted with at most maxFractionDigits using Intl.NumberFormat
  let formattedValStr: string;
  if (decimals <= maxFractionDigits) {
    const intStr = new Intl.NumberFormat('en-US').format(integerPart);
    let fracStr = fractionPart.toString().padStart(decimals, '0').replace(/0+$/, '');
    if (fracStr.length === 0) {
      fracStr = '00';
    } else if (fracStr.length === 1) {
      fracStr = `${fracStr}0`;
    }
    formattedValStr = `${intStr}.${fracStr}`;
  } else {
    const scaleFactor = 10n ** BigInt(decimals - maxFractionDigits);
    const halfScale = scaleFactor / 2n;
    const rem = fractionPart % scaleFactor;
    let baseFraction = fractionPart / scaleFactor;

    if (rem >= halfScale) {
      baseFraction += 1n;
      const maxLimit = 10n ** BigInt(maxFractionDigits);
      if (baseFraction >= maxLimit) {
        integerPart += 1n;
        baseFraction = 0n;
      }
    }

    const intStr = new Intl.NumberFormat('en-US').format(integerPart);
    let fracStr = baseFraction.toString().padStart(maxFractionDigits, '0').replace(/0+$/, '');
    if (fracStr.length === 0) {
      fracStr = '00';
    } else if (fracStr.length === 1) {
      fracStr = `${fracStr}0`;
    }
    formattedValStr = `${intStr}.${fracStr}`;
  }

  const formatted = `${isNegative ? '-' : ''}${formattedValStr}${unit ? ` ${unit}` : ''}`;
  return { formatted, full };
}

/**
 * Formats a token address as symbol + short address (e.g. "WOKB (0xe7b4...)" or "USDC").
 */
export function formatTokenOption(
  address: string,
  knownTokens?: Record<string, { symbol: string; address: string }>,
): string {
  if (!address || !isAddress(address)) return address;
  const normalized = getAddress(address);

  if (knownTokens) {
    for (const token of Object.values(knownTokens)) {
      if (token.address.toLowerCase() === normalized.toLowerCase()) {
        const short = `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
        return token.symbol === 'USDC' ? 'USDC' : `${token.symbol} (${short})`;
      }
    }
  }

  if (normalized.toLowerCase() === DEFAULT_TOKENS.wokb.address.toLowerCase()) {
    const short = `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
    return `WOKB (${short})`;
  }
  if (normalized.toLowerCase() === DEFAULT_TOKENS.usdc.address.toLowerCase()) {
    return 'USDC';
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

export interface PendingSummary {
  type: 'none' | 'loosen' | 'withdraw';
  eta: bigint;
  isReady: boolean;
  diffSec: number;
}

export function getNextPendingSummary(
  pendingLoosenEta: bigint,
  pendingWithdrawEta: bigint,
  nowSec: number,
): PendingSummary {
  const hasLoosen = pendingLoosenEta > 0n;
  const hasWithdraw = pendingWithdrawEta > 0n;

  if (!hasLoosen && !hasWithdraw) {
    return { type: 'none', eta: 0n, isReady: false, diffSec: 0 };
  }

  let chosenType: 'loosen' | 'withdraw';
  let chosenEta: bigint;

  if (hasLoosen && !hasWithdraw) {
    chosenType = 'loosen';
    chosenEta = pendingLoosenEta;
  } else if (!hasLoosen && hasWithdraw) {
    chosenType = 'withdraw';
    chosenEta = pendingWithdrawEta;
  } else {
    if (pendingLoosenEta <= pendingWithdrawEta) {
      chosenType = 'loosen';
      chosenEta = pendingLoosenEta;
    } else {
      chosenType = 'withdraw';
      chosenEta = pendingWithdrawEta;
    }
  }

  const diffSec = Number(chosenEta) - nowSec;
  return {
    type: chosenType,
    eta: chosenEta,
    isReady: diffSec <= 0,
    diffSec: Math.max(0, diffSec),
  };
}

export interface FormattedLogEvent {
  title: string;
  detail: string;
  timestampSec: number;
  relative: string;
  localTime: string;
}

export function formatLogEvent(
  log: VaultLogEvent,
  currentBlock: bigint = 0n,
  currentTimeSec: number = Math.floor(Date.now() / 1000),
  t?: (key: TranslationKey, params?: Record<string, string | number>) => string,
): FormattedLogEvent {
  const title = log.eventName;
  let detail = '';

  const translate = (
    key: TranslationKey,
    params?: Record<string, string | number>,
    fallback?: string,
  ) => {
    if (t) {
      try {
        return t(key, params);
      } catch {
        // Fallback
      }
    }
    return fallback ?? key;
  };

  if (log.eventName === 'Deposited') {
    const rawAmt = log.args.amount !== undefined ? BigInt(String(log.args.amount)) : 0n;
    const formattedAmt = formatAmount(rawAmt, 6);
    detail = translate(
      'dashboard.activity.deposited',
      { amount: formattedAmt },
      `+${formattedAmt} USDC`,
    );
  } else if (log.eventName === 'Traded') {
    const isExit = Boolean(log.args.isExit);
    const amountIn = log.args.amountIn !== undefined ? BigInt(String(log.args.amountIn)) : 0n;
    const amountOut = log.args.amountOut !== undefined ? BigInt(String(log.args.amountOut)) : 0n;

    if (!isExit) {
      // Buy: USDC -> WOKB
      const inFormatted = formatAmount(amountIn, 6, 'USDC');
      const outFormatted = formatTokenBalance(amountOut, 18, 'WOKB').formatted;
      detail = translate(
        'dashboard.activity.bought',
        { in: inFormatted, out: outFormatted },
        `Bought ${outFormatted} for ${inFormatted}`,
      );
    } else {
      // Exit: WOKB -> USDC
      const inFormatted = formatTokenBalance(amountIn, 18, 'WOKB').formatted;
      const outFormatted = formatAmount(amountOut, 6, 'USDC');
      detail = translate(
        'dashboard.activity.sold',
        { in: inFormatted, out: outFormatted },
        `Sold ${inFormatted} for ${outFormatted}`,
      );
    }
  } else if (log.eventName === 'WithdrawExecuted') {
    const rawAmt = log.args.amount !== undefined ? BigInt(String(log.args.amount)) : 0n;
    detail = `-${formatAmount(rawAmt, 6, 'USDC')}`;
  } else if (log.eventName === 'WithdrawRequested') {
    const rawAmt = log.args.amount !== undefined ? BigInt(String(log.args.amount)) : 0n;
    detail = `Requested ${formatAmount(rawAmt, 6, 'USDC')}`;
  }

  let timestampSec = currentTimeSec;
  if (currentBlock > 0n && log.blockNumber > 0n && currentBlock >= log.blockNumber) {
    const blockDelta = Number(currentBlock - log.blockNumber);
    timestampSec = Math.max(0, currentTimeSec - blockDelta * 2);
  }

  const { local, relative } = formatTime(timestampSec, currentTimeSec);

  return {
    title,
    detail,
    timestampSec,
    relative,
    localTime: local,
  };
}
