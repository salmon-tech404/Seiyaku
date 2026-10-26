import { z } from 'zod';
import { isAddress, getAddress, type Address } from 'viem';

/**
 * Zod schema to validate Ethereum addresses and normalize to checksummed/lowercase.
 */
export const addressSchema = z
  .string()
  .refine((val): val is Address => isAddress(val), {
    message: 'Invalid Ethereum address',
  })
  .transform((val) => getAddress(val).toLowerCase() as Address);

/**
 * Numerical limits for mandate vaults.
 * All amounts and timestamps are bigint.
 */
export const limitsSchema = z.object({
  maxTradeBase: z.bigint().nonnegative(),
  maxDailyBase: z.bigint().nonnegative(),
  maxTradesPerDay: z.number().int().min(0).max(65535),
  cooldownSec: z.bigint().nonnegative(),
  expiresAt: z.bigint().nonnegative(),
  withdrawDelaySec: z.bigint().nonnegative(),
});

export type Limits = z.infer<typeof limitsSchema>;

/**
 * Trade request parameters.
 */
export const tradeRequestSchema = z.object({
  tokenIn: addressSchema,
  tokenOut: addressSchema,
  feeTier: z.number().int(),
  amountIn: z.bigint().positive(),
  amountOutMin: z.bigint().positive(),
  deadline: z.bigint().nonnegative(),
});

export type TradeRequest = z.infer<typeof tradeRequestSchema>;

/**
 * Vault internal state snapshot.
 */
export interface VaultState {
  frozen: boolean;
  dayIndex: bigint;
  tradesToday: number;
  buyVolumeTodayBase: bigint;
  lastBuyAt: bigint;
  allowedTokens: ReadonlySet<string>; // lowercased addresses
  balances: ReadonlyMap<string, bigint>; // lowercased address -> bigint balance
  baseToken: Address;
  now: bigint;
}
