import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  parseUnits,
  getAddress,
  decodeEventLog,
  type PublicClient,
  type WalletClient,
  type Address,
  type Account,
  type Chain,
  defineChain,
} from 'viem';
import {
  computeInputBits,
  type Limits as CircuitLimits,
  type VaultState as CircuitVaultState,
} from '@seiyaku/circuit-tools';
import { mandateVaultAbi, erc20Abi } from './abi/index.js';
import { getQuote } from './quoter.js';
import { explainInputBits } from './messages.js';
import type {
  ClientConfig,
  CheckRequest,
  CheckOutcome,
  TradeOutcome,
  FreezeOutcome,
  TightenOutcome,
  WaitOutcome,
  VaultSnapshot,
  Limits,
  LimitsInput,
  TradeParams,
} from './types.js';

export const xLayerChain: Chain = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.xlayer.tech'] },
  },
  blockExplorers: {
    default: { name: 'OKLink', url: 'https://www.oklink.com/xlayer' },
  },
});

export const DEFAULT_ALLOWLIST_TOKENS: Record<number, Address[]> = {
  196: [getAddress('0xe538905cf8410324e03a5a23c1c177a474d59b2b')], // WOKB
};

export class AgentClient {
  public readonly publicClient: PublicClient;
  public readonly walletClient?: WalletClient;
  public readonly vault: Address;
  public readonly account?: Account | undefined;
  public readonly chain: Chain;

  constructor(config: ClientConfig) {
    const rpcUrls = Array.isArray(config.rpcUrls) ? config.rpcUrls : [config.rpcUrls];
    if (rpcUrls.length === 0) {
      throw new Error('At least one RPC URL must be specified');
    }

    this.chain = config.chain || xLayerChain;
    this.vault = getAddress(config.vault);
    this.account = config.account;

    const transport =
      rpcUrls.length === 1 ? http(rpcUrls[0]) : fallback(rpcUrls.map((u) => http(u)));

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport,
    });

    if (this.account) {
      this.walletClient = createWalletClient({
        account: this.account,
        chain: this.chain,
        transport,
      });
    }
  }

  /**
   * Explains failing rule bits in the requested language.
   */
  public explain(inputBits: number, lang: 'en' | 'vi' = 'en') {
    return explainInputBits(inputBits, lang);
  }

  /**
   * Retrieves an immutable, typed snapshot of vault limits, state counters, and balances.
   */
  public async getState(): Promise<VaultSnapshot> {
    const [stateView, baseTokenAddr, latestBlock] = await Promise.all([
      this.publicClient.readContract({
        address: this.vault,
        abi: mandateVaultAbi,
        functionName: 'state',
      }),
      this.publicClient.readContract({
        address: this.vault,
        abi: mandateVaultAbi,
        functionName: 'baseToken',
      }),
      this.publicClient.getBlock({ blockTag: 'latest' }),
    ]);

    const baseToken = getAddress(baseTokenAddr);
    const candidateTokens = new Set<Address>([
      ...((DEFAULT_ALLOWLIST_TOKENS[this.chain.id] || []) as Address[]),
    ]);

    if (stateView.pending && stateView.pending.exists && stateView.pending.addTokens) {
      for (const t of stateView.pending.addTokens) {
        candidateTokens.add(getAddress(t));
      }
    }

    // Check allowlist status for candidates
    const allowedTokens: Address[] = [];
    await Promise.all(
      Array.from(candidateTokens).map(async (token) => {
        try {
          const isAllowed = await this.publicClient.readContract({
            address: this.vault,
            abi: mandateVaultAbi,
            functionName: 'allowedTokens',
            args: [token],
          });
          if (isAllowed) {
            allowedTokens.push(token);
          }
        } catch {
          // Token read failed
        }
      }),
    );

    // Read balances
    const balances: Record<Address, bigint> = {};
    const tokensToRead = Array.from(new Set<Address>([baseToken, ...allowedTokens]));

    await Promise.all(
      tokensToRead.map(async (tok) => {
        try {
          const bal = await this.publicClient.readContract({
            address: tok,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [this.vault],
          });
          balances[tok] = bal;
        } catch {
          balances[tok] = 0n;
        }
      }),
    );

    const limits: Limits = {
      maxTradeBase: stateView.limits.maxTradeBase,
      maxDailyBase: stateView.limits.maxDailyBase,
      maxTradesPerDay: stateView.limits.maxTradesPerDay,
      cooldownSec: BigInt(stateView.limits.cooldownSec),
      expiresAt: stateView.limits.expiresAt,
      withdrawDelaySec: BigInt(stateView.limits.withdrawDelaySec),
    };

    return {
      vault: this.vault,
      owner: getAddress(stateView.owner),
      trader: getAddress(stateView.trader),
      baseToken,
      frozen: stateView.frozen,
      limits,
      counters: {
        dayIndex: BigInt(stateView.dayIndex),
        tradesToday: Number(stateView.tradesToday),
        buyVolumeTodayBase: stateView.buyVolumeTodayBase,
        lastBuyAt: BigInt(stateView.lastBuyAt),
      },
      allowedTokens,
      balances,
      pendingLoosen:
        stateView.pending && stateView.pending.exists
          ? {
              limits: {
                maxTradeBase: stateView.pending.limits.maxTradeBase,
                maxDailyBase: stateView.pending.limits.maxDailyBase,
                maxTradesPerDay: stateView.pending.limits.maxTradesPerDay,
                cooldownSec: BigInt(stateView.pending.limits.cooldownSec),
                expiresAt: stateView.pending.limits.expiresAt,
                withdrawDelaySec: BigInt(stateView.pending.limits.withdrawDelaySec),
              },
              addTokens: stateView.pending.addTokens.map((t) => getAddress(t)),
              unfreeze: stateView.pending.unfreeze,
              eta: stateView.pending.eta,
            }
          : null,
      pendingWithdraw:
        stateView.withdrawal && stateView.withdrawal.exists
          ? {
              token: getAddress(stateView.withdrawal.token),
              amount: stateView.withdrawal.amount,
              eta: stateView.withdrawal.eta,
            }
          : null,
      block: latestBlock.number ?? 0n,
      time: latestBlock.timestamp,
    };
  }

  /**
   * Prechecks a trade against on-chain preview and local circuit logic.
   */
  public async check(request: CheckRequest, lang: 'en' | 'vi' = 'en'): Promise<CheckOutcome> {
    const token = getAddress(request.token);
    const feeTier = request.feeTier ?? 500;
    const slippageBps = request.slippageBps ?? 50;

    const state = await this.getState();
    const isBuy = request.side === 'buy';

    const tokenIn = isBuy ? state.baseToken : token;
    const tokenOut = isBuy ? token : state.baseToken;

    // Convert amountIn to bigint if string
    let amountInRaw: bigint;
    if (typeof request.amountIn === 'string') {
      const decimals = await this.publicClient.readContract({
        address: tokenIn,
        abi: erc20Abi,
        functionName: 'decimals',
      });
      amountInRaw = parseUnits(request.amountIn, decimals);
    } else {
      amountInRaw = request.amountIn;
    }

    if (amountInRaw <= 0n) {
      const reasons = [
        {
          code: 'ERR_INSANE_PARAMS',
          name: 'sane' as const,
          text: 'Trade amount must be strictly positive',
          bitIndex: 0,
        },
      ];
      return {
        allowed: false,
        inputBits: 0,
        reasons,
        localAgrees: true,
        block: state.block,
        time: state.time,
      };
    }

    // 1. Get Uniswap quote
    let quote: { expectedOut: bigint; amountOutMin: bigint };
    try {
      const res = await getQuote(this.publicClient, {
        tokenIn,
        tokenOut,
        amountIn: amountInRaw,
        feeTier,
        slippageBps,
      });
      quote = {
        expectedOut: res.expectedOut,
        amountOutMin: res.amountOutMin,
      };
    } catch (err) {
      const quoteFailReason = {
        code: 'ERR_INSANE_PARAMS',
        name: 'sane' as const,
        text: `Quote failed: ${err instanceof Error ? err.message : String(err)}`,
        bitIndex: 0,
      };
      return {
        allowed: false,
        inputBits: 0,
        reasons: [quoteFailReason],
        localAgrees: true,
        block: state.block,
        time: state.time,
      };
    }

    const deadline = state.time + 300n;
    const tradeParams: TradeParams = {
      tokenIn,
      tokenOut,
      feeTier,
      amountIn: amountInRaw,
      amountOutMin: quote.amountOutMin,
      deadline,
    };

    // 2. Call on-chain previewTrade
    const [onChainBitsRaw, onChainAllowed] = await this.publicClient.readContract({
      address: this.vault,
      abi: mandateVaultAbi,
      functionName: 'previewTrade',
      args: [
        {
          tokenIn: tradeParams.tokenIn,
          tokenOut: tradeParams.tokenOut,
          feeTier: tradeParams.feeTier,
          amountIn: tradeParams.amountIn,
          amountOutMin: tradeParams.amountOutMin,
          deadline: tradeParams.deadline,
        },
      ],
    });
    const onChainBits = Number(onChainBitsRaw);

    // 3. Local circuit evaluation
    const circuitLimits: CircuitLimits = {
      maxTradeBase: state.limits.maxTradeBase,
      maxDailyBase: state.limits.maxDailyBase,
      maxTradesPerDay: state.limits.maxTradesPerDay,
      cooldownSec: state.limits.cooldownSec,
      expiresAt: state.limits.expiresAt,
      withdrawDelaySec: state.limits.withdrawDelaySec,
    };

    const circuitVaultState: CircuitVaultState = {
      frozen: state.frozen,
      dayIndex: state.counters.dayIndex,
      tradesToday: state.counters.tradesToday,
      buyVolumeTodayBase: state.counters.buyVolumeTodayBase,
      lastBuyAt: state.counters.lastBuyAt,
      allowedTokens: new Set(state.allowedTokens.map((t) => t.toLowerCase())),
      balances: new Map(
        Object.entries(state.balances).map(([tok, bal]) => [tok.toLowerCase(), bal]),
      ),
      baseToken: state.baseToken,
      now: state.time,
    };

    const localResult = computeInputBits(circuitVaultState, circuitLimits, {
      tokenIn: tradeParams.tokenIn,
      tokenOut: tradeParams.tokenOut,
      feeTier: tradeParams.feeTier,
      amountIn: tradeParams.amountIn,
      amountOutMin: tradeParams.amountOutMin,
      deadline: tradeParams.deadline,
    });

    const localAgrees = localResult.bits === onChainBits;
    const allowed = onChainAllowed && localAgrees;
    const reasons = explainInputBits(onChainBits, lang);

    if (!localAgrees) {
      reasons.push({
        code: 'ERR_INSANE_PARAMS',
        name: 'sane',
        text: 'Local circuit evaluation disagreed with on-chain preview (treated as blocked for safety)',
        bitIndex: 0,
      });
    }

    return {
      allowed,
      inputBits: onChainBits,
      reasons,
      localAgrees,
      block: state.block,
      time: state.time,
      quote,
      tradeParams,
    };
  }

  /**
   * Executes a trade if permitted by the rule circuit, or simulates if send is false.
   */
  public async trade(
    request: CheckRequest,
    options?: { send?: boolean; lang?: 'en' | 'vi' },
  ): Promise<TradeOutcome> {
    const outcome = await this.check(request, options?.lang);
    if (!outcome.allowed || !outcome.tradeParams || !outcome.quote) {
      return {
        status: 'blocked',
        inputBits: outcome.inputBits,
        reasons: outcome.reasons,
        block: outcome.block,
      };
    }

    if (!options?.send) {
      return {
        status: 'simulated',
        tradeParams: outcome.tradeParams,
        expectedOut: outcome.quote.expectedOut,
        amountOutMin: outcome.quote.amountOutMin,
        block: outcome.block,
      };
    }

    if (!this.account || !this.walletClient) {
      throw new Error('Account must be configured on client to send transactions');
    }

    // Re-quote right before broadcast to prevent slippage front-running
    const freshQuote = await getQuote(this.publicClient, {
      tokenIn: outcome.tradeParams.tokenIn,
      tokenOut: outcome.tradeParams.tokenOut,
      amountIn: outcome.tradeParams.amountIn,
      feeTier: outcome.tradeParams.feeTier,
      slippageBps: request.slippageBps ?? 50,
    });

    if (freshQuote.expectedOut < outcome.quote.amountOutMin) {
      throw new Error('Slippage tolerance exceeded: fresh quote below minimum expected output');
    }

    // Update amountOutMin to the fresh re-quote value for freshest market protection
    const executeParams: TradeParams = {
      ...outcome.tradeParams,
      amountOutMin:
        freshQuote.amountOutMin > outcome.tradeParams.amountOutMin
          ? freshQuote.amountOutMin
          : outcome.tradeParams.amountOutMin,
    };

    const tradeArgs = [
      {
        tokenIn: executeParams.tokenIn,
        tokenOut: executeParams.tokenOut,
        feeTier: executeParams.feeTier,
        amountIn: executeParams.amountIn,
        amountOutMin: executeParams.amountOutMin,
        deadline: executeParams.deadline,
      },
    ] as const;

    // Simulate contract call first
    await this.publicClient.simulateContract({
      address: this.vault,
      abi: mandateVaultAbi,
      functionName: 'trade',
      args: tradeArgs,
      account: this.account,
    });

    // Send transaction
    const txHash = await this.walletClient.writeContract({
      address: this.vault,
      abi: mandateVaultAbi,
      functionName: 'trade',
      args: tradeArgs,
      account: this.account,
      chain: this.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    let amountOut = 0n;
    for (const log of receipt.logs) {
      try {
        if (log.address.toLowerCase() === this.vault.toLowerCase()) {
          const decoded = decodeEventLog({
            abi: mandateVaultAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'Traded') {
            const args = decoded.args as { amountOut?: bigint };
            if (args.amountOut !== undefined) {
              amountOut = args.amountOut;
            }
          }
        }
      } catch {
        // Not a matching event log
      }
    }

    return {
      status: 'sent',
      txHash,
      amountOut,
      gasUsed: receipt.gasUsed,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Freezes the vault immediately.
   */
  public async freeze(options?: { send?: boolean }): Promise<FreezeOutcome> {
    const block = await this.publicClient.getBlockNumber();

    if (!options?.send) {
      return {
        status: 'simulated',
        block,
      };
    }

    if (!this.account || !this.walletClient) {
      throw new Error('Account must be configured on client to send transactions');
    }

    await this.publicClient.simulateContract({
      address: this.vault,
      abi: mandateVaultAbi,
      functionName: 'freeze',
      account: this.account,
    });

    const txHash = await this.walletClient.writeContract({
      address: this.vault,
      abi: mandateVaultAbi,
      functionName: 'freeze',
      account: this.account,
      chain: this.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      status: 'sent',
      txHash,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Tightens limits immediately (must be as strict or stricter).
   */
  public async tighten(
    nextInput: LimitsInput,
    removeTokens?: Address[],
    options?: { send?: boolean },
  ): Promise<TightenOutcome> {
    const state = await this.getState();

    const nextLimits: Limits = {
      maxTradeBase: nextInput.maxTradeBase ?? state.limits.maxTradeBase,
      maxDailyBase: nextInput.maxDailyBase ?? state.limits.maxDailyBase,
      maxTradesPerDay: nextInput.maxTradesPerDay ?? state.limits.maxTradesPerDay,
      cooldownSec: nextInput.cooldownSec ?? state.limits.cooldownSec,
      expiresAt: nextInput.expiresAt ?? state.limits.expiresAt,
      withdrawDelaySec: nextInput.withdrawDelaySec ?? state.limits.withdrawDelaySec,
    };

    const tokensToRemove = (removeTokens || []).map((t) => getAddress(t));

    // Validate strictness client-side
    if (nextLimits.maxTradeBase > state.limits.maxTradeBase) {
      throw new Error('maxTradeBase cannot be increased in tighten');
    }
    if (nextLimits.maxDailyBase > state.limits.maxDailyBase) {
      throw new Error('maxDailyBase cannot be increased in tighten');
    }
    if (nextLimits.maxTradesPerDay > state.limits.maxTradesPerDay) {
      throw new Error('maxTradesPerDay cannot be increased in tighten');
    }
    if (nextLimits.cooldownSec < state.limits.cooldownSec) {
      throw new Error('cooldownSec cannot be decreased in tighten');
    }
    if (nextLimits.expiresAt > state.limits.expiresAt) {
      throw new Error('expiresAt cannot be increased in tighten');
    }
    if (nextLimits.withdrawDelaySec < state.limits.withdrawDelaySec) {
      throw new Error('withdrawDelaySec cannot be decreased in tighten');
    }

    const block = state.block;

    if (!options?.send) {
      return {
        status: 'simulated',
        nextLimits,
        removedTokens: tokensToRemove,
        block,
      };
    }

    if (!this.account || !this.walletClient) {
      throw new Error('Account must be configured on client to send transactions');
    }

    const solLimits = {
      maxTradeBase: nextLimits.maxTradeBase,
      maxDailyBase: nextLimits.maxDailyBase,
      maxTradesPerDay: nextLimits.maxTradesPerDay,
      cooldownSec: Number(nextLimits.cooldownSec),
      expiresAt: nextLimits.expiresAt,
      withdrawDelaySec: Number(nextLimits.withdrawDelaySec),
    };

    await this.publicClient.simulateContract({
      address: this.vault,
      abi: mandateVaultAbi,
      functionName: 'tighten',
      args: [solLimits, tokensToRemove],
      account: this.account,
    });

    const txHash = await this.walletClient.writeContract({
      address: this.vault,
      abi: mandateVaultAbi,
      functionName: 'tighten',
      args: [solLimits, tokensToRemove],
      account: this.account,
      chain: this.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      status: 'sent',
      txHash,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Bounded wait until a trade is permitted by cooldown or daily reset, checking abort signals.
   */
  public async waitUntilAllowed(
    request: CheckRequest,
    options?: {
      timeoutSec?: number;
      pollSec?: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<WaitOutcome> {
    const timeoutSec = options?.timeoutSec ?? 600;
    const pollSec = options?.pollSec ?? 3;
    const signal = options?.abortSignal;

    const startTime = Date.now();
    let lastOutcome: CheckOutcome | undefined;

    while (Date.now() - startTime < timeoutSec * 1000) {
      if (signal?.aborted) {
        return {
          status: 'aborted',
          reason: 'Aborted by caller signal',
          ...(lastOutcome ? { lastCheck: lastOutcome } : {}),
        };
      }

      const outcome = await this.check(request);
      lastOutcome = outcome;

      if (outcome.allowed) {
        return {
          status: 'allowed',
          check: outcome,
        };
      }

      // Check for permanent blocks
      const hasFrozen = outcome.reasons.some((r) => r.code === 'ERR_VAULT_FROZEN');
      const hasExpired = outcome.reasons.some((r) => r.code === 'ERR_MANDATE_EXPIRED');
      const hasNotAllowed = outcome.reasons.some((r) => r.code === 'ERR_TOKEN_NOT_ALLOWED');
      const hasInsane = outcome.reasons.some((r) => r.code === 'ERR_INSANE_PARAMS');
      const hasTradeSize = outcome.reasons.some((r) => r.code === 'ERR_TRADE_SIZE_EXCEEDED');

      if (hasFrozen || hasExpired || hasNotAllowed || hasInsane || hasTradeSize) {
        return {
          status: 'aborted',
          reason: `Permanent block detected: ${outcome.reasons.map((r) => r.code).join(', ')}`,
          ...(lastOutcome ? { lastCheck: lastOutcome } : {}),
        };
      }

      // Small bounded sleep with abort polling
      const sleepMs = pollSec * 1000;
      const step = 200;
      let slept = 0;
      while (slept < sleepMs) {
        if (signal?.aborted) {
          return {
            status: 'aborted',
            reason: 'Aborted by caller signal',
            ...(lastOutcome ? { lastCheck: lastOutcome } : {}),
          };
        }
        await new Promise((r) => setTimeout(r, Math.min(step, sleepMs - slept)));
        slept += step;
      }
    }

    return {
      status: 'timeout',
      reason: `Timed out waiting for trade to be allowed after ${timeoutSec} seconds`,
      ...(lastOutcome ? { lastCheck: lastOutcome } : {}),
    };
  }
}

/**
 * Creates an AgentClient instance.
 */
export function createAgentClient(config: ClientConfig): AgentClient {
  return new AgentClient(config);
}
