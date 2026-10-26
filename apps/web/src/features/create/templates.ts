import { parseUnits } from 'viem';

export interface Limits {
  maxTradeBase: bigint;
  maxDailyBase: bigint;
  maxTradesPerDay: number;
  cooldownSec: number;
  expiresAt: bigint;
  withdrawDelaySec: number;
}

export type TemplateId = 'careful' | 'balanced' | 'agent_safe' | 'custom';

export interface TemplateDefinition {
  id: TemplateId;
  nameKey: string;
  descKey: string;
  maxTradeBase: bigint;
  maxDailyBase: bigint;
  maxTradesPerDay: number;
  cooldownSec: number;
  expiryDays: number;
  withdrawDelaySec: number;
}

/**
 * Predefined vault limit templates:
 * - Careful: small sizes (25 USDC), 100 USDC daily, 4 trades/day, long cooldown (1800s = 30m), expiry 14 days, withdraw delay 86400s (24h)
 * - Balanced: 100 USDC per trade, 500 USDC daily, 10 trades/day, cooldown 300s (5m), expiry 30 days, withdraw delay 86400s (24h)
 * - Agent safe: small sizes (50 USDC), 1000 USDC daily, 50 trades/day, short cooldown 60s (1m), expiry 7 days, long withdraw delay 172800s (48h)
 */
export const VAULT_TEMPLATES: Record<Exclude<TemplateId, 'custom'>, TemplateDefinition> = {
  careful: {
    id: 'careful',
    nameKey: 'create.templates.careful.name',
    descKey: 'create.templates.careful.desc',
    maxTradeBase: parseUnits('25', 6),
    maxDailyBase: parseUnits('100', 6),
    maxTradesPerDay: 4,
    cooldownSec: 1800,
    expiryDays: 14,
    withdrawDelaySec: 86400,
  },
  balanced: {
    id: 'balanced',
    nameKey: 'create.templates.balanced.name',
    descKey: 'create.templates.balanced.desc',
    maxTradeBase: parseUnits('100', 6),
    maxDailyBase: parseUnits('500', 6),
    maxTradesPerDay: 10,
    cooldownSec: 300,
    expiryDays: 30,
    withdrawDelaySec: 86400,
  },
  agent_safe: {
    id: 'agent_safe',
    nameKey: 'create.templates.agentSafe.name',
    descKey: 'create.templates.agentSafe.desc',
    maxTradeBase: parseUnits('50', 6),
    maxDailyBase: parseUnits('1000', 6),
    maxTradesPerDay: 50,
    cooldownSec: 60,
    expiryDays: 7,
    withdrawDelaySec: 172800,
  },
};

export function templateToLimits(
  template: TemplateDefinition,
  currentTimestampSec: number,
): Limits {
  return {
    maxTradeBase: template.maxTradeBase,
    maxDailyBase: template.maxDailyBase,
    maxTradesPerDay: template.maxTradesPerDay,
    cooldownSec: template.cooldownSec,
    expiresAt: BigInt(currentTimestampSec + template.expiryDays * 86400),
    withdrawDelaySec: template.withdrawDelaySec,
  };
}
