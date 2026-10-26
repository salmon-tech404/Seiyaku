/**
 * scripts/vault-dashboard-smoke.ts
 * Exercises all dashboard actions against a real Anvil fork of X Layer (chain 196):
 * - Create Balanced vault
 * - Deposit USDC
 * - Trade checker evaluation
 * - Tighten limits
 * - Emergency freeze
 * - Queue loosening
 * - Request withdrawal
 * - Verify vault state after each step
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, getAddress, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayerChain, DEFAULT_TOKENS } from '../apps/web/src/chain/config.js';
import { sendCreateVault } from '../apps/web/src/chain/factory.js';
import {
  readVaultState,
  readVaultBalances,
  previewVaultTrade,
} from '../apps/web/src/chain/vault.js';
import { mandateVaultAbi, erc20Abi } from '../apps/web/src/chain/abi/index.js';
import { VAULT_TEMPLATES, templateToLimits } from '../apps/web/src/features/create/templates.js';
import { computeInputBits } from '../packages/circuit-tools/src/inputBits.js';

const ANVIL_PORT = 8545;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const THROW_AWAY_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // Account #1

async function waitRpc(url: string, timeoutMs: number = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      });
      if (res.ok) return;
    } catch {
      // Keep trying
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for anvil fork at ${url}`);
}

async function runDashboardSmoke(): Promise<void> {
  console.log('=== Vault Dashboard Fork Smoke Test ===\n');

  console.log('Starting local Anvil fork of X Layer (chain 196)...');
  const anvil: ChildProcess = spawn(
    'anvil',
    ['--fork-url', 'https://rpc.xlayer.tech', '--port', String(ANVIL_PORT)],
    { shell: true, stdio: 'ignore' },
  );

  try {
    await waitRpc(RPC_URL);
    console.log(`Fork ready at ${RPC_URL}\n`);

    // 1. Deploy factory & circuit on fork
    console.log('[1/7] Deploying factory & circuits on fork...');
    const deployScript = spawnSync('npx', ['tsx', 'scripts/deploy-fork.ts'], {
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, FORK_RPC_URL: RPC_URL },
    });
    if (deployScript.status !== 0) {
      console.error(deployScript.stderr || deployScript.stdout);
      throw new Error(`deploy-fork failed with status ${deployScript.status}`);
    }

    const fs = await import('node:fs');
    const deployment = JSON.parse(
      fs.readFileSync(path.resolve('deployments/fork/factory.json'), 'utf8'),
    );
    const factoryAddress = getAddress(deployment.factory);

    const client = createPublicClient({
      chain: xLayerChain,
      transport: http(RPC_URL),
    });

    const account = privateKeyToAccount(THROW_AWAY_KEY);
    const wallet = createWalletClient({
      chain: xLayerChain,
      transport: http(RPC_URL),
      account,
    });

    const trader = getAddress('0xB869F594F35603f71AA7B9D3689B4ab1DE9cde83');
    const wokb = getAddress(DEFAULT_TOKENS.wokb.address);
    const usdc = getAddress(DEFAULT_TOKENS.usdc.address);

    // 2. Create Balanced Vault
    console.log('[2/7] Creating Balanced vault...');
    const block = await client.getBlock({ blockTag: 'latest' });
    const nowSec = Number(block.timestamp);
    const limits = templateToLimits(VAULT_TEMPLATES.balanced, nowSec);

    const { vaultAddress } = await sendCreateVault({
      walletClient: wallet,
      publicClient: client,
      factoryAddress,
      trader,
      limits,
      allowedTokens: [wokb],
    });
    console.log(`      Vault created at: ${vaultAddress}`);

    // Fund account with USDC using impersonation of rich holder
    console.log('[3/7] Funding account and depositing 100 USDC into vault...');
    const richHolder = '0x9f73888Fb725A3409548BC8d2e42365AC063E148';
    await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'anvil_impersonateAccount',
        params: [richHolder],
      }),
    });

    // Also fund richHolder with native OKB for gas
    await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'anvil_setBalance',
        params: [richHolder, '0x56BC75E2D63100000'], // 100 OKB
      }),
    });

    const richWallet = createWalletClient({
      chain: xLayerChain,
      transport: http(RPC_URL),
      account: richHolder,
    });

    // Transfer 200 USDC from richHolder to our account
    const transferSim = await client.simulateContract({
      address: usdc,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [account.address, parseUnits('200', 6)],
      account: richHolder,
    });
    const transferHash = await richWallet.writeContract(transferSim.request);
    await client.waitForTransactionReceipt({ hash: transferHash });

    // Approve & Deposit 100 USDC into vault
    const depositAmt = parseUnits('100', 6);
    const approveSim = await client.simulateContract({
      address: usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [vaultAddress, depositAmt],
      account: account.address,
    });
    const approveHash = await wallet.writeContract(approveSim.request);
    await client.waitForTransactionReceipt({ hash: approveHash });

    const depositSim = await client.simulateContract({
      address: vaultAddress,
      abi: mandateVaultAbi,
      functionName: 'deposit',
      args: [depositAmt],
      account: account.address,
    });
    const depositHash = await wallet.writeContract(depositSim.request);
    await client.waitForTransactionReceipt({ hash: depositHash });

    const balances = await readVaultBalances(client, vaultAddress, [usdc, wokb]);
    console.log(`      Vault USDC balance: ${Number(balances[usdc]) / 1e6} USDC (PASS)`);
    if (balances[usdc] !== depositAmt) {
      throw new Error(`Expected balance ${depositAmt}, got ${balances[usdc]}`);
    }

    // 4. Test Trade Checker Agreement
    console.log('[4/7] Testing Trade Checker on-chain vs local circuit...');
    const preview = await previewVaultTrade(client, vaultAddress, {
      tokenIn: usdc,
      tokenOut: wokb,
      feeTier: 500,
      amountIn: parseUnits('20', 6),
      amountOutMin: 1n,
      deadline: BigInt(nowSec + 300),
    });

    const localBitsRes = computeInputBits(
      {
        baseToken: usdc,
        frozen: false,
        dayIndex: 0n,
        tradesToday: 0,
        buyVolumeTodayBase: 0n,
        lastBuyAt: 0n,
        allowedTokens: new Set([wokb.toLowerCase()]),
        balances: new Map([[usdc.toLowerCase(), depositAmt]]),
        now: BigInt(nowSec),
      },
      {
        maxTradeBase: limits.maxTradeBase,
        maxDailyBase: limits.maxDailyBase,
        maxTradesPerDay: limits.maxTradesPerDay,
        cooldownSec: BigInt(limits.cooldownSec),
        expiresAt: limits.expiresAt,
        withdrawDelaySec: BigInt(limits.withdrawDelaySec),
      },
      {
        tokenIn: usdc,
        tokenOut: wokb,
        amountIn: parseUnits('20', 6),
        amountOutMin: 1n,
        feeTier: 500,
        deadline: BigInt(nowSec + 300),
      },
    );

    const localAllowed =
      (localBitsRes.bits & (1 << 8)) !== 0
        ? (localBitsRes.bits & (1 << 0)) !== 0
        : (localBitsRes.bits & 0x1ff) === 0x0ff;

    console.log(
      `      On-chain preview allowed: ${preview.allowed}, bits: 0x${preview.inputBits.toString(16)}`,
    );
    console.log(
      `      Local circuit allowed: ${localAllowed}, bits: 0x${localBitsRes.bits.toString(16)}`,
    );
    if (preview.allowed !== localAllowed || preview.inputBits !== localBitsRes.bits) {
      throw new Error('Trade checker on-chain and local simulator mismatch!');
    }
    console.log('      Trade checker verification: 100% agreement (PASS)');

    // 5. Test Tightening
    console.log('[5/7] Testing Tighten limits (instant reduction)...');
    const tightenedLimits = {
      ...limits,
      maxTradeBase: parseUnits('50', 6), // reduced from 100
      maxDailyBase: parseUnits('250', 6), // reduced from 500
    };

    const tightenSim = await client.simulateContract({
      address: vaultAddress,
      abi: mandateVaultAbi,
      functionName: 'tighten',
      args: [tightenedLimits, []],
      account: account.address,
    });
    const tightenHash = await wallet.writeContract(tightenSim.request);
    await client.waitForTransactionReceipt({ hash: tightenHash });

    const stateAfterTighten = await readVaultState(client, vaultAddress);
    if (stateAfterTighten.limits.maxTradeBase !== parseUnits('50', 6)) {
      throw new Error('Tightening failed to update maxTradeBase');
    }
    console.log('      Tightened maxTradeBase to 50 USDC immediately (PASS)');

    // 6. Test Emergency Freeze
    console.log('[6/7] Testing Emergency Freeze...');
    const freezeSim = await client.simulateContract({
      address: vaultAddress,
      abi: mandateVaultAbi,
      functionName: 'freeze',
      account: account.address,
    });
    const freezeHash = await wallet.writeContract(freezeSim.request);
    await client.waitForTransactionReceipt({ hash: freezeHash });

    const stateAfterFreeze = await readVaultState(client, vaultAddress);
    if (!stateAfterFreeze.frozen) {
      throw new Error('Freeze failed to set frozen=true');
    }
    console.log('      Vault is now frozen (PASS)');

    // 7. Test Queue Loosening & Request Withdrawal
    console.log('[7/7] Testing Queue Loosen and Request Withdrawal...');
    const queuedLoosenLimits = {
      ...tightenedLimits,
      maxTradeBase: parseUnits('75', 6), // loosening
    };

    const loosenSim = await client.simulateContract({
      address: vaultAddress,
      abi: mandateVaultAbi,
      functionName: 'queueLoosen',
      args: [queuedLoosenLimits, [], true], // unfreeze=true
      account: account.address,
    });
    const loosenHash = await wallet.writeContract(loosenSim.request);
    await client.waitForTransactionReceipt({ hash: loosenHash });

    const stateAfterLoosen = await readVaultState(client, vaultAddress);
    if (stateAfterLoosen.pending.eta === 0n) {
      throw new Error('Loosen ETA not set');
    }
    console.log(`      Loosening queued with ETA: ${stateAfterLoosen.pending.eta} (PASS)`);

    const withdrawSim = await client.simulateContract({
      address: vaultAddress,
      abi: mandateVaultAbi,
      functionName: 'requestWithdraw',
      args: [usdc, parseUnits('10', 6)],
      account: account.address,
    });
    const withdrawHash = await wallet.writeContract(withdrawSim.request);
    await client.waitForTransactionReceipt({ hash: withdrawHash });

    const stateAfterWithdraw = await readVaultState(client, vaultAddress);
    if (stateAfterWithdraw.withdrawal.eta === 0n) {
      throw new Error('Withdrawal ETA not set');
    }
    console.log(`      Withdrawal requested with ETA: ${stateAfterWithdraw.withdrawal.eta} (PASS)`);

    console.log('\n=== All dashboard actions verified on live Anvil fork successfully! ===');
  } finally {
    console.log('Shutting down local Anvil process...');
    anvil.kill('SIGTERM');
  }
}

runDashboardSmoke().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
