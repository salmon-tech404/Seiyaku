import { MANDATE_V1_INPUTS, type MandateV1InputName } from './mandateV1.js';
import type { Limits, VaultState, TradeRequest } from './vaultState.js';

export interface RolledCounters {
  dayIndex: bigint;
  tradesToday: number;
  buyVolumeTodayBase: bigint;
}

export interface InputBitsResult {
  bits: number;
  names: Record<MandateV1InputName, 0 | 1>;
  kind: 'buy' | 'exit' | 'invalid';
  rolled: RolledCounters;
}

const SUPPORTED_FEE_TIERS = new Set<number>([500, 3000, 10000]);

/**
 * Computes rolled counters for the current UTC day.
 * UTC day index is calculated as timestamp / 86400n.
 */
export function rollDayCounters(
  currentDayIndex: bigint,
  tradesToday: number,
  buyVolumeTodayBase: bigint,
  now: bigint,
): RolledCounters {
  const targetDayIndex = now / 86400n;
  if (targetDayIndex !== currentDayIndex) {
    return {
      dayIndex: targetDayIndex,
      tradesToday: 0,
      buyVolumeTodayBase: 0n,
    };
  }
  return {
    dayIndex: currentDayIndex,
    tradesToday,
    buyVolumeTodayBase,
  };
}

/**
 * Computes the 9 input bits for MANDATE_V1 according to the exact rules in 10_P2_SPEC_ADDENDUM.md.
 */
export function computeInputBits(
  state: VaultState,
  limits: Limits,
  request: TradeRequest,
): InputBitsResult {
  const base = state.baseToken.toLowerCase();
  const tokenIn = request.tokenIn.toLowerCase();
  const tokenOut = request.tokenOut.toLowerCase();

  const isBuy = tokenIn === base && tokenOut !== base;
  const isExitTrade = tokenOut === base && tokenIn !== base;
  const kind: 'buy' | 'exit' | 'invalid' = isBuy ? 'buy' : isExitTrade ? 'exit' : 'invalid';

  // 1. Roll day counters for read-only view
  const rolled = rollDayCounters(
    state.dayIndex,
    state.tradesToday,
    state.buyVolumeTodayBase,
    state.now,
  );

  // 2. Compute individual rule conditions
  const balanceIn = state.balances.get(tokenIn) ?? 0n;

  // sane: amountIn > 0, amountOutMin > 0, now <= deadline <= now + 600,
  // buy or exit as defined, feeTier in {500, 3000, 10000}, amountIn <= balanceOf(this) of tokenIn
  const saneCondition =
    request.amountIn > 0n &&
    request.amountOutMin > 0n &&
    request.deadline >= state.now &&
    request.deadline <= state.now + 600n &&
    (isBuy || isExitTrade) &&
    SUPPORTED_FEE_TIERS.has(request.feeTier) &&
    request.amountIn <= balanceIn;

  // tokenAllowed: for a buy, allowed[tokenOut]. For an exit, allowed[tokenIn] for informative explanation
  const nonBaseToken = isBuy ? tokenOut : tokenIn;
  const tokenAllowedCondition = state.allowedTokens.has(nonBaseToken);

  // notExpired: now <= limits.expiresAt
  const notExpiredCondition = state.now <= limits.expiresAt;

  // notFrozen: !frozen
  const notFrozenCondition = !state.frozen;

  // sizeOk: for buy: amountIn <= maxTradeBase; for exit: 1
  const sizeOkCondition = isExitTrade ? true : request.amountIn <= limits.maxTradeBase;

  // dailyOk: for buy: buyVolumeTodayBase + amountIn <= maxDailyBase; for exit: 1
  const dailyOkCondition = isExitTrade
    ? true
    : rolled.buyVolumeTodayBase + request.amountIn <= limits.maxDailyBase;

  // tradesOk: for buy: tradesToday < maxTradesPerDay; for exit: 1
  const tradesOkCondition = isExitTrade ? true : rolled.tradesToday < limits.maxTradesPerDay;

  // cooldownOk: for buy: now >= lastBuyAt + cooldownSec (or lastBuyAt == 0); for exit: 1
  const cooldownOkCondition = isExitTrade
    ? true
    : state.lastBuyAt === 0n || state.now >= state.lastBuyAt + limits.cooldownSec;

  // isExit: tokenOut == baseToken && tokenIn != baseToken
  const isExitCondition = isExitTrade;

  const names: Record<MandateV1InputName, 0 | 1> = {
    sane: saneCondition ? 1 : 0,
    tokenAllowed: tokenAllowedCondition ? 1 : 0,
    notExpired: notExpiredCondition ? 1 : 0,
    notFrozen: notFrozenCondition ? 1 : 0,
    sizeOk: sizeOkCondition ? 1 : 0,
    dailyOk: dailyOkCondition ? 1 : 0,
    tradesOk: tradesOkCondition ? 1 : 0,
    cooldownOk: cooldownOkCondition ? 1 : 0,
    isExit: isExitCondition ? 1 : 0,
  };

  let bits = 0;
  for (let i = 0; i < MANDATE_V1_INPUTS.length; i++) {
    const inputName = MANDATE_V1_INPUTS[i];
    if (inputName && names[inputName] === 1) {
      bits |= 1 << i;
    }
  }

  return {
    bits,
    names,
    kind,
    rolled,
  };
}
