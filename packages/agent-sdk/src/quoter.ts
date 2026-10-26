import { type Address, type PublicClient } from 'viem';
import { quoterV2Abi } from './abi/index.js';

export const XLAYER_QUOTER_V2: Address = '0xD1b797D92d87B688193A2B976eFc8D577D204343';

export interface QuoteParams {
  quoterAddress?: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  feeTier: number;
  slippageBps?: number;
}

export interface QuoteResult {
  expectedOut: bigint;
  amountOutMin: bigint;
  slippageBps: number;
}

/**
 * Queries Uniswap QuoterV2 for expected output and computes amountOutMin based on slippage tolerance.
 * Enforces maximum slippage of 300 bps (3.0%).
 */
export async function getQuote(client: PublicClient, params: QuoteParams): Promise<QuoteResult> {
  const slippageBps = params.slippageBps ?? 50;
  if (slippageBps < 0 || slippageBps > 300) {
    throw new Error(`Slippage ${slippageBps} bps is invalid (allowed: 0 to 300 bps)`);
  }

  const quoterAddress = params.quoterAddress || XLAYER_QUOTER_V2;

  try {
    const res = await client.simulateContract({
      address: quoterAddress,
      abi: quoterV2Abi,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amountIn,
          fee: params.feeTier,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    const expectedOut = res.result[0];
    if (expectedOut <= 0n) {
      throw new Error('Quoter returned zero output');
    }

    // amountOutMin = expectedOut * (10000 - slippageBps) / 10000
    const factor = 10000n - BigInt(slippageBps);
    const amountOutMin = (expectedOut * factor) / 10000n;

    return {
      expectedOut,
      amountOutMin: amountOutMin > 0n ? amountOutMin : 1n,
      slippageBps,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Quote simulation failed: ${message}`);
  }
}
