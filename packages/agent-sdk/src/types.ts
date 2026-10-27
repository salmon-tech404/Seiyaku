import { z } from 'zod';
import { isAddress, getAddress, type Address, type Account, type Chain } from 'viem';
import { type MandateV1InputName } from '@seiyaku/circuit-tools';

export const addressSchema = z
  .string()
  .refine((val): val is Address => isAddress(val), {
    message: 'Invalid Ethereum address',
  })
  .transform((val) => getAddress(val) as Address);

export const limitsSchema = z.object({
  maxTradeBase: z.bigint().nonnegative(),
  maxDailyBase: z.bigint().nonnegative(),
  maxTradesPerDay: z.number().int().min(0).max(65535),
  cooldownSec: z.bigint().nonnegative(),
  expiresAt: z.bigint().nonnegative(),
  withdrawDelaySec: z.bigint().nonnegative(),
});

export type Limits = z.infer<typeof limitsSchema>;

export const limitsInputSchema = z.object({
  maxTradeBase: z.bigint().nonnegative().optional(),
  maxDailyBase: z.bigint().nonnegative().optional(),
  maxTradesPerDay: z.number().int().min(0).max(65535).optional(),
  cooldownSec: z.bigint().nonnegative().optional(),
  expiresAt: z.bigint().nonnegative().optional(),
  withdrawDelaySec: z.bigint().nonnegative().optional(),
});

export type LimitsInput = z.infer<typeof limitsInputSchema>;

export const clientConfigSchema = z.object({
  rpcUrls: z.union([z.string().url(), z.array(z.string().url()).min(1)]),
  vault: addressSchema,
  account: z.custom<Account>().optional(),
  chain: z.custom<Chain>().optional(),
});

export interface ClientConfig {
  rpcUrls: string | string[];
  vault: Address;
  account?: Account | undefined;
  chain?: Chain | undefined;
}

export const checkRequestSchema = z.object({
  side: z.enum(['buy', 'exit']),
  token: addressSchema,
  amountIn: z.union([z.string(), z.bigint()]),
  feeTier: z.number().int().default(500),
  slippageBps: z.number().int().min(0).max(300).default(50),
});

export interface CheckRequest {
  side: 'buy' | 'exit';
  token: Address;
  amountIn: string | bigint;
  feeTier?: number | undefined;
  slippageBps?: number | undefined;
}

export interface Reason {
  code: string;
  name: MandateV1InputName;
  text: string;
  bitIndex: number;
}

export interface TradeParams {
  tokenIn: Address;
  tokenOut: Address;
  feeTier: number;
  amountIn: bigint;
  amountOutMin: bigint;
  deadline: bigint;
}

export interface CheckOutcome {
  allowed: boolean;
  inputBits: number;
  reasons: Reason[];
  localAgrees: boolean;
  block: bigint;
  time: bigint;
  quote?:
    | {
        expectedOut: bigint;
        amountOutMin: bigint;
      }
    | undefined;
  tradeParams?: TradeParams | undefined;
}

export type TradeOutcome =
  | {
      status: 'blocked';
      inputBits: number;
      reasons: Reason[];
      block: bigint;
    }
  | {
      status: 'simulated';
      tradeParams: TradeParams;
      expectedOut: bigint;
      amountOutMin: bigint;
      block: bigint;
    }
  | {
      status: 'sent';
      txHash: `0x${string}`;
      amountOut: bigint;
      gasUsed: bigint;
      blockNumber: bigint;
    }
  | {
      /** The fresh quote taken right before sending is below the minimum the request allowed. Nothing was sent. */
      status: 'slippage_exceeded';
      quotedOut: bigint;
      minimumOut: bigint;
      block: bigint;
    };

export type FreezeOutcome =
  | {
      status: 'simulated';
      block: bigint;
    }
  | {
      status: 'sent';
      txHash: `0x${string}`;
      blockNumber: bigint;
    };

export type TightenOutcome =
  | {
      status: 'simulated';
      nextLimits: Limits;
      removedTokens: Address[];
      block: bigint;
    }
  | {
      status: 'sent';
      txHash: `0x${string}`;
      blockNumber: bigint;
    };

export type WaitOutcome =
  | {
      status: 'allowed';
      check: CheckOutcome;
    }
  | {
      status: 'timeout' | 'aborted';
      reason: string;
      lastCheck?: CheckOutcome | undefined;
    };

export interface PendingLoosenSnapshot {
  limits: Limits;
  addTokens: Address[];
  unfreeze: boolean;
  eta: bigint;
}

export interface PendingWithdrawSnapshot {
  token: Address;
  amount: bigint;
  eta: bigint;
}

export interface VaultSnapshot {
  vault: Address;
  owner: Address;
  trader: Address;
  baseToken: Address;
  frozen: boolean;
  limits: Limits;
  counters: {
    dayIndex: bigint;
    tradesToday: number;
    buyVolumeTodayBase: bigint;
    lastBuyAt: bigint;
  };
  allowedTokens: Address[];
  balances: Record<Address, bigint>;
  pendingLoosen: PendingLoosenSnapshot | null;
  pendingWithdraw: PendingWithdrawSnapshot | null;
  block: bigint;
  time: bigint;
}
