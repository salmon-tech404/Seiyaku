import {
  type PublicClient,
  type WalletClient,
  type Hash,
  type TransactionReceipt,
  type Address,
} from 'viem';
import { getExplorerUrl } from './config.js';
import { decodeAppError, type AppError } from './errors.js';
import { erc20Abi } from './abi/index.js';

export type TxStepStatus =
  | 'idle'
  | 'simulating'
  | 'needs_confirmation'
  | 'awaiting_signature'
  | 'pending'
  | 'confirmed'
  | 'failed';

export interface TxProgress {
  status: TxStepStatus;
  stepName?: string;
  txHash?: Hash;
  explorerUrl?: string;
  receipt?: TransactionReceipt;
  error?: AppError;
}

export interface RunTxOptions<T> {
  stepName?: string;
  publicClient: PublicClient;
  walletClient: WalletClient;
  simulate: () => Promise<T>;
  send: (simulationResult: T) => Promise<Hash>;
  onProgress?: (progress: TxProgress) => void;
}

export async function runTransaction<T>({
  stepName,
  publicClient,
  walletClient,
  simulate,
  send,
  onProgress,
}: RunTxOptions<T>): Promise<{ txHash: Hash; receipt: TransactionReceipt; explorerUrl: string }> {
  if (!walletClient.account) {
    throw new Error('Wallet client must have an active connected account');
  }

  const update = (p: Partial<TxProgress>) => {
    if (onProgress) {
      const progressObj: TxProgress = {
        status: p.status ?? 'idle',
      };
      if (stepName) progressObj.stepName = stepName;
      if (p.txHash) progressObj.txHash = p.txHash;
      if (p.explorerUrl) progressObj.explorerUrl = p.explorerUrl;
      if (p.receipt) progressObj.receipt = p.receipt;
      if (p.error) progressObj.error = p.error;
      onProgress(progressObj);
    }
  };

  try {
    // 1. Simulating
    update({ status: 'simulating' });
    const simResult = await simulate();

    // 2. Awaiting signature
    update({ status: 'awaiting_signature' });
    const txHash = await send(simResult);
    const explorerUrl = getExplorerUrl('tx', txHash);

    // 3. Pending
    update({ status: 'pending', txHash, explorerUrl });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    if (receipt.status !== 'success') {
      throw new Error(`Transaction reverted on chain (status: ${receipt.status})`);
    }

    // 4. Confirmed
    update({ status: 'confirmed', txHash, receipt, explorerUrl });
    return { txHash, receipt, explorerUrl };
  } catch (err) {
    const appError = decodeAppError(err);
    update({ status: 'failed', error: appError });
    throw appError;
  }
}

/**
 * Checks existing ERC20 allowance and executes an approval transaction if current allowance < requiredAmount.
 */
export async function ensureErc20Allowance({
  publicClient,
  walletClient,
  token,
  owner,
  spender,
  requiredAmount,
  onProgress,
}: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  token: Address;
  owner: Address;
  spender: Address;
  requiredAmount: bigint;
  onProgress?: (progress: TxProgress) => void;
}): Promise<void> {
  const currentAllowance = (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  })) as bigint;

  if (currentAllowance >= requiredAmount) {
    return;
  }

  if (!walletClient.account) {
    throw new Error('Wallet client must have an active connected account');
  }

  // Run approval transaction
  await runTransaction({
    stepName: 'Approval',
    publicClient,
    walletClient,
    simulate: async () => {
      return publicClient.simulateContract({
        address: token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, requiredAmount],
        account: walletClient.account,
      });
    },
    send: async (sim) => {
      return walletClient.writeContract(sim.request);
    },
    ...(onProgress ? { onProgress } : {}),
  });
}
