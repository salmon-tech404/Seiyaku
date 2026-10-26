import { describe, it, expect, vi } from 'vitest';
import { createAgentClient, AgentClient } from './client.js';
import { explainInputBits } from './messages.js';
import { type Address } from 'viem';

const TEST_VAULT: Address = '0x1111111111111111111111111111111111111111';
const TEST_BASE_TOKEN: Address = '0xB6CEceAB302E2E4948951eE7843FC24E92933061'; // USDC
const TEST_WOKB: Address = '0xe538905cf8410324e03a5a23c1c177a474d59b2b';

describe('AgentClient unit tests', () => {
  it('instantiates successfully with single and array rpcUrls', () => {
    const c1 = createAgentClient({
      rpcUrls: 'http://127.0.0.1:8545',
      vault: TEST_VAULT,
    });
    expect(c1).toBeInstanceOf(AgentClient);
    expect(c1.vault.toLowerCase()).toBe(TEST_VAULT.toLowerCase());

    const c2 = createAgentClient({
      rpcUrls: ['http://127.0.0.1:8545', 'https://rpc.xlayer.tech'],
      vault: TEST_VAULT,
    });
    expect(c2).toBeInstanceOf(AgentClient);
  });

  it('throws when initialized with empty rpcUrls', () => {
    expect(() =>
      createAgentClient({
        rpcUrls: [],
        vault: TEST_VAULT,
      }),
    ).toThrow('At least one RPC URL must be specified');
  });

  describe('explain', () => {
    it('returns empty reasons when all 9 bits are 1 (allowed buy)', () => {
      const client = createAgentClient({
        rpcUrls: 'http://127.0.0.1:8545',
        vault: TEST_VAULT,
      });
      const reasons = client.explain(511, 'en');
      expect(reasons).toHaveLength(0);
    });

    it('returns ERR_INSANE_PARAMS when bit 0 is 0', () => {
      const client = createAgentClient({
        rpcUrls: 'http://127.0.0.1:8545',
        vault: TEST_VAULT,
      });
      const reasons = client.explain(510, 'en');
      expect(reasons).toHaveLength(1);
      expect(reasons[0]?.code).toBe('ERR_INSANE_PARAMS');
      expect(reasons[0]?.bitIndex).toBe(0);
    });

    it('returns Vietnamese translation when requested', () => {
      const reasonsVi = explainInputBits(510, 'vi');
      expect(reasonsVi[0]?.text).toContain('Thông số giao dịch không hợp lệ');
    });

    it('returns cooldown active when bit 7 is 0 on a buy', () => {
      // isExit = 0 (bit 8 = 0), cooldownOk = 0 (bit 7 = 0)
      // 511 ^ (1 << 8) ^ (1 << 7) = 127
      const reasons = explainInputBits(127, 'en');
      expect(reasons.some((r) => r.code === 'ERR_COOLDOWN_ACTIVE')).toBe(true);
    });

    it('allows exit when isExit is 1 and sane is 1 even if limits failed', () => {
      // isExit = bit 8 (256), sane = bit 0 (1) -> 257
      const reasons = explainInputBits(257, 'en');
      expect(reasons).toHaveLength(0);
    });
  });

  describe('strictness validation on tighten', () => {
    it('rejects increasing maxTradeBase in tighten', async () => {
      const client = createAgentClient({
        rpcUrls: 'http://127.0.0.1:8545',
        vault: TEST_VAULT,
      });

      // Mock getState
      vi.spyOn(client, 'getState').mockResolvedValueOnce({
        vault: TEST_VAULT,
        owner: TEST_VAULT,
        trader: TEST_VAULT,
        baseToken: TEST_BASE_TOKEN,
        frozen: false,
        limits: {
          maxTradeBase: 100_000_000n, // 100 USDC
          maxDailyBase: 500_000_000n,
          maxTradesPerDay: 10,
          cooldownSec: 300n,
          expiresAt: 2_000_000_000n,
          withdrawDelaySec: 86_400n,
        },
        counters: {
          dayIndex: 1000n,
          tradesToday: 0,
          buyVolumeTodayBase: 0n,
          lastBuyAt: 0n,
        },
        allowedTokens: [TEST_WOKB],
        balances: {},
        pendingLoosen: null,
        pendingWithdraw: null,
        block: 100n,
        time: 1_700_000_000n,
      });

      await expect(
        client.tighten({
          maxTradeBase: 150_000_000n, // attempting loosening!
        }),
      ).rejects.toThrow('maxTradeBase cannot be increased in tighten');
    });

    it('rejects decreasing cooldown in tighten', async () => {
      const client = createAgentClient({
        rpcUrls: 'http://127.0.0.1:8545',
        vault: TEST_VAULT,
      });

      vi.spyOn(client, 'getState').mockResolvedValueOnce({
        vault: TEST_VAULT,
        owner: TEST_VAULT,
        trader: TEST_VAULT,
        baseToken: TEST_BASE_TOKEN,
        frozen: false,
        limits: {
          maxTradeBase: 100_000_000n,
          maxDailyBase: 500_000_000n,
          maxTradesPerDay: 10,
          cooldownSec: 300n,
          expiresAt: 2_000_000_000n,
          withdrawDelaySec: 86_400n,
        },
        counters: {
          dayIndex: 1000n,
          tradesToday: 0,
          buyVolumeTodayBase: 0n,
          lastBuyAt: 0n,
        },
        allowedTokens: [TEST_WOKB],
        balances: {},
        pendingLoosen: null,
        pendingWithdraw: null,
        block: 100n,
        time: 1_700_000_000n,
      });

      await expect(
        client.tighten({
          cooldownSec: 60n, // decreasing cooldown is loosening!
        }),
      ).rejects.toThrow('cooldownSec cannot be decreased in tighten');
    });
  });

  describe('waitUntilAllowed', () => {
    it('aborts immediately when vault is frozen', async () => {
      const client = createAgentClient({
        rpcUrls: 'http://127.0.0.1:8545',
        vault: TEST_VAULT,
      });

      vi.spyOn(client, 'check').mockResolvedValueOnce({
        allowed: false,
        inputBits: 511 ^ (1 << 3), // notFrozen bit 3 is 0
        reasons: [
          {
            code: 'ERR_VAULT_FROZEN',
            name: 'notFrozen',
            text: 'Vault is currently frozen',
            bitIndex: 3,
          },
        ],
        localAgrees: true,
        block: 100n,
        time: 1_700_000_000n,
      });

      const outcome = await client.waitUntilAllowed({
        side: 'buy',
        token: TEST_WOKB,
        amountIn: '10',
      });

      expect(outcome.status).toBe('aborted');
      if (outcome.status === 'aborted') {
        expect(outcome.reason).toContain('Permanent block detected');
      }
    });

    it('respects AbortSignal', async () => {
      const client = createAgentClient({
        rpcUrls: 'http://127.0.0.1:8545',
        vault: TEST_VAULT,
      });

      const controller = new AbortController();
      controller.abort();

      const outcome = await client.waitUntilAllowed(
        {
          side: 'buy',
          token: TEST_WOKB,
          amountIn: '10',
        },
        { abortSignal: controller.signal },
      );

      expect(outcome.status).toBe('aborted');
      if (outcome.status === 'aborted') {
        expect(outcome.reason).toContain('Aborted by caller signal');
      }
    });
  });
});
