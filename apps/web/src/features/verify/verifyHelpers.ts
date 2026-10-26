/**
 * apps/web/src/features/verify/verifyHelpers.ts
 * Pure helpers for contract resolution, pin verification, and truth-table evaluation.
 */

import { type Address, type Hex, type PublicClient, getAddress, keccak256, toHex } from 'viem';
import {
  mandateVaultAbi,
  mandateVaultFactoryAbi,
  processorAbi,
  beaconAbi,
} from '../../chain/abi/index.js';
import { MANDATE_V1_BYTES, packEvalInput, unpackEvalOutput } from '@seiyaku/circuit-tools';

export const REFERENCE_NETLIST_HASH: Hex = keccak256(MANDATE_V1_BYTES);
export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

export type DetectedContractType = 'vault' | 'factory' | 'unknown';

export interface PinItemComparison {
  nameKey: string;
  expected: string;
  live: string;
  match: boolean;
  explorerType?: 'address';
}

export interface VerificationReport {
  contractAddress: Address;
  contractType: DetectedContractType;
  processor: Address;
  circuitId: bigint;
  netlistHashMatch: boolean;
  beaconImplMatch: boolean;
  codehashMatch: boolean;
  beaconOwnerZero: boolean;
  allMatch: boolean;
  pins: PinItemComparison[];
}

/**
 * Resolves whether an address is a MandateVault, MandateVaultFactory, or unknown.
 */
export async function resolveContractType(
  client: PublicClient,
  targetAddress: Address,
): Promise<DetectedContractType> {
  const valid = getAddress(targetAddress);

  // Check if bytecode exists
  const code = await client.getCode({ address: valid });
  if (!code || code === '0x') {
    return 'unknown';
  }

  // 1. Try vault state()
  try {
    await client.readContract({
      address: valid,
      abi: mandateVaultAbi,
      functionName: 'state',
    });
    return 'vault';
  } catch {
    // Not a vault
  }

  // 2. Try factory netlistHash()
  try {
    await client.readContract({
      address: valid,
      abi: mandateVaultFactoryAbi,
      functionName: 'netlistHash',
    });
    return 'factory';
  } catch {
    // Not a factory
  }

  return 'unknown';
}

/**
 * Reads pinned and live on-chain values to generate the verification report.
 */
export async function fetchVerificationReport(
  client: PublicClient,
  targetAddress: Address,
  contractType: DetectedContractType,
  netlistHashOverride?: Hex,
): Promise<VerificationReport> {
  const valid = getAddress(targetAddress);

  let processor: Address = ZERO_ADDRESS;
  let circuitId: bigint = 0n;
  let pinnedNetlistHash: Hex = REFERENCE_NETLIST_HASH;
  let beacon: Address = ZERO_ADDRESS;
  let pinnedImpl: Address = ZERO_ADDRESS;
  let pinnedCodehash: Hex = '0x' as Hex;

  if (contractType === 'vault') {
    const [p, cId, b, bImpl, bCodehash] = await Promise.all([
      client.readContract({ address: valid, abi: mandateVaultAbi, functionName: 'processor' }),
      client.readContract({ address: valid, abi: mandateVaultAbi, functionName: 'circuitId' }),
      client.readContract({ address: valid, abi: mandateVaultAbi, functionName: 'beacon' }),
      client.readContract({
        address: valid,
        abi: mandateVaultAbi,
        functionName: 'beaconImplementation',
      }),
      client.readContract({
        address: valid,
        abi: mandateVaultAbi,
        functionName: 'beaconImplementationCodehash',
      }),
    ]);
    processor = getAddress(p);
    circuitId = cId;
    beacon = getAddress(b);
    pinnedImpl = getAddress(bImpl);
    pinnedCodehash = bCodehash;
  } else if (contractType === 'factory') {
    const [p, cId, nlHash, b, bImpl, bCodehash] = await Promise.all([
      client.readContract({
        address: valid,
        abi: mandateVaultFactoryAbi,
        functionName: 'processor',
      }),
      client.readContract({
        address: valid,
        abi: mandateVaultFactoryAbi,
        functionName: 'circuitId',
      }),
      client.readContract({
        address: valid,
        abi: mandateVaultFactoryAbi,
        functionName: 'netlistHash',
      }),
      client.readContract({ address: valid, abi: mandateVaultFactoryAbi, functionName: 'beacon' }),
      client.readContract({
        address: valid,
        abi: mandateVaultFactoryAbi,
        functionName: 'beaconImplementation',
      }),
      client.readContract({
        address: valid,
        abi: mandateVaultFactoryAbi,
        functionName: 'beaconImplementationCodehash',
      }),
    ]);
    processor = getAddress(p);
    circuitId = cId;
    pinnedNetlistHash = nlHash;
    beacon = getAddress(b);
    pinnedImpl = getAddress(bImpl);
    pinnedCodehash = bCodehash;
  }

  if (netlistHashOverride) {
    pinnedNetlistHash = netlistHashOverride;
  }

  // Read live on-chain values
  const [liveNlBytes, liveImpl, liveOwner, implCode] = await Promise.all([
    client.readContract({
      address: processor,
      abi: processorAbi,
      functionName: 'netlist',
      args: [circuitId],
    }) as Promise<Hex>,
    client.readContract({
      address: beacon,
      abi: beaconAbi,
      functionName: 'implementation',
    }) as Promise<Address>,
    client.readContract({
      address: beacon,
      abi: beaconAbi,
      functionName: 'owner',
    }) as Promise<Address>,
    client.getCode({ address: pinnedImpl }),
  ]);

  const liveNetlistHash = keccak256(liveNlBytes);
  const liveCodehash = implCode && implCode !== '0x' ? keccak256(implCode) : ('0x' as Hex);

  const netlistHashMatch = liveNetlistHash.toLowerCase() === pinnedNetlistHash.toLowerCase();
  const beaconImplMatch = getAddress(liveImpl).toLowerCase() === pinnedImpl.toLowerCase();
  const codehashMatch = liveCodehash.toLowerCase() === pinnedCodehash.toLowerCase();
  const beaconOwnerZero = getAddress(liveOwner) === ZERO_ADDRESS;

  const allMatch = netlistHashMatch && beaconImplMatch && codehashMatch && beaconOwnerZero;

  const pins: PinItemComparison[] = [
    {
      nameKey: 'verify.pins.processor',
      expected: processor,
      live: processor,
      match: true,
      explorerType: 'address',
    },
    {
      nameKey: 'verify.pins.circuitId',
      expected: circuitId.toString(),
      live: circuitId.toString(),
      match: true,
    },
    {
      nameKey: 'verify.pins.netlistHash',
      expected: pinnedNetlistHash,
      live: liveNetlistHash,
      match: netlistHashMatch,
    },
    {
      nameKey: 'verify.pins.beacon',
      expected: beacon,
      live: beacon,
      match: true,
      explorerType: 'address',
    },
    {
      nameKey: 'verify.pins.beaconImpl',
      expected: pinnedImpl,
      live: getAddress(liveImpl),
      match: beaconImplMatch,
      explorerType: 'address',
    },
    {
      nameKey: 'verify.pins.codehash',
      expected: pinnedCodehash,
      live: liveCodehash,
      match: codehashMatch,
    },
    {
      nameKey: 'verify.pins.beaconOwner',
      expected: ZERO_ADDRESS,
      live: getAddress(liveOwner),
      match: beaconOwnerZero,
      explorerType: 'address',
    },
  ];

  return {
    contractAddress: valid,
    contractType,
    processor,
    circuitId,
    netlistHashMatch,
    beaconImplMatch,
    codehashMatch,
    beaconOwnerZero,
    allMatch,
    pins,
  };
}

/**
 * Evaluates the 9 input bits on-chain via processor.eval().
 */
export async function evaluateOnChain(
  client: PublicClient,
  processorAddress: Address,
  circuitId: bigint,
  inputBits: number,
): Promise<boolean> {
  const packedBytes = packEvalInput(inputBits);
  const packedHex = toHex(packedBytes);
  const retHex = (await client.readContract({
    address: getAddress(processorAddress),
    abi: processorAbi,
    functionName: 'eval',
    args: [circuitId, packedHex],
  })) as Hex;

  const bytes = new Uint8Array(
    (retHex.slice(2).match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16)),
  );
  return unpackEvalOutput(bytes);
}

/**
 * Evaluates the 9 input bits locally using reference Boolean logic.
 */
export function evaluateLocally(inputBits: number): boolean {
  const isExit = (inputBits & (1 << 8)) !== 0;
  if (isExit) {
    return (inputBits & (1 << 0)) !== 0; // sane AND isExit
  }
  return (inputBits & 0x1ff) === 0x0ff; // sane AND all buy conditions true
}
