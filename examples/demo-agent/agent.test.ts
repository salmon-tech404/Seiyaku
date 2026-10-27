import { describe, it, expect, vi } from 'vitest';
import {
  parseCliArgs,
  validateSafeEnvironment,
  ScreenLogger,
  printSummaryTable,
  runRecklessMode,
  runCarefulMode,
  type SummaryRow,
  type DemoAgentOptions,
} from './agent.js';
import type { AgentClient } from '../../packages/agent-sdk/src/index.js';
import { getAddress, type Address } from 'viem';

describe('Demo Agent CLI Argument Parsing', () => {
  it('parses default options correctly', () => {
    const opts = parseCliArgs(['node', 'agent.ts']);
    expect(opts.mode).toBe('careful');
    expect(opts.rpc).toBe('http://127.0.0.1:8545');
    expect(opts.intervalSec).toBe(20);
    expect(opts.count).toBe(3);
    expect(opts.amount).toBe('10');
    expect(opts.send).toBe(true);
    expect(opts.autoWarp).toBe(true);
  });

  it('parses custom flags correctly', () => {
    const opts = parseCliArgs([
      'node',
      'agent.ts',
      '--mode',
      'reckless',
      '--interval',
      '15',
      '--count',
      '5',
      '--amount',
      '25',
      '--pace',
      '1.5',
      '--simulate',
      '--no-warp',
    ]);
    expect(opts.mode).toBe('reckless');
    expect(opts.intervalSec).toBe(15);
    expect(opts.count).toBe(5);
    expect(opts.amount).toBe('25');
    expect(opts.paceSec).toBe(1.5);
    expect(opts.send).toBe(false);
    expect(opts.autoWarp).toBe(false);
  });

  it('throws on invalid mode', () => {
    expect(() => parseCliArgs(['node', 'agent.ts', '--mode', 'invalid'])).toThrow(
      "Invalid --mode: invalid. Must be 'careful' or 'reckless'.",
    );
  });
});

describe('Demo Agent Environment Safety Checks', () => {
  it('permits localhost and 127.0.0.1 with chainId 196', () => {
    expect(() => validateSafeEnvironment('http://127.0.0.1:8545', 196)).not.toThrow();
    expect(() => validateSafeEnvironment('http://localhost:8545', 196)).not.toThrow();
  });

  it('rejects external or public RPC hosts', () => {
    expect(() => validateSafeEnvironment('https://rpc.xlayer.tech', 196)).toThrow(
      /Safety violation: Demo agent is strictly restricted to local RPC/,
    );
    expect(() => validateSafeEnvironment('https://mainnet.infura.io/v3/test', 196)).toThrow(
      /Safety violation: Demo agent is strictly restricted to local RPC/,
    );
  });

  it('rejects non-196 chain IDs', () => {
    expect(() => validateSafeEnvironment('http://127.0.0.1:8545', 1)).toThrow(
      /Safety violation: Demo agent requires X Layer chainId 196/,
    );
    expect(() => validateSafeEnvironment('http://127.0.0.1:8545', 137)).toThrow(
      /Safety violation: Demo agent requires X Layer chainId 196/,
    );
  });
});

describe('Screen Logger & Table Formatting', () => {
  it('formats output logs with prefixes without errors', () => {
    const logger = new ScreenLogger();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.agent('Agent status test');
    logger.check('Rule check test');
    logger.allow('Rule allow test');
    logger.blocked('Rule blocked test');
    logger.exec('Execution test');
    logger.summary('Summary test');

    expect(logSpy).toHaveBeenCalledTimes(6);
    logSpy.mockRestore();
  });

  it('prints structured summary table and tallies blocked/allowed', () => {
    const logger = new ScreenLogger();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const rows: SummaryRow[] = [
      {
        step: '1. Oversize Buy',
        action: 'Exceed max',
        outcome: 'BLOCKED',
        reason: 'Per trade limit exceeded',
      },
      {
        step: '2. Cooldown Violation',
        action: 'Rapid buy',
        outcome: 'BLOCKED',
        reason: 'Cooldown running',
      },
      {
        step: '8. Exit Position',
        action: 'Sell WOKB',
        outcome: 'ALLOWED',
        reason: 'Exit invariant holds',
      },
    ];

    printSummaryTable(rows, logger);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe('Reckless and Careful Mode Logic (Mocked SDK Client)', () => {
  const dummyTokens = {
    tokenIn: getAddress('0x5FbDB2315678afecb367f032d93F642f64180aa3'),
    tokenOut: getAddress('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'),
  };

  const dummyOptions: DemoAgentOptions = {
    mode: 'reckless',
    rpc: 'http://127.0.0.1:8545',
    keyEnv: 'SEIYAKU_TRADER_KEY',
    intervalSec: 20,
    count: 2,
    amount: '10',
    paceSec: 0,
    send: false,
    lang: 'en',
    autoWarp: false,
  };

  it('executes reckless sequence, capturing 7 blocked/reverted operations and 1 allowed exit', async () => {
    let tradeCallCount = 0;
    const mockClient = {
      vault: getAddress('0x0165878A594ca255338adfa4d48449f69242Eb8F'),
      publicClient: {
        request: vi.fn().mockResolvedValue(null),
        readContract: vi.fn().mockResolvedValue(1000000000000000000n), // 1 WOKB
        // The demo asks the contract itself: tighten with a looser limit and an owner only call must revert
        simulateContract: vi.fn().mockImplementation(async (call: { functionName: string }) => {
          throw new Error(call.functionName === 'tighten' ? 'NotStricter' : 'NotOwner');
        }),
      },
      walletClient: {},
      account: { address: '0xTrader' },
      getState: vi.fn().mockResolvedValue({
        limits: { maxTradeBase: 50_000_000n, maxDailyBase: 100_000_000n },
      }),
      // Attempt 4 evaluates only the vault rules (no pool exists for an unlisted token)
      check: vi.fn().mockResolvedValue({
        allowed: false,
        reasons: [
          {
            code: 'ERR_TOKEN_NOT_ALLOWED',
            name: 'tokenAllowed',
            text: 'Token is not on the vault allowlist',
            bitIndex: 1,
          },
        ],
      }),
      trade: vi
        .fn()
        .mockImplementation(async (req: { side: string; token: Address; amountIn: string }) => {
          tradeCallCount++;
          // Attempt 1: Oversize buy (70)
          if (req.amountIn === '70') {
            return {
              status: 'blocked',
              inputBits: 495,
              reasons: [
                {
                  code: 'ERR_TRADE_SIZE_EXCEEDED',
                  name: 'tradeAmount',
                  text: 'Trade amount exceeds max per-trade limit',
                  bitIndex: 4,
                },
              ],
              block: 1n,
            };
          }
          // Baseline buy
          if (tradeCallCount === 2) {
            return {
              status: 'simulated',
              expectedOut: 1000000000000000000n,
              amountOutMin: 990000000000000000n,
              block: 1n,
            };
          }
          // Attempt 2: Cooldown violation
          if (tradeCallCount === 3) {
            return {
              status: 'blocked',
              inputBits: 447,
              reasons: [
                {
                  code: 'ERR_COOLDOWN_ACTIVE',
                  name: 'cooldownPassed',
                  text: 'Trade within cooldown period',
                  bitIndex: 7,
                },
              ],
              block: 1n,
            };
          }
          // Intermediary daily buys (calls 4, 5, 6, 7)
          if (tradeCallCount >= 4 && tradeCallCount <= 7) {
            return {
              status: 'simulated',
              expectedOut: 1000000000000000000n,
              amountOutMin: 990000000000000000n,
              block: 1n,
            };
          }
          // Attempt 3: 6th trade (daily excess)
          if (tradeCallCount === 8) {
            return {
              status: 'blocked',
              inputBits: 479,
              reasons: [
                {
                  code: 'ERR_DAILY_TRADES_EXCEEDED',
                  name: 'dailyTradesRemaining',
                  text: 'Daily trade count limit reached',
                  bitIndex: 6,
                },
              ],
              block: 1n,
            };
          }
          // Attempt 4: Unlisted token
          if (req.token === getAddress('0x1111111111111111111111111111111111111111')) {
            return {
              status: 'blocked',
              inputBits: 509,
              reasons: [
                {
                  code: 'ERR_TOKEN_NOT_ALLOWED',
                  name: 'tokenAllowed',
                  text: 'Token is not on the vault allowlist',
                  bitIndex: 2,
                },
              ],
              block: 1n,
            };
          }
          // Attempt 5: Trade while frozen
          if (tradeCallCount === 9) {
            return {
              status: 'blocked',
              inputBits: 510,
              reasons: [
                {
                  code: 'ERR_VAULT_FROZEN',
                  name: 'notFrozen',
                  text: 'Vault is currently frozen or inactive',
                  bitIndex: 1,
                },
              ],
              block: 1n,
            };
          }
          // Step 8: Exit while frozen
          if (req.side === 'exit') {
            return {
              status: 'simulated',
              expectedOut: 10000000n,
              amountOutMin: 9900000n,
              block: 1n,
            };
          }
          return {
            status: 'simulated',
            expectedOut: 1000000000000000000n,
            amountOutMin: 990000000000000000n,
            block: 1n,
          };
        }),
      freeze: vi.fn().mockResolvedValue({ status: 'simulated', block: 1n }),
      tighten: vi.fn().mockRejectedValue(new Error('maxTradeBase cannot be increased in tighten')),
    } as unknown as AgentClient;

    const logger = new ScreenLogger();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const summary = await runRecklessMode(mockClient, dummyOptions, dummyTokens, logger);

    expect(summary).toHaveLength(8);
    const blockedCount = summary.filter((s) => s.outcome !== 'ALLOWED').length;
    const allowedCount = summary.filter((s) => s.outcome === 'ALLOWED').length;

    expect(blockedCount).toBe(7);
    expect(allowedCount).toBe(1);
    expect(summary[7].step).toBe('8. Exit While Frozen');
    expect(summary[7].outcome).toBe('ALLOWED');
  });

  it('executes careful sequence with check, trade, and de-risking exit', async () => {
    const mockClient = {
      vault: getAddress('0x0165878A594ca255338adfa4d48449f69242Eb8F'),
      publicClient: {
        readContract: vi.fn().mockResolvedValue(500000000000000000n), // 0.5 WOKB
      },
      check: vi.fn().mockResolvedValue({ allowed: true, reasons: [] }),
      trade: vi.fn().mockResolvedValue({
        status: 'simulated',
        expectedOut: 500000000000000000n,
        amountOutMin: 490000000000000000n,
        block: 1n,
      }),
      getState: vi.fn().mockResolvedValue({
        baseToken: dummyTokens.tokenIn,
        balances: { [dummyTokens.tokenIn]: 100000000n },
      }),
    } as unknown as AgentClient;

    const logger = new ScreenLogger();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const summary = await runCarefulMode(
      mockClient,
      { ...dummyOptions, mode: 'careful', count: 2 },
      dummyTokens,
      logger,
    );

    expect(summary).toHaveLength(3); // 2 buys + 1 exit
    expect(summary[0].outcome).toBe('ALLOWED');
    expect(summary[1].outcome).toBe('ALLOWED');
    expect(summary[2].step).toBe('Exit Position');
    expect(summary[2].outcome).toBe('ALLOWED');
  });
});
