import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  formatUnits,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { deployOnFork } from './deploy-fork.js';
import { XLAYER_ADDRESSES } from './config/xlayer.js';
import {
  mandateVaultFactoryAbi,
  mandateVaultAbi,
  erc20Abi,
} from '../apps/web/src/chain/abi/index.js';

// Anvil throwaway accounts
const OWNER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const TRADER_KEY = '0x5de4111afa1a4b94908f83103eb2f954b0a473774953a3ed85c2b0056900a2db' as const;
const USDC_WHALE = '0x9f73888Fb725A3409548BC8d2e42365AC063E148' as const;

async function isRpcAvailable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    });
    const json = (await res.json()) as { result?: string };
    return json.result === '0xc4';
  } catch {
    return false;
  }
}

async function startAnvilFork(): Promise<number | null> {
  // Ensure foundry in PATH
  if (process.env.PATH && !process.env.PATH.includes('.foundry')) {
    process.env.PATH = `C:\\Users\\PC\\.foundry\\bin;${process.env.PATH}`;
  }

  const rpcAvailable = await isRpcAvailable('http://127.0.0.1:8545');
  if (rpcAvailable) {
    console.log('Anvil fork already running on http://127.0.0.1:8545');
    return null;
  }

  console.log('Starting local Anvil fork of X Layer on port 8545...');
  const anvilProcess = spawn(
    'anvil',
    ['--fork-url', 'https://rpc.xlayer.tech', '--port', '8545', '--chain-id', '196'],
    {
      detached: true,
      stdio: 'ignore',
      shell: true,
    },
  );
  anvilProcess.unref();

  // Save PID
  const tempDir = path.resolve('temp');
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'demo-anvil.pid'), anvilProcess.pid?.toString() || '');

  // Wait for RPC to respond
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isRpcAvailable('http://127.0.0.1:8545')) {
      console.log('Anvil fork is ready!');
      return anvilProcess.pid ?? null;
    }
  }

  throw new Error('Failed to start Anvil fork within 20 seconds');
}

export async function prepareDemoFixture() {
  const rpcUrl = 'http://127.0.0.1:8545';
  await startAnvilFork();

  const xlayerChain = {
    id: 196,
    name: 'X Layer',
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } as const;

  const publicClient = createPublicClient({ chain: xlayerChain, transport: http(rpcUrl) });
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

  // Fund owner and trader with native gas
  await publicClient.request({
    method: 'anvil_setBalance',
    params: [ownerAccount.address, '0x21e19e0c9bab2400000'],
  } as unknown as Parameters<typeof publicClient.request>[0]);
  await publicClient.request({
    method: 'anvil_setBalance',
    params: [traderAccount.address, '0x21e19e0c9bab2400000'],
  } as unknown as Parameters<typeof publicClient.request>[0]);

  console.log('\n--- Deploying Demo Factory (120s loosen & withdraw delay) ---');
  const dep = await deployOnFork({
    rpcUrl,
    demo: true,
    loosenDelaySec: 120,
    minWithdrawDelaySec: 120,
  });
  const factoryAddress = dep.factoryAddress;

  console.log('\n--- Funding Owner Account with USDC from Whale ---');
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
    args: [ownerAccount.address, 1_000_000_000n], // 1,000 USDC
  });

  await publicClient.request({
    method: 'anvil_stopImpersonatingAccount',
    params: [USDC_WHALE],
  } as unknown as Parameters<typeof publicClient.request>[0]);

  console.log(`Owner funded with 1,000 USDC at ${ownerAccount.address}`);

  console.log('\n--- Creating Balanced Vault ---');
  const block = await publicClient.getBlock({ blockTag: 'latest' });
  const limits = {
    maxTradeBase: 50_000_000n, // 50 USDC
    maxDailyBase: 100_000_000n, // 100 USDC
    maxTradesPerDay: 5,
    cooldownSec: 300,
    expiresAt: block.timestamp + 86400n * 30n,
    withdrawDelaySec: 120, // 2 minutes for demo
  };

  const createVaultTx = await ownerWallet.writeContract({
    address: factoryAddress,
    abi: mandateVaultFactoryAbi,
    functionName: 'createVault',
    args: [traderAccount.address, limits, [XLAYER_ADDRESSES.wokb]],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: createVaultTx });

  let vaultAddress: Address | undefined;
  for (const log of receipt.logs) {
    if (log.topics[2]) {
      vaultAddress = getAddress(`0x${log.topics[2].slice(26)}`);
    }
  }
  if (!vaultAddress) throw new Error('Could not find VaultCreated event');
  console.log(`Demo Vault deployed at: ${vaultAddress}`);

  console.log('\n--- Depositing 100 USDC into Vault ---');
  const approveTx = await ownerWallet.writeContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'approve',
    args: [vaultAddress, 100_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  const depTx = await ownerWallet.writeContract({
    address: vaultAddress,
    abi: mandateVaultAbi,
    functionName: 'deposit',
    args: [100_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: depTx });
  console.log('100 USDC deposited into vault');

  console.log('\n--- Executing 1 Successful Buy Swap (10 USDC -> WOKB) ---');
  const now = await publicClient.getBlock({ blockTag: 'latest' });
  const buyParams = {
    tokenIn: XLAYER_ADDRESSES.usdc,
    tokenOut: XLAYER_ADDRESSES.wokb,
    feeTier: 500,
    amountIn: 10_000_000n, // 10 USDC
    amountOutMin: 1n,
    deadline: now.timestamp + 600n,
  };

  const tradeTx = await traderWallet.writeContract({
    address: vaultAddress,
    abi: mandateVaultAbi,
    functionName: 'trade',
    args: [buyParams],
  });
  await publicClient.waitForTransactionReceipt({ hash: tradeTx });
  console.log('Buy swap executed successfully!');

  // Check balances
  const usdcBal = await publicClient.readContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });
  const wokbBal = await publicClient.readContract({
    address: XLAYER_ADDRESSES.wokb,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });

  const demoState = {
    factoryAddress,
    vaultAddress,
    ownerAddress: ownerAccount.address,
    traderAddress: traderAccount.address,
    usdcBalance: formatUnits(usdcBal, 6),
    wokbBalance: formatUnits(wokbBal, 18),
    preparedAt: new Date().toISOString(),
  };

  const statePath = path.resolve('deployments/fork/demo-state.json');
  fs.writeFileSync(statePath, JSON.stringify(demoState, null, 2));

  console.log('\n================================================================');
  console.log('             DEMO FIXTURE PREPARED SUCCESSFULLY                 ');
  console.log('================================================================');
  console.log(`Demo Factory:     ${factoryAddress}`);
  console.log(`Demo Vault:       ${vaultAddress}`);
  console.log(`Vault USDC:       ${demoState.usdcBalance} USDC`);
  console.log(`Vault WOKB:       ${demoState.wokbBalance} WOKB`);
  console.log('----------------------------------------------------------------');
  console.log('EXACT URL FOR DEMO RECORDING:');
  console.log(`  http://localhost:5173/#/vault/${vaultAddress}?demo=1&rpc=http://127.0.0.1:8545`);
  console.log(
    '  (Or if running static preview: http://127.0.0.1:4173/#/vault/' +
      vaultAddress +
      '?demo=1&rpc=http://127.0.0.1:8545)',
  );
  console.log('----------------------------------------------------------------');
  console.log('TIMESTAMPTED ACTION SEQUENCE FOR VIDEO RECORDING:');
  console.log('  0:00 - 0:20  Landing & Overview: Explain AI agent mandate vault problem.');
  console.log(
    '  0:20 - 0:45  Verify Page: Show 17 NAND gate DAG, 7 security pins, run 512 truth table.',
  );
  console.log(
    '  0:45 - 1:10  Dashboard: Show pre-funded 90 USDC balance, WOKB position, and trade log.',
  );
  console.log(
    '  1:10 - 1:30  Trade Checker: Test permitted trade (10 USDC) vs blocked trade (500 USDC).',
  );
  console.log(
    '  1:30 - 1:50  Emergency Controls: Demonstrate Freeze & Tighten (immediate effect).',
  );
  console.log(
    '  1:50 - 2:20  Loosen Timelock: Propose loosening, observe 120s countdown, warp time, execute.',
  );
  console.log(
    '  2:20 - 2:45  Property 4 Exit Guarantee: Request withdrawal of base assets anytime.',
  );
  console.log(
    '  2:45 - 3:00  Recap: Trustless on-chain mandate enforcement for AI trading agents.',
  );
  console.log('================================================================\n');

  return demoState;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/demo-prepare.ts')) {
  prepareDemoFixture().catch((err) => {
    console.error('Fatal error in demo-prepare:', err);
    process.exit(1);
  });
}
