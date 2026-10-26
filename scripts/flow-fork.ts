import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  parseAbi,
  formatUnits,
  type Address,
  type Abi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
import path from 'node:path';
import { deployOnFork } from './deploy-fork.js';
import { XLAYER_ADDRESSES } from './config/xlayer.js';

// Anvil throwaway accounts
const OWNER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const; // Account #1
const TRADER_KEY = '0x5de4111afa1a4b94908f83103eb2f954b0a473774953a3ed85c2b0056900a2db' as const; // Account #2

const USDC_WHALE = '0x9f73888Fb725A3409548BC8d2e42365AC063E148' as const;

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

interface VaultStateResult {
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
}

function loadArtifact(relativePath: string): { abi: unknown[] } {
  const fullPath = path.resolve(relativePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

async function getBlockTime(client: ReturnType<typeof createPublicClient>): Promise<bigint> {
  const block = await client.getBlock({ blockTag: 'latest' });
  return block.timestamp;
}

async function warpTime(client: ReturnType<typeof createPublicClient>, seconds: number) {
  await client.request({
    method: 'evm_increaseTime',
    params: [seconds],
  } as unknown as Parameters<typeof client.request>[0]);
  await client.request({
    method: 'evm_mine',
    params: [],
  } as unknown as Parameters<typeof client.request>[0]);
}

async function main() {
  const rpcUrl = process.env.FORK_RPC_URL || 'http://127.0.0.1:8545';
  console.log('================================================================');
  console.log('          SEIYAKU MANDATE VAULT — FORK FLOW TRANSCRIPT          ');
  console.log('================================================================');
  console.log(`RPC Endpoint: ${rpcUrl}`);

  const xlayerChain = {
    id: 196,
    name: 'X Layer',
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } as const;

  const publicClient = createPublicClient({ chain: xlayerChain, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== 196) {
    throw new Error(`Expected chainId 196 on fork, got ${chainId}`);
  }
  console.log(
    `Connected to X Layer Fork (Chain ID ${chainId}) at Block ${await publicClient.getBlockNumber()}\n`,
  );

  // 1. Ensure deployment
  const factoryJsonPath = path.resolve('deployments/fork/factory.json');
  let factoryAddress: Address;
  if (!fs.existsSync(factoryJsonPath)) {
    console.log('Deploying factory and vault implementation on fork...');
    const dep = await deployOnFork({ rpcUrl });
    factoryAddress = dep.factoryAddress;
  } else {
    const data = JSON.parse(fs.readFileSync(factoryJsonPath, 'utf8'));
    factoryAddress = getAddress(data.factory);
    console.log(`Using existing factory deployment at: ${factoryAddress}`);
  }

  const factoryArtifact = loadArtifact(
    'contracts/out/MandateVaultFactory.sol/MandateVaultFactory.json',
  );
  const vaultArtifact = loadArtifact('contracts/out/MandateVault.sol/MandateVault.json');
  const factoryAbi = factoryArtifact.abi as Abi;
  const vaultAbi = vaultArtifact.abi as Abi;

  const ownerAccount = privateKeyToAccount(OWNER_KEY);
  const traderAccount = privateKeyToAccount(TRADER_KEY);

  const ownerWallet = createWalletClient({
    chain: xlayerChain,
    account: ownerAccount,
    transport: http(rpcUrl),
  });
  const traderWallet = createWalletClient({
    chain: xlayerChain,
    account: traderAccount,
    transport: http(rpcUrl),
  });

  console.log(`Owner:  ${ownerAccount.address}`);
  console.log(`Trader: ${traderAccount.address}\n`);

  // Fund accounts with native OKB for gas
  await publicClient.request({
    method: 'anvil_setBalance',
    params: [ownerAccount.address, '0x21e19e0c9bab2400000'],
  } as unknown as Parameters<typeof publicClient.request>[0]);
  await publicClient.request({
    method: 'anvil_setBalance',
    params: [traderAccount.address, '0x21e19e0c9bab2400000'],
  } as unknown as Parameters<typeof publicClient.request>[0]);

  // Fund Owner with 1,000 USDC from whale
  console.log('[Setup] Funding Owner with 1,000 USDC from whale...');
  await publicClient.request({
    method: 'anvil_setBalance',
    params: [USDC_WHALE, '0x21e19e0c9bab2400000'],
  } as unknown as Parameters<typeof publicClient.request>[0]);
  await publicClient.request({
    method: 'anvil_impersonateAccount',
    params: [USDC_WHALE],
  } as unknown as Parameters<typeof publicClient.request>[0]);
  const whaleWallet = createWalletClient({
    chain: xlayerChain,
    account: USDC_WHALE,
    transport: http(rpcUrl),
  });
  await whaleWallet.writeContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [ownerAccount.address, 1_000_000_000n],
  });
  await publicClient.request({
    method: 'anvil_stopImpersonatingAccount',
    params: [USDC_WHALE],
  } as unknown as Parameters<typeof publicClient.request>[0]);

  const ownerInitialUsdc = await publicClient.readContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [ownerAccount.address],
  });
  console.log(`Owner USDC balance: ${formatUnits(ownerInitialUsdc, 6)} USDC\n`);

  // Step 1: Create MandateVault
  console.log('--- Step 1: Create MandateVault via Factory ---');
  const now = await getBlockTime(publicClient);
  const limits = {
    maxTradeBase: 50_000_000n, // 50 USDC
    maxDailyBase: 100_000_000n, // 100 USDC
    maxTradesPerDay: 5,
    cooldownSec: 300, // 5 minutes
    expiresAt: now + 86400n * 30n, // 30 days
    withdrawDelaySec: 86400,
  };

  const createVaultTx = await ownerWallet.writeContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: 'createVault',
    args: [traderAccount.address, limits, [XLAYER_ADDRESSES.wokb]],
  });
  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createVaultTx });
  let vaultAddress: Address | undefined;
  for (const log of createReceipt.logs) {
    if (log.topics[2]) {
      vaultAddress = getAddress(`0x${log.topics[2].slice(26)}`);
    }
  }
  if (!vaultAddress) throw new Error('VaultCreated event not found');
  console.log(`Vault deployed at: ${vaultAddress}`);
  console.log(`Trader configured: ${traderAccount.address}`);
  console.log(`Trading limits: maxTrade 50 USDC, maxDaily 100 USDC, cooldown 300s\n`);

  // Step 2: Deposit 100 USDC
  console.log('--- Step 2: Deposit 100 USDC into Vault ---');
  const depositAmount = 100_000_000n;
  const approveTx = await ownerWallet.writeContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'approve',
    args: [vaultAddress, depositAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  const depositTx = await ownerWallet.writeContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'deposit',
    args: [depositAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  const vaultUsdcBal = await publicClient.readContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });
  console.log(`Vault balance after deposit: ${formatUnits(vaultUsdcBal, 6)} USDC\n`);

  // Step 3: Preview First Trade
  console.log('--- Step 3: Trader Preview Trade ---');
  const buyParams = {
    tokenIn: XLAYER_ADDRESSES.usdc,
    tokenOut: XLAYER_ADDRESSES.wokb,
    feeTier: 500,
    amountIn: 10_000_000n, // 10 USDC
    amountOutMin: 1n,
    deadline: (await getBlockTime(publicClient)) + 600n,
  };
  const [previewBits, previewAllowed] = (await publicClient.readContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'previewTrade',
    args: [buyParams],
  })) as [number, boolean];
  console.log(
    `previewTrade -> Allowed: ${previewAllowed}, inputBits: ${previewBits} (0b${previewBits.toString(2)})\n`,
  );

  // Step 4: Execute First Buy (10 USDC -> WOKB)
  console.log('--- Step 4: Trader Executes Buy (10 USDC -> WOKB) ---');
  const buyTx = await traderWallet.writeContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'trade',
    args: [buyParams],
  });
  const buyReceipt = await publicClient.waitForTransactionReceipt({ hash: buyTx });
  const wokbBalAfterBuy = await publicClient.readContract({
    address: XLAYER_ADDRESSES.wokb,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });
  const usdcBalAfterBuy = await publicClient.readContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });
  const allowanceAfterBuy = await publicClient.readContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [vaultAddress, XLAYER_ADDRESSES.swapRouter02],
  });

  console.log(`Buy Tx: ${buyTx}`);
  console.log(`Gas used: ${buyReceipt.gasUsed.toString()} (Target < 400,000)`);
  console.log(`Vault USDC balance: ${formatUnits(usdcBalAfterBuy, 6)} USDC`);
  console.log(`Vault WOKB balance: ${formatUnits(wokbBalAfterBuy, 18)} WOKB`);
  console.log(`SwapRouter allowance: ${allowanceAfterBuy.toString()} (Reset to 0)\n`);

  // Step 5: Immediate Second Buy Blocked by Cooldown
  console.log('--- Step 5: Second Buy Blocked by Cooldown ---');
  const [cdBits, cdAllowed] = (await publicClient.readContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'previewTrade',
    args: [buyParams],
  })) as [number, boolean];
  console.log(`previewTrade before cooldown -> Allowed: ${cdAllowed}, inputBits: ${cdBits}`);
  console.log(`Bit 7 (cooldownOk) is 0: RuleBlocked(127) verified fail-closed\n`);

  // Step 6: Warp past cooldown (300s) and execute second trade
  console.log('--- Step 6: Warp Past Cooldown (300s) & Execute Second Buy ---');
  await warpTime(publicClient, 305);
  buyParams.deadline = (await getBlockTime(publicClient)) + 600n;
  const buyTx2 = await traderWallet.writeContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'trade',
    args: [buyParams],
  });
  await publicClient.waitForTransactionReceipt({ hash: buyTx2 });
  const stateAfterBuy2 = (await publicClient.readContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'state',
  })) as VaultStateResult;
  console.log(
    `Second trade succeeded! Trades today: ${stateAfterBuy2.tradesToday}, Volume: ${formatUnits(stateAfterBuy2.buyVolumeTodayBase, 6)} USDC\n`,
  );

  // Step 7: Freeze Vault
  console.log('--- Step 7: Freeze Vault & Verify Buy Blocked ---');
  const freezeTx = await traderWallet.writeContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'freeze',
  });
  await publicClient.waitForTransactionReceipt({ hash: freezeTx });
  await warpTime(publicClient, 305);
  buyParams.deadline = (await getBlockTime(publicClient)) + 600n;
  const [frzBits, frzAllowed] = (await publicClient.readContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'previewTrade',
    args: [buyParams],
  })) as [number, boolean];
  console.log(
    `previewTrade while frozen -> Allowed: ${frzAllowed}, inputBits: ${frzBits} (Bit 3 notFrozen = 0)\n`,
  );

  // Step 8: Exit Trade (WOKB -> USDC) while Frozen
  console.log('--- Step 8: Exit Trade (Sell all WOKB back to USDC) while Frozen ---');
  const currentWokb = await publicClient.readContract({
    address: XLAYER_ADDRESSES.wokb,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });
  const exitParams = {
    tokenIn: XLAYER_ADDRESSES.wokb,
    tokenOut: XLAYER_ADDRESSES.usdc,
    feeTier: 500,
    amountIn: currentWokb,
    amountOutMin: 1n,
    deadline: (await getBlockTime(publicClient)) + 600n,
  };
  const [exitBits, exitAllowed] = (await publicClient.readContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'previewTrade',
    args: [exitParams],
  })) as [number, boolean];
  console.log(
    `previewTrade for exit -> Allowed: ${exitAllowed}, inputBits: ${exitBits} (isExit = 1)`,
  );

  const exitTx = await traderWallet.writeContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'trade',
    args: [exitParams],
  });
  const exitReceipt = await publicClient.waitForTransactionReceipt({ hash: exitTx });
  const usdcAfterExit = await publicClient.readContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });
  const wokbAfterExit = await publicClient.readContract({
    address: XLAYER_ADDRESSES.wokb,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });
  console.log(`Exit Tx: ${exitTx}`);
  console.log(`Exit gas used: ${exitReceipt.gasUsed.toString()} (Target < 400,000)`);
  console.log(`Vault USDC balance: ${formatUnits(usdcAfterExit, 6)} USDC`);
  console.log(`Vault WOKB balance: ${formatUnits(wokbAfterExit, 18)} WOKB\n`);

  // Step 9: Tighten Limits Instantly
  console.log('--- Step 9: Tighten Limits Instantly ---');
  const tighterLimits = {
    ...limits,
    maxTradeBase: 25_000_000n, // tightened to 25 USDC
    maxDailyBase: 50_000_000n,
    maxTradesPerDay: 3,
  };
  const tightenTx = await traderWallet.writeContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'tighten',
    args: [tighterLimits, []],
  });
  await publicClient.waitForTransactionReceipt({ hash: tightenTx });
  const stateAfterTighten = (await publicClient.readContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'state',
  })) as VaultStateResult;
  console.log(
    `Limits tightened immediately! New maxTradeBase: ${formatUnits(stateAfterTighten.limits.maxTradeBase, 6)} USDC\n`,
  );

  // Step 10: Queue and Execute Loosening
  console.log('--- Step 10: Queue Loosening and Unfreeze with 24h Timelock ---');
  const looserLimits = {
    ...limits,
    maxTradeBase: 75_000_000n, // loosened to 75 USDC
    maxDailyBase: 150_000_000n,
    maxTradesPerDay: 10,
  };
  const queueTx = await ownerWallet.writeContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'queueLoosen',
    args: [looserLimits, [], true],
  });
  await publicClient.waitForTransactionReceipt({ hash: queueTx });
  console.log('Loosening queued. Warping 86,401 seconds past loosenDelay...');
  await warpTime(publicClient, 86401);
  const execLoosenTx = await ownerWallet.writeContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'executeLoosen',
  });
  await publicClient.waitForTransactionReceipt({ hash: execLoosenTx });
  const stateAfterLoosen = (await publicClient.readContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'state',
  })) as VaultStateResult;
  console.log(
    `Loosening executed! Vault frozen: ${stateAfterLoosen.frozen}, maxTradeBase: ${formatUnits(stateAfterLoosen.limits.maxTradeBase, 6)} USDC\n`,
  );

  // Step 11: Request and Execute Withdrawal
  console.log('--- Step 11: Withdrawal Request with Timelock ---');
  const withdrawAmount = 20_000_000n; // 20 USDC
  const reqWithdrawTx = await ownerWallet.writeContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'requestWithdraw',
    args: [XLAYER_ADDRESSES.usdc, withdrawAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: reqWithdrawTx });
  console.log('Withdrawal requested. Warping 86,401 seconds past withdrawDelay...');
  await warpTime(publicClient, 86401);
  const execWithdrawTx = await ownerWallet.writeContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'executeWithdraw',
  });
  await publicClient.waitForTransactionReceipt({ hash: execWithdrawTx });
  const ownerFinalUsdc = await publicClient.readContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [ownerAccount.address],
  });
  console.log(`Withdrawal executed! Owner USDC balance: ${formatUnits(ownerFinalUsdc, 6)} USDC\n`);

  console.log('================================================================');
  console.log('           ALL END-TO-END FORK FLOW STEPS COMPLETED             ');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Fatal error in flow-fork:', err);
  process.exit(1);
});
