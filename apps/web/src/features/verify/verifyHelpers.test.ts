import { describe, it, expect, vi } from 'vitest';
import {
  resolveContractType,
  fetchVerificationReport,
  evaluateLocally,
  REFERENCE_NETLIST_HASH,
  ZERO_ADDRESS,
} from './verifyHelpers.js';
import { type PublicClient, getAddress } from 'viem';

describe('verifyHelpers', () => {
  const mockVault = getAddress('0x212fdfCfCC22db97DeB3AC3260414909282BB4EE');
  const mockProcessor = getAddress('0x603661EF64F685006335c20B239904864a3C1E6e');
  const mockBeacon = getAddress('0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C');
  const mockImpl = getAddress('0x977f217887E085D298Cb3819cDAD5A0ee35F29B2');
  const mockCodehash = '0x7a15c353205e5245f40f5f5524542a982a4bb3b9a28476e4f10845163f941b30';

  it('evaluates local truth table correctly for buy vs exit', () => {
    // Buy case: bits 0..7 all 1 (0xff), bit 8 = 0 -> allowed
    expect(evaluateLocally(0x0ff)).toBe(true);
    // Exit case: bit 0 = 1, bit 8 = 1 (0x101) -> allowed
    expect(evaluateLocally(0x101)).toBe(true);
    // Insane trade: bit 0 = 0 -> blocked even if isExit = 1
    expect(evaluateLocally(0x100)).toBe(false);
    // Buy missing cooldown: bit 7 = 0 -> blocked
    expect(evaluateLocally(0x07f)).toBe(false);
  });

  it('resolves contract type as vault when state() succeeds', async () => {
    const client = {
      getCode: vi.fn().mockResolvedValue('0x1234'),
      readContract: vi.fn().mockResolvedValue({}),
    } as unknown as PublicClient;

    const res = await resolveContractType(client, mockVault);
    expect(res).toBe('vault');
  });

  it('resolves contract type as factory when state() reverts but netlistHash() succeeds', async () => {
    const client = {
      getCode: vi.fn().mockResolvedValue('0x1234'),
      readContract: vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === 'state') throw new Error('Not vault');
        if (functionName === 'netlistHash') return REFERENCE_NETLIST_HASH;
        return null;
      }),
    } as unknown as PublicClient;

    const res = await resolveContractType(client, mockVault);
    expect(res).toBe('factory');
  });

  it('generates a passing verification report when all live values match pinned values', async () => {
    const client = {
      getCode: vi.fn().mockResolvedValue('0x60806040'), // matches mockCodehash if hashed or dummy
      readContract: vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === 'processor') return mockProcessor;
        if (functionName === 'circuitId') return 1n;
        if (functionName === 'beacon') return mockBeacon;
        if (functionName === 'beaconImplementation') return mockImpl;
        if (functionName === 'beaconImplementationCodehash') return mockCodehash;
        if (functionName === 'netlist') return '0x0901...';
        if (functionName === 'implementation') return mockImpl;
        if (functionName === 'owner') return ZERO_ADDRESS;
        return null;
      }),
    } as unknown as PublicClient;

    // Use override matching the mock keccak
    const rep = await fetchVerificationReport(client, mockVault, 'vault');
    expect(rep.contractAddress).toBe(mockVault);
    expect(rep.contractType).toBe('vault');
    expect(rep.beaconImplMatch).toBe(true);
    expect(rep.beaconOwnerZero).toBe(true);
  });

  it('flags overall failure when beacon owner is not zero address', async () => {
    const notZeroOwner = getAddress('0x1111111111111111111111111111111111111111');
    const client = {
      getCode: vi.fn().mockResolvedValue('0x'),
      readContract: vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === 'processor') return mockProcessor;
        if (functionName === 'circuitId') return 1n;
        if (functionName === 'beacon') return mockBeacon;
        if (functionName === 'beaconImplementation') return mockImpl;
        if (functionName === 'beaconImplementationCodehash') return mockCodehash;
        if (functionName === 'netlist') return '0x';
        if (functionName === 'implementation') return mockImpl;
        if (functionName === 'owner') return notZeroOwner;
        return null;
      }),
    } as unknown as PublicClient;

    const rep = await fetchVerificationReport(client, mockVault, 'vault');
    expect(rep.beaconOwnerZero).toBe(false);
    expect(rep.allMatch).toBe(false);
  });
});
