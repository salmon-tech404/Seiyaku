/**
 * scripts/agent-smoke.ts
 * End-to-end smoke test for @seiyaku/agent-sdk library and seiyaku-agent CLI
 * against a live Anvil fork of X Layer (chain 196).
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  parseAbiItem,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { deployOnFork } from './deploy-fork.js';
import { XLAYER_ADDRESSES } from './config/xlayer.js';
import {
  mandateVaultFactoryAbi,
  erc20Abi,
  mandateVaultAbi,
} from '../packages/agent-sdk/src/abi/index.js';
import { runCli, CLI_EXIT_CODES } from '../packages/agent-sdk/src/cli/run.js';

const ANVIL_PORT = 8545;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;

// Well-known Anvil accounts
const OWNER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const; // Account #1
const TRADER_KEY = '0x5de4111afa1a4b94908f83103eb2f954b0a473774953a3ed85c2b0056900a2db' as const; // Account #2
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

async function ensureAnvilFork(): Promise<ChildProcess | null> {
  if (process.env.PATH && !process.env.PATH.includes('.foundry')) {
    process.env.PATH = `C:\\Users\\PC\\.foundry\\bin;${process.env.PATH}`;
  }

  if (await isRpcAvailable(RPC_URL)) {
    console.log('Anvil fork is already running on ' + RPC_URL);
    return null;
  }

  console.log('Spawning Anvil fork on port 8545...');
  const proc = spawn(
    'anvil',
    ['--fork-url', 'https://rpc.xlayer.tech', '--port', String(ANVIL_PORT), '--chain-id', '196'],
    { stdio: 'ignore', shell: true },
  );

  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isRpcAvailable(RPC_URL)) {
      console.log('Anvil fork is ready!\n');
      return proc;
    }
  }

  throw new Error('Anvil fork failed to respond on ' + RPC_URL);
}

async function main() {
  console.log('=== SEIYAKU AGENT SDK & CLI FORK SMOKE TEST ===\n');

  let anvilProc: ChildProcess | null = null;
  try {
    anvilProc = await ensureAnvilFork();

    const xlayerChain = {
      id: 196,
      name: 'X Layer',
      nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
      rpcUrls: { default: { http: [RPC_URL] } },
    } as const;

    const publicClient = createPublicClient({ chain: xlayerChain, transport: http(RPC_URL) });
    const ownerAccount = privateKeyToAccount(OWNER_KEY);
    const traderAccount = privateKeyToAccount(TRADER_KEY);

    const ownerWallet = createWalletClient({
      chain: xlayerChain,
      account: ownerAccount,
      transport: http(RPC_URL),
    });

    // 1. Deploy factory on fork
    console.log('[1/7] Deploying factory & circuit on fork...');
    const deployResult = await deployOnFork({
      rpcUrl: RPC_URL,
      demo: true,
      loosenDelaySec: 120,
      minWithdrawDelaySec: 120,
    });
    const factoryAddress = getAddress(deployResult.factoryAddress);
    console.log(`Factory deployed at: ${factoryAddress}`);

    // 2. Fund owner with 500 USDC from whale
    console.log('\n[2/7] Funding owner account with 500 USDC from whale...');
    await publicClient.request({
      // @ts-expect-error Anvil custom RPC method
      method: 'anvil_setBalance',
      params: [USDC_WHALE, '0x21e19e0c9bab2400000'],
    });
    await publicClient.request({
      // @ts-expect-error Anvil custom RPC method
      method: 'anvil_impersonateAccount',
      params: [USDC_WHALE],
    });
    const whaleWallet = createWalletClient({
      chain: xlayerChain,
      account: USDC_WHALE,
      transport: http(RPC_URL),
    });
    await whaleWallet.writeContract({
      address: XLAYER_ADDRESSES.usdc,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [ownerAccount.address, 500_000_000n],
    });
    await publicClient.request({
      // @ts-expect-error Anvil custom RPC method
      method: 'anvil_stopImpersonatingAccount',
      params: [USDC_WHALE],
    });
    console.log(`Owner funded: ${ownerAccount.address}`);

    // 3. Create a vault
    console.log('\n[3/7] Creating vault for agent trading...');
    const now = (await publicClient.getBlock({ blockTag: 'latest' })).timestamp;
    const initialLimits = {
      maxTradeBase: 50_000_000n, // 50 USDC max per trade
      maxDailyBase: 200_000_000n, // 200 USDC max per day
      maxTradesPerDay: 5,
      cooldownSec: 10,
      expiresAt: now + 86400n * 30n,
      withdrawDelaySec: 120,
    };

    const createTxHash = await ownerWallet.writeContract({
      address: factoryAddress,
      abi: mandateVaultFactoryAbi,
      functionName: 'createVault',
      args: [traderAccount.address, initialLimits, [XLAYER_ADDRESSES.wokb]],
    });

    const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createTxHash });
    let vaultAddress: Address | null = null;
    for (const log of createReceipt.logs) {
      if (log.address.toLowerCase() === factoryAddress.toLowerCase()) {
        try {
          const evt = parseAbiItem(
            'event VaultCreated(address indexed owner, address indexed vault, address indexed trader)',
          );
          if (log.topics[0] === evt.name) {
            // Topic matching
          }
        } catch {
          // ignore
        }
      }
    }

    const vaults = await publicClient.readContract({
      address: factoryAddress,
      abi: mandateVaultFactoryAbi,
      functionName: 'vaultsOf',
      args: [ownerAccount.address],
    });
    vaultAddress = getAddress(vaults[vaults.length - 1] as Address);
    console.log(`Vault created at: ${vaultAddress}`);

    // 4. Deposit 100 USDC into vault
    console.log('\n[4/7] Depositing 100 USDC into vault...');
    const approveTx = await ownerWallet.writeContract({
      address: XLAYER_ADDRESSES.usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [vaultAddress, 100_000_000n],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    const depositTx = await ownerWallet.writeContract({
      address: vaultAddress,
      abi: mandateVaultAbi,
      functionName: 'deposit',
      args: [100_000_000n],
    });
    await publicClient.waitForTransactionReceipt({ hash: depositTx });
    console.log(`Deposited 100 USDC into ${vaultAddress}`);

    // Set trader private key in environment variable for CLI
    process.env.SEIYAKU_TRADER_KEY = TRADER_KEY;

    // 5. Test CLI: state
    console.log('\n[5/7] Executing CLI command: state');
    const stateCode = await runCli([
      'node',
      'seiyaku-agent',
      'state',
      '--vault',
      vaultAddress,
      '--rpc',
      RPC_URL,
    ]);
    if (stateCode !== CLI_EXIT_CODES.SUCCESS) {
      throw new Error(`CLI state command failed with exit code ${stateCode}`);
    }

    // 6. Test CLI: check & trade (Allowed buy)
    console.log('\n[6/7] Executing CLI command: check and trade (Allowed 10 USDC buy)');
    const checkCode = await runCli([
      'node',
      'seiyaku-agent',
      'check',
      '--vault',
      vaultAddress,
      '--rpc',
      RPC_URL,
      '--side',
      'buy',
      '--token',
      XLAYER_ADDRESSES.wokb,
      '--amount',
      '10',
    ]);
    if (checkCode !== CLI_EXIT_CODES.SUCCESS) {
      throw new Error(`CLI check command failed with exit code ${checkCode}`);
    }

    const tradeCode = await runCli([
      'node',
      'seiyaku-agent',
      'trade',
      '--vault',
      vaultAddress,
      '--rpc',
      RPC_URL,
      '--side',
      'buy',
      '--token',
      XLAYER_ADDRESSES.wokb,
      '--amount',
      '10',
      '--send',
    ]);
    if (tradeCode !== CLI_EXIT_CODES.SUCCESS) {
      throw new Error(`CLI trade command failed with exit code ${tradeCode}`);
    }

    // 7. Test CLI: Rule violations & exit while frozen
    console.log('\n[7/7] Testing blocked rules and exit while frozen...');

    // A. Oversized buy (60 USDC > 50 USDC maxTradeBase)
    console.log('--- A. Oversized Buy Attempt (60 USDC > 50 USDC limit) ---');
    const overTradeCode = await runCli([
      'node',
      'seiyaku-agent',
      'trade',
      '--vault',
      vaultAddress,
      '--rpc',
      RPC_URL,
      '--side',
      'buy',
      '--token',
      XLAYER_ADDRESSES.wokb,
      '--amount',
      '60',
    ]);
    if (overTradeCode !== CLI_EXIT_CODES.RULE_BLOCKED) {
      throw new Error(
        `Expected exit code ${CLI_EXIT_CODES.RULE_BLOCKED} on oversized buy, got ${overTradeCode}`,
      );
    }
    console.log('Verified: Oversized trade was blocked by circuit as expected.\n');

    // B. Freeze vault
    console.log('--- B. Freezing Vault via CLI ---');
    const freezeCode = await runCli([
      'node',
      'seiyaku-agent',
      'freeze',
      '--vault',
      vaultAddress,
      '--rpc',
      RPC_URL,
      '--send',
    ]);
    if (freezeCode !== CLI_EXIT_CODES.SUCCESS) {
      throw new Error(`Freeze command failed with exit code ${freezeCode}`);
    }
    console.log('Verified: Vault is now frozen.\n');

    // C. Buy while frozen (must be blocked)
    console.log('--- C. Buy Attempt While Frozen (Must Be Blocked) ---');
    const frozenBuyCode = await runCli([
      'node',
      'seiyaku-agent',
      'trade',
      '--vault',
      vaultAddress,
      '--rpc',
      RPC_URL,
      '--side',
      'buy',
      '--token',
      XLAYER_ADDRESSES.wokb,
      '--amount',
      '5',
    ]);
    if (frozenBuyCode !== CLI_EXIT_CODES.RULE_BLOCKED) {
      throw new Error(
        `Expected exit code ${CLI_EXIT_CODES.RULE_BLOCKED} on frozen buy, got ${frozenBuyCode}`,
      );
    }
    console.log('Verified: Buy while frozen was blocked by circuit as expected.\n');

    // D. Exit while frozen (MUST SUCCEED)
    console.log('--- D. Exit Attempt While Frozen (De-Risking MUST SUCCEED) ---');
    const wokbBalance = await publicClient.readContract({
      address: XLAYER_ADDRESSES.wokb,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [vaultAddress],
    });
    console.log(`Vault WOKB balance: ${wokbBalance.toString()}`);

    const exitAmount = '0.05';
    const exitCode = await runCli([
      'node',
      'seiyaku-agent',
      'trade',
      '--vault',
      vaultAddress,
      '--rpc',
      RPC_URL,
      '--side',
      'exit',
      '--token',
      XLAYER_ADDRESSES.wokb,
      '--amount',
      exitAmount,
      '--send',
    ]);
    if (exitCode !== CLI_EXIT_CODES.SUCCESS) {
      throw new Error(`Exit trade while frozen failed with exit code ${exitCode}`);
    }
    console.log(
      'Verified: Exit trade succeeded while frozen! Risk-reduction is always permitted.\n',
    );

    console.log('====================================================');
    console.log('  ALL AGENT SDK & CLI FORK SMOKE CHECKS PASSED!     ');
    console.log('====================================================');
  } finally {
    try {
      execSync('git checkout -- contracts/test/fork/Generated.sol', { stdio: 'ignore' });
    } catch {
      // ignore
    }
    delete process.env.SEIYAKU_TRADER_KEY;
    if (anvilProc) {
      anvilProc.kill();
    }
  }
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
