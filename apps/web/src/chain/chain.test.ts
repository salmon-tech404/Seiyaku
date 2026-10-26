import { describe, it, expect } from 'vitest';
import {
  xLayerChain,
  DEFAULT_TOKENS,
  getExplorerUrl,
  getActiveRpcUrl,
  getActiveFactoryAddress,
} from './config.js';
import { readAt } from './clients.js';
import { type PublicClient } from 'viem';

describe('Chain config', () => {
  it('defines chainId 196 for X Layer', () => {
    expect(xLayerChain.id).toBe(196);
    expect(xLayerChain.nativeCurrency.symbol).toBe('OKB');
  });

  it('defines USDC and WOKB token configs with correct decimals', () => {
    expect(DEFAULT_TOKENS.usdc.decimals).toBe(6);
    expect(DEFAULT_TOKENS.usdc.symbol).toBe('USDC');
    expect(DEFAULT_TOKENS.wokb.decimals).toBe(18);
    expect(DEFAULT_TOKENS.wokb.symbol).toBe('WOKB');
  });

  it('constructs correct OKLink explorer URLs', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    const tx = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';

    expect(getExplorerUrl('address', addr)).toBe(`https://www.oklink.com/xlayer/address/${addr}`);
    expect(getExplorerUrl('tx', tx)).toBe(`https://www.oklink.com/xlayer/tx/${tx}`);
  });

  it('defaults to official X Layer RPC URL', () => {
    expect(getActiveRpcUrl()).toBe('https://rpc.xlayer.tech');
  });

  it('returns null for unconfigured factories', () => {
    expect(getActiveFactoryAddress(false)).toBeNull();
    expect(getActiveFactoryAddress(true)).toBeNull();
  });
});

describe('readAt freshness helper', () => {
  it('returns data wrapped with blockNumber and blockTimestamp metadata', async () => {
    const mockClient = {
      getBlock: async () => ({
        number: 74200000n,
        timestamp: 1700000000n,
      }),
    } as unknown as PublicClient;

    const res = await readAt(mockClient, async () => 'hello vault');
    expect(res.value).toBe('hello vault');
    expect(res.blockNumber).toBe(74200000n);
    expect(res.blockTimestamp).toBe(1700000000n);
    expect(res.readAt).toBeGreaterThan(0);
  });
});
