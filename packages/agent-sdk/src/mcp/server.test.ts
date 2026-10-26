import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAddress, type PublicClient } from 'viem';
import { SeiyakuMcpServer } from './server.js';
import { TOOL_NAMES } from './tools.js';
import type { AgentClient } from '../client.js';
import type { VaultSnapshot, CheckOutcome, TradeOutcome, FreezeOutcome } from '../types.js';

describe('SeiyakuMcpServer', () => {
  const vault = getAddress('0x1000000000000000000000000000000000000001');
  const baseToken = getAddress('0x2000000000000000000000000000000000000002');
  const tradeToken = getAddress('0x3000000000000000000000000000000000000003');

  const mockSnapshot: VaultSnapshot = {
    vault,
    owner: getAddress('0x4000000000000000000000000000000000000004'),
    trader: getAddress('0x5000000000000000000000000000000000000005'),
    baseToken,
    frozen: false,
    limits: {
      maxTradeBase: 1000000000n,
      maxDailyBase: 5000000000n,
      maxTradesPerDay: 50,
      cooldownSec: 60n,
      expiresAt: 2000000000n,
      withdrawDelaySec: 86400n,
    },
    counters: {
      dayIndex: 20000n,
      tradesToday: 2,
      buyVolumeTodayBase: 200000000n,
      lastBuyAt: 1700000000n,
    },
    allowedTokens: [tradeToken],
    balances: {
      [baseToken]: 50000000000n,
      [tradeToken]: 1000000000n,
    },
    pendingLoosen: null,
    pendingWithdraw: null,
    block: 1234567n,
    time: 1700000100n,
  };

  const mockCheckOutcome: CheckOutcome = {
    allowed: true,
    inputBits: 511,
    reasons: [],
    localAgrees: true,
    block: 1234567n,
    time: 1700000100n,
    quote: {
      expectedOut: 1980000n,
      amountOutMin: 1950000n,
    },
  };

  let mockClient: Partial<AgentClient>;

  beforeEach(() => {
    mockClient = {
      getState: vi.fn().mockResolvedValue(mockSnapshot),
      check: vi.fn().mockResolvedValue(mockCheckOutcome),
      trade: vi.fn().mockImplementation(async (_req, options) => {
        if (!options?.send) {
          return {
            status: 'simulated',
            tradeParams: {
              tokenIn: baseToken,
              tokenOut: tradeToken,
              feeTier: 500,
              amountIn: 2000000n,
              amountOutMin: 1950000n,
              deadline: 1800000000n,
            },
            expectedOut: 1980000n,
            amountOutMin: 1950000n,
            block: 1234567n,
          } as TradeOutcome;
        }
        return {
          status: 'sent',
          txHash:
            '0x9999999999999999999999999999999999999999999999999999999999999999' as `0x${string}`,
          amountOut: 1975000n,
          gasUsed: 150000n,
          blockNumber: 1234568n,
        } as TradeOutcome;
      }),
      freeze: vi.fn().mockImplementation(async (options) => {
        if (!options?.send) {
          return {
            status: 'simulated',
            block: 1234567n,
          } as FreezeOutcome;
        }
        return {
          status: 'sent',
          txHash:
            '0x8888888888888888888888888888888888888888888888888888888888888888' as `0x${string}`,
          blockNumber: 1234568n,
        } as FreezeOutcome;
      }),
      publicClient: {
        readContract: vi.fn().mockImplementation(async ({ address }) => {
          if (address.toLowerCase() === baseToken.toLowerCase()) {
            return 'USDT';
          }
          // Untrusted token with ANSI, HTML, and backticks
          return '\x1b[31;1m<script>alert("hack")</script>`EVIL_TOKEN`\x1b[0m';
        }),
      } as unknown as PublicClient,
    };
  });

  it('seiyaku_get_state sanitizes untrusted token symbols and annotates with UntrustedMetadata', async () => {
    const server = new SeiyakuMcpServer({
      vault,
      rpcUrls: ['https://rpc.xlayer.tech'],
      client: mockClient as AgentClient,
    });

    const res = await server.executeTool(TOOL_NAMES.GET_STATE, {});
    expect(res.isError).toBeFalsy();
    expect(res.content).toHaveLength(1);
    expect(res.content[0]?.type).toBe('text');

    const data = res.structuredData as Record<string, unknown>;
    expect(data.vault).toBe(vault);

    const tokenSymbols = data.tokenSymbols as Record<string, { value: string; untrusted: boolean }>;
    expect(tokenSymbols[tradeToken]?.untrusted).toBe(true);
    // Verified: ANSI escape, HTML tags, and backticks stripped
    expect(tokenSymbols[tradeToken]?.value).toBe('EVIL_TOKEN');

    // Content JSON stringifies bigints to string
    expect(res.content[0]?.text).toContain('"1000000000"');
  });

  it('seiyaku_check_trade executes simulation without broadcasting', async () => {
    const server = new SeiyakuMcpServer({
      vault,
      rpcUrls: ['https://rpc.xlayer.tech'],
      client: mockClient as AgentClient,
    });

    const res = await server.executeTool(TOOL_NAMES.CHECK_TRADE, {
      side: 'buy',
      token: tradeToken,
      amountIn: '100',
    });

    expect(res.isError).toBeFalsy();
    const outcome = res.structuredData as CheckOutcome;
    expect(outcome.allowed).toBe(true);
    expect(mockClient.check).toHaveBeenCalledTimes(1);
  });

  it('seiyaku_trade with allowSend: false runs simulate only and explicitly returns { sent: false, simulation }', async () => {
    const server = new SeiyakuMcpServer({
      vault,
      rpcUrls: ['https://rpc.xlayer.tech'],
      allowSend: false,
      client: mockClient as AgentClient,
    });

    const res = await server.executeTool(TOOL_NAMES.TRADE, {
      side: 'buy',
      token: tradeToken,
      amountIn: '100',
    });

    expect(res.isError).toBeFalsy();
    const data = res.structuredData as { sent: boolean; simulation: { status: string } };
    expect(data.sent).toBe(false);
    expect(data.simulation.status).toBe('simulated');
    expect(mockClient.trade).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'buy', token: tradeToken, amountIn: '100' }),
      expect.objectContaining({ send: false }),
    );
  });

  it('seiyaku_trade with allowSend: true broadcasts transaction and returns { sent: true, txHash, ... }', async () => {
    const server = new SeiyakuMcpServer({
      vault,
      rpcUrls: ['https://rpc.xlayer.tech'],
      allowSend: true,
      rateLimitSec: 5,
      client: mockClient as AgentClient,
    });

    const res = await server.executeTool(TOOL_NAMES.TRADE, {
      side: 'buy',
      token: tradeToken,
      amountIn: '100',
    });

    expect(res.isError).toBeFalsy();
    const data = res.structuredData as { sent: boolean; txHash: string; blockNumber: bigint };
    expect(data.sent).toBe(true);
    expect(data.txHash).toMatch(/^0x/);
    expect(mockClient.trade).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'buy' }),
      expect.objectContaining({ send: true }),
    );
  });

  it('enforces rate limit: consecutive sends within rateLimitSec return clear rate limit error', async () => {
    const server = new SeiyakuMcpServer({
      vault,
      rpcUrls: ['https://rpc.xlayer.tech'],
      allowSend: true,
      rateLimitSec: 10,
      client: mockClient as AgentClient,
    });

    // First send succeeds
    const res1 = await server.executeTool(TOOL_NAMES.TRADE, {
      side: 'buy',
      token: tradeToken,
      amountIn: '100',
    });
    expect(res1.isError).toBeFalsy();

    // Immediate second send must trigger rate limiting
    const res2 = await server.executeTool(TOOL_NAMES.TRADE, {
      side: 'buy',
      token: tradeToken,
      amountIn: '100',
    });
    expect(res2.isError).toBe(true);
    expect(res2.content[0]?.text).toContain('Rate limit exceeded');
    expect(mockClient.trade).toHaveBeenCalledTimes(1); // Second call did not hit client.trade
  });

  it('seiyaku_freeze with allowSend: false runs simulate only and returns { sent: false, simulation }', async () => {
    const server = new SeiyakuMcpServer({
      vault,
      rpcUrls: ['https://rpc.xlayer.tech'],
      allowSend: false,
      client: mockClient as AgentClient,
    });

    const res = await server.executeTool(TOOL_NAMES.FREEZE, {});
    expect(res.isError).toBeFalsy();
    const data = res.structuredData as { sent: boolean; simulation: { status: string } };
    expect(data.sent).toBe(false);
    expect(data.simulation.status).toBe('simulated');
  });

  it('seiyaku_freeze with allowSend: true broadcasts and returns { sent: true, txHash }', async () => {
    const server = new SeiyakuMcpServer({
      vault,
      rpcUrls: ['https://rpc.xlayer.tech'],
      allowSend: true,
      rateLimitSec: 5,
      client: mockClient as AgentClient,
    });

    const res = await server.executeTool(TOOL_NAMES.FREEZE, {});
    expect(res.isError).toBeFalsy();
    const data = res.structuredData as { sent: boolean; txHash: string };
    expect(data.sent).toBe(true);
    expect(data.txHash).toMatch(/^0x/);
  });

  it('zero leaks of canary keys or secrets in error outputs or responses', async () => {
    const canaryKey = 'canary_secret_key_9876543210';
    const server = new SeiyakuMcpServer({
      vault,
      rpcUrls: ['https://rpc.xlayer.tech'],
      client: mockClient as AgentClient,
    });
    server.registerSecret(canaryKey);

    // Call tool with unexpected parameter named canaryKey
    const res = await server.executeTool(TOOL_NAMES.CHECK_TRADE, {
      side: 'buy',
      token: tradeToken,
      amountIn: '10',
      [canaryKey]: 'leaked_value',
    });

    expect(res.isError).toBe(true);
    const contentText = res.content[0]?.text ?? '';
    expect(contentText).not.toContain(canaryKey);
    expect(contentText).toContain('[REDACTED_SECRET]');
  });
});
