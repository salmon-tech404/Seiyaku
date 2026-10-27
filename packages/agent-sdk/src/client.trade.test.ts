import { describe, it, expect, vi, beforeEach } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address } from 'viem';
import { createAgentClient } from './client.js';
import type { CheckOutcome, TradeParams } from './types.js';

vi.mock('./quoter.js', () => ({
  getQuote: vi.fn(),
}));

import { getQuote } from './quoter.js';

const VAULT: Address = '0x1111111111111111111111111111111111111111';
const USDC: Address = '0xB6CEceAB302E2E4948951eE7843FC24E92933061';
const WOKB: Address = '0xe538905cf8410324e03a5a23c1c177a474d59b2b';
// Public Anvil test key (account 1). It only exists on local test chains.
const TEST_ACCOUNT = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
);

function walletOf(client: ReturnType<typeof createAgentClient>) {
  if (!client.walletClient) throw new Error('test client must have a wallet client');
  return client.walletClient;
}

const tradeParams: TradeParams = {
  tokenIn: USDC,
  tokenOut: WOKB,
  feeTier: 500,
  amountIn: 10_000_000n,
  amountOutMin: 100n,
  deadline: 2_000_000_000n,
};

function allowedOutcome(): CheckOutcome {
  return {
    allowed: true,
    inputBits: 255,
    reasons: [],
    localAgrees: true,
    block: 10n,
    time: 1_900_000_000n,
    quote: { expectedOut: 120n, amountOutMin: 100n },
    tradeParams,
  };
}

describe('AgentClient.trade safety paths', () => {
  beforeEach(() => {
    vi.mocked(getQuote).mockReset();
  });

  it('returns slippage_exceeded and sends nothing when the fresh quote is below the minimum', async () => {
    const client = createAgentClient({
      rpcUrls: 'http://127.0.0.1:8545',
      vault: VAULT,
      account: TEST_ACCOUNT,
    });
    vi.spyOn(client, 'check').mockResolvedValue(allowedOutcome());
    vi.mocked(getQuote).mockResolvedValue({ expectedOut: 50n, amountOutMin: 49n, slippageBps: 50 });
    const simulate = vi.spyOn(client.publicClient, 'simulateContract');
    const write = vi.spyOn(walletOf(client), 'writeContract');

    const outcome = await client.trade(
      { side: 'buy', token: WOKB, amountIn: '10' },
      { send: true },
    );

    expect(outcome.status).toBe('slippage_exceeded');
    if (outcome.status === 'slippage_exceeded') {
      expect(outcome.quotedOut).toBe(50n);
      expect(outcome.minimumOut).toBe(100n);
    }
    expect(simulate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('returns blocked without quoting or sending when the vault says blocked', async () => {
    const client = createAgentClient({
      rpcUrls: 'http://127.0.0.1:8545',
      vault: VAULT,
      account: TEST_ACCOUNT,
    });
    vi.spyOn(client, 'check').mockResolvedValue({
      allowed: false,
      inputBits: 127,
      reasons: [{ code: 'ERR_COOLDOWN_ACTIVE', name: 'cooldownOk', text: 'wait', bitIndex: 7 }],
      localAgrees: true,
      block: 10n,
      time: 1_900_000_000n,
    });
    const write = vi.spyOn(walletOf(client), 'writeContract');

    const outcome = await client.trade(
      { side: 'buy', token: WOKB, amountIn: '10' },
      { send: true },
    );

    expect(outcome.status).toBe('blocked');
    expect(getQuote).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('does not send when send is not requested, even if allowed', async () => {
    const client = createAgentClient({
      rpcUrls: 'http://127.0.0.1:8545',
      vault: VAULT,
      account: TEST_ACCOUNT,
    });
    vi.spyOn(client, 'check').mockResolvedValue(allowedOutcome());
    const write = vi.spyOn(walletOf(client), 'writeContract');

    const outcome = await client.trade({ side: 'buy', token: WOKB, amountIn: '10' });

    expect(outcome.status).toBe('simulated');
    expect(write).not.toHaveBeenCalled();
  });
});

describe('AgentClient.freeze simulation', () => {
  it('really simulates the call without send and reports a revert instead of a fake success', async () => {
    const client = createAgentClient({
      rpcUrls: 'http://127.0.0.1:8545',
      vault: VAULT,
      account: TEST_ACCOUNT,
    });
    vi.spyOn(client.publicClient, 'getBlockNumber').mockResolvedValue(5n);
    const simulate = vi
      .spyOn(client.publicClient, 'simulateContract')
      .mockRejectedValue(new Error('NotOwnerOrTrader'));
    const write = vi.spyOn(walletOf(client), 'writeContract');

    await expect(client.freeze()).rejects.toThrow('NotOwnerOrTrader');
    expect(simulate).toHaveBeenCalledTimes(1);
    expect(simulate.mock.calls[0]?.[0]).toMatchObject({ functionName: 'freeze' });
    expect(write).not.toHaveBeenCalled();
  });

  it('reports a simulated success when the call would succeed', async () => {
    const client = createAgentClient({
      rpcUrls: 'http://127.0.0.1:8545',
      vault: VAULT,
      account: TEST_ACCOUNT,
    });
    vi.spyOn(client.publicClient, 'getBlockNumber').mockResolvedValue(5n);
    vi.spyOn(client.publicClient, 'simulateContract').mockResolvedValue(
      {} as Awaited<ReturnType<typeof client.publicClient.simulateContract>>,
    );

    const outcome = await client.freeze();
    expect(outcome).toEqual({ status: 'simulated', block: 5n });
  });
});
