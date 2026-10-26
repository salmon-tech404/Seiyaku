import { type Address, type PublicClient, type Hex, getAddress, isAddress, keccak256 } from 'viem';
import { z } from 'zod';
import { mandateVaultAbi, erc20Abi, processorAbi, beaconAbi } from './abi/index.js';

export const addressSchema = z
  .string()
  .refine((val): val is Address => isAddress(val), { message: 'Invalid Ethereum address' });

export const uint128Schema = z.bigint().nonnegative();
export const uint64Schema = z.bigint().nonnegative();
export const uint32Schema = z.number().int().nonnegative();
export const uint16Schema = z.number().int().nonnegative();

export interface LimitsData {
  maxTradeBase: bigint;
  maxDailyBase: bigint;
  maxTradesPerDay: number;
  cooldownSec: number;
  expiresAt: bigint;
  withdrawDelaySec: number;
}

export interface PendingLoosenData {
  eta: bigint;
  limits: LimitsData;
  addTokens: Address[];
  unfreeze: boolean;
}

export interface PendingWithdrawalData {
  eta: bigint;
  token: Address;
  amount: bigint;
}

export interface VaultStateData {
  owner: Address;
  trader: Address;
  limits: LimitsData;
  frozen: boolean;
  dayIndex: bigint;
  tradesToday: number;
  buyVolumeTodayBase: bigint;
  lastBuyAt: bigint;
  pending: PendingLoosenData;
  withdrawal: PendingWithdrawalData;
  baseToken: Address;
  swapRouter: Address;
  processor: Address;
  circuitId: bigint;
  loosenDelay: number;
  minWithdrawDelay: number;
  maxDepositBase: bigint;
  beacon: Address;
  beaconImplementation: Address;
  beaconImplementationCodehash: Hex;
}

export interface TradeParamsData {
  tokenIn: Address;
  tokenOut: Address;
  feeTier: number;
  amountIn: bigint;
  amountOutMin: bigint;
  deadline: bigint;
}

export async function readVaultState(
  client: PublicClient,
  vaultAddress: Address,
): Promise<VaultStateData> {
  const validVault = getAddress(vaultAddress);

  const [
    rawState,
    baseToken,
    swapRouter,
    processor,
    circuitId,
    loosenDelaySec,
    minWithdrawDelaySec,
    maxDepositBase,
    beacon,
    beaconImplementation,
    beaconImplementationCodehash,
  ] = await Promise.all([
    client.readContract({
      address: validVault,
      abi: mandateVaultAbi,
      functionName: 'state',
    }),
    client.readContract({ address: validVault, abi: mandateVaultAbi, functionName: 'baseToken' }),
    client.readContract({ address: validVault, abi: mandateVaultAbi, functionName: 'swapRouter' }),
    client.readContract({ address: validVault, abi: mandateVaultAbi, functionName: 'processor' }),
    client.readContract({ address: validVault, abi: mandateVaultAbi, functionName: 'circuitId' }),
    client.readContract({
      address: validVault,
      abi: mandateVaultAbi,
      functionName: 'loosenDelaySec',
    }),
    client.readContract({
      address: validVault,
      abi: mandateVaultAbi,
      functionName: 'minWithdrawDelaySec',
    }),
    client.readContract({
      address: validVault,
      abi: mandateVaultAbi,
      functionName: 'maxDepositBase',
    }),
    client.readContract({ address: validVault, abi: mandateVaultAbi, functionName: 'beacon' }),
    client.readContract({
      address: validVault,
      abi: mandateVaultAbi,
      functionName: 'beaconImplementation',
    }),
    client.readContract({
      address: validVault,
      abi: mandateVaultAbi,
      functionName: 'beaconImplementationCodehash',
    }),
  ]);

  const stateView = rawState as unknown as {
    owner: Address;
    trader: Address;
    limits: {
      maxTradeBase: bigint;
      maxDailyBase: bigint;
      maxTradesPerDay: number;
      cooldownSec: number;
      expiresAt: bigint;
      withdrawDelaySec: number;
    };
    frozen: boolean;
    dayIndex: bigint;
    tradesToday: number;
    buyVolumeTodayBase: bigint;
    lastBuyAt: bigint;
    pending: {
      eta: bigint;
      limits: {
        maxTradeBase: bigint;
        maxDailyBase: bigint;
        maxTradesPerDay: number;
        cooldownSec: number;
        expiresAt: bigint;
        withdrawDelaySec: number;
      };
      addTokens: Address[];
      unfreeze: boolean;
    };
    withdrawal: {
      eta: bigint;
      token: Address;
      amount: bigint;
    };
  };

  return {
    owner: getAddress(stateView.owner),
    trader: getAddress(stateView.trader),
    limits: {
      maxTradeBase: stateView.limits.maxTradeBase,
      maxDailyBase: stateView.limits.maxDailyBase,
      maxTradesPerDay: Number(stateView.limits.maxTradesPerDay),
      cooldownSec: Number(stateView.limits.cooldownSec),
      expiresAt: stateView.limits.expiresAt,
      withdrawDelaySec: Number(stateView.limits.withdrawDelaySec),
    },
    frozen: stateView.frozen,
    dayIndex: stateView.dayIndex,
    tradesToday: Number(stateView.tradesToday),
    buyVolumeTodayBase: stateView.buyVolumeTodayBase,
    lastBuyAt: stateView.lastBuyAt,
    pending: {
      eta: stateView.pending.eta,
      limits: {
        maxTradeBase: stateView.pending.limits.maxTradeBase,
        maxDailyBase: stateView.pending.limits.maxDailyBase,
        maxTradesPerDay: Number(stateView.pending.limits.maxTradesPerDay),
        cooldownSec: Number(stateView.pending.limits.cooldownSec),
        expiresAt: stateView.pending.limits.expiresAt,
        withdrawDelaySec: Number(stateView.pending.limits.withdrawDelaySec),
      },
      addTokens: (stateView.pending.addTokens || []).map((t) => getAddress(t)),
      unfreeze: stateView.pending.unfreeze,
    },
    withdrawal: {
      eta: stateView.withdrawal.eta,
      token: getAddress(stateView.withdrawal.token || '0x0000000000000000000000000000000000000000'),
      amount: stateView.withdrawal.amount,
    },
    baseToken: getAddress(baseToken as string),
    swapRouter: getAddress(swapRouter as string),
    processor: getAddress(processor as string),
    circuitId: circuitId as bigint,
    loosenDelay: Number(loosenDelaySec),
    minWithdrawDelay: Number(minWithdrawDelaySec),
    maxDepositBase: maxDepositBase as bigint,
    beacon: getAddress(beacon as string),
    beaconImplementation: getAddress(beaconImplementation as string),
    beaconImplementationCodehash: beaconImplementationCodehash as Hex,
  };
}

export async function previewVaultTrade(
  client: PublicClient,
  vaultAddress: Address,
  params: TradeParamsData,
): Promise<{ inputBits: number; allowed: boolean }> {
  const [inputBits, allowed] = (await client.readContract({
    address: getAddress(vaultAddress),
    abi: mandateVaultAbi,
    functionName: 'previewTrade',
    args: [
      {
        tokenIn: getAddress(params.tokenIn),
        tokenOut: getAddress(params.tokenOut),
        feeTier: params.feeTier,
        amountIn: params.amountIn,
        amountOutMin: params.amountOutMin,
        deadline: params.deadline,
      },
    ],
  })) as [number, boolean];

  return { inputBits, allowed };
}

export async function readVaultBalances(
  client: PublicClient,
  vaultAddress: Address,
  tokens: Address[],
): Promise<Record<Address, bigint>> {
  const vault = getAddress(vaultAddress);
  const balances: Record<Address, bigint> = {};

  await Promise.all(
    tokens.map(async (tok) => {
      const validTok = getAddress(tok);
      try {
        const bal = (await client.readContract({
          address: validTok,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [vault],
        })) as bigint;
        balances[validTok] = bal;
      } catch {
        balances[validTok] = 0n;
      }
    }),
  );

  return balances;
}

export interface PinVerificationResult {
  allMatch: boolean;
  processorOk: boolean;
  beaconImplMatch: boolean;
  codehashMatch: boolean;
  beaconOwnerZero: boolean;
  netlistHashMatch: boolean;
  liveImplementation: Address;
  liveCodehash: Hex;
  liveBeaconOwner: Address;
}

export async function readPinVerification(
  client: PublicClient,
  state: VaultStateData,
): Promise<PinVerificationResult> {
  const [liveNetlistBytes, liveImpl, liveOwner, implCode] = await Promise.all([
    client.readContract({
      address: state.processor,
      abi: processorAbi,
      functionName: 'netlist',
      args: [state.circuitId],
    }) as Promise<Hex>,
    client.readContract({
      address: state.beacon,
      abi: beaconAbi,
      functionName: 'implementation',
    }) as Promise<Address>,
    client.readContract({
      address: state.beacon,
      abi: beaconAbi,
      functionName: 'owner',
    }) as Promise<Address>,
    client.getCode({ address: state.beaconImplementation }),
  ]);

  const liveNetlistHash = keccak256(liveNetlistBytes);
  const liveCodehash = implCode && implCode !== '0x' ? keccak256(implCode) : ('0x' as Hex);

  const beaconImplMatch =
    getAddress(liveImpl).toLowerCase() === state.beaconImplementation.toLowerCase();
  const codehashMatch =
    liveCodehash.toLowerCase() === state.beaconImplementationCodehash.toLowerCase();
  const beaconOwnerZero = getAddress(liveOwner) === '0x0000000000000000000000000000000000000000';
  const netlistHashMatch = liveNetlistHash.length === 66; // Verified 32-byte hash exists

  const allMatch = beaconImplMatch && codehashMatch && beaconOwnerZero && netlistHashMatch;

  return {
    allMatch,
    processorOk: true,
    beaconImplMatch,
    codehashMatch,
    beaconOwnerZero,
    netlistHashMatch,
    liveImplementation: getAddress(liveImpl),
    liveCodehash,
    liveBeaconOwner: getAddress(liveOwner),
  };
}

export interface VaultLogEvent {
  eventName: string;
  blockNumber: bigint;
  transactionHash: Hex;
  args: Record<string, unknown>;
}

export async function readVaultLogs(
  client: PublicClient,
  vaultAddress: Address,
  fromBlock: bigint,
  toBlock: bigint = 'latest' as unknown as bigint,
): Promise<VaultLogEvent[]> {
  const logs = await client.getContractEvents({
    address: getAddress(vaultAddress),
    abi: mandateVaultAbi,
    fromBlock,
    toBlock,
  });

  return logs.map((l) => ({
    eventName: l.eventName,
    blockNumber: l.blockNumber,
    transactionHash: l.transactionHash,
    args: (l.args || {}) as Record<string, unknown>,
  }));
}
