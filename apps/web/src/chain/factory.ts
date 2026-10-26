import { type Address, type PublicClient, type WalletClient, type Hash, getAddress } from 'viem';
import { mandateVaultFactoryAbi } from './abi/index.js';
import { type LimitsData } from './vault.js';
import { runTransaction, type TxProgress } from './tx.js';

export interface FactoryConfig {
  implementation: Address;
  baseToken: Address;
  swapRouter: Address;
  processor: Address;
  circuitId: bigint;
  netlistHash: string;
  loosenDelay: number;
  minWithdrawDelay: number;
  maxDepositBase: bigint;
}

export async function readFactoryVaultsOf(
  client: PublicClient,
  factoryAddress: Address,
  ownerAddress: Address,
): Promise<Address[]> {
  const vaults = (await client.readContract({
    address: getAddress(factoryAddress),
    abi: mandateVaultFactoryAbi,
    functionName: 'vaultsOf',
    args: [getAddress(ownerAddress)],
  })) as Address[];

  return vaults.map((v) => getAddress(v));
}

export async function readFactoryConfig(
  client: PublicClient,
  factoryAddress: Address,
): Promise<FactoryConfig> {
  const factory = getAddress(factoryAddress);

  const [
    implementation,
    baseToken,
    swapRouter,
    processor,
    circuitId,
    netlistHash,
    loosenDelay,
    minWithdrawDelay,
    maxDepositBase,
  ] = await Promise.all([
    client.readContract({
      address: factory,
      abi: mandateVaultFactoryAbi,
      functionName: 'implementation',
    }),
    client.readContract({
      address: factory,
      abi: mandateVaultFactoryAbi,
      functionName: 'baseToken',
    }),
    client.readContract({
      address: factory,
      abi: mandateVaultFactoryAbi,
      functionName: 'swapRouter',
    }),
    client.readContract({
      address: factory,
      abi: mandateVaultFactoryAbi,
      functionName: 'processor',
    }),
    client.readContract({
      address: factory,
      abi: mandateVaultFactoryAbi,
      functionName: 'circuitId',
    }),
    client.readContract({
      address: factory,
      abi: mandateVaultFactoryAbi,
      functionName: 'netlistHash',
    }),
    client.readContract({
      address: factory,
      abi: mandateVaultFactoryAbi,
      functionName: 'loosenDelaySec',
    }),
    client.readContract({
      address: factory,
      abi: mandateVaultFactoryAbi,
      functionName: 'minWithdrawDelaySec',
    }),
    client.readContract({
      address: factory,
      abi: mandateVaultFactoryAbi,
      functionName: 'maxDepositBase',
    }),
  ]);

  return {
    implementation: getAddress(implementation as string),
    baseToken: getAddress(baseToken as string),
    swapRouter: getAddress(swapRouter as string),
    processor: getAddress(processor as string),
    circuitId: circuitId as bigint,
    netlistHash: netlistHash as string,
    loosenDelay: Number(loosenDelay),
    minWithdrawDelay: Number(minWithdrawDelay),
    maxDepositBase: maxDepositBase as bigint,
  };
}

export async function sendCreateVault({
  publicClient,
  walletClient,
  factoryAddress,
  trader,
  limits,
  allowedTokens,
  onProgress,
}: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  factoryAddress: Address;
  trader: Address;
  limits: LimitsData;
  allowedTokens: Address[];
  onProgress?: (progress: TxProgress) => void;
}): Promise<{ txHash: Hash; vaultAddress: Address }> {
  const factory = getAddress(factoryAddress);
  const traderAddr = getAddress(trader);
  const tokens = allowedTokens.map((t) => getAddress(t));

  const limitsArg = {
    maxTradeBase: limits.maxTradeBase,
    maxDailyBase: limits.maxDailyBase,
    maxTradesPerDay: limits.maxTradesPerDay,
    cooldownSec: limits.cooldownSec,
    expiresAt: limits.expiresAt,
    withdrawDelaySec: limits.withdrawDelaySec,
  };

  if (!walletClient.account) {
    throw new Error('Wallet client must have an active account');
  }

  const { txHash, receipt } = await runTransaction({
    stepName: 'Create Vault',
    publicClient,
    walletClient,
    simulate: async () => {
      return publicClient.simulateContract({
        address: factory,
        abi: mandateVaultFactoryAbi,
        functionName: 'createVault',
        args: [traderAddr, limitsArg, tokens],
        account: walletClient.account,
      });
    },
    send: async (sim) => {
      return walletClient.writeContract(sim.request);
    },
    ...(onProgress ? { onProgress } : {}),
  });

  // Parse VaultCreated event log to extract created vault address
  let vaultAddress: Address | null = null;
  for (const log of receipt.logs) {
    if (log.topics[0] && log.topics[2]) {
      // VaultCreated(address indexed owner, address indexed vault, address indexed trader)
      vaultAddress = getAddress(`0x${log.topics[2].slice(26)}`);
      break;
    }
  }

  if (!vaultAddress) {
    throw new Error('VaultCreated event not found in receipt');
  }

  return { txHash, vaultAddress };
}
