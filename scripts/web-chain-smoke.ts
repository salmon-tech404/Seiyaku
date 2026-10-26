/**
 * scripts/web-chain-smoke.ts
 * Smoke test exercising the apps/web/src/chain/ layer against a live Anvil fork of X Layer.
 */

import { spawn } from 'node:child_process';
import { createPublicClient, createWalletClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { deployOnFork } from './deploy-fork.js';
import {
  createXLayerPublicClient,
  readVaultState,
  previewVaultTrade,
  readPinVerification,
  sendCreateVault,
  decodeAppError,
  DEFAULT_TOKENS,
} from '../apps/web/src/chain/index.js';
import { mandateVaultAbi } from '../apps/web/src/chain/abi/index.js';

const FORK_RPC = 'http://127.0.0.1:8545';
const OWNER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const TRADER_KEY = '0x5de4111afa1a4b94908f83103eb2f954b0a473774953a3ed85c2b0056900a2db' as const;

async function isForkRunning(): Promise<boolean> {
  try {
    const c = createPublicClient({ transport: http(FORK_RPC) });
    await c.getChainId();
    return true;
  } catch {
    return false;
  }
}

async function waitForFork(maxWaitMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isForkRunning()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Fork did not become available in time');
}

async function main() {
  console.log('=== Web Chain Layer Smoke Test ===\n');

  let anvilProcess: ReturnType<typeof spawn> | null = null;
  const running = await isForkRunning();

  if (!running) {
    console.log('Starting local Anvil fork of X Layer (chain 196)...');
    anvilProcess = spawn(
      'anvil',
      ['--fork-url', 'https://rpc.xlayer.tech', '--port', '8545', '--chain-id', '196'],
      { shell: true, stdio: 'ignore' },
    );
    await waitForFork();
    console.log('Fork ready at ' + FORK_RPC);
  } else {
    console.log('Connected to existing fork at ' + FORK_RPC);
  }

  try {
    // 1. Deploy contracts on fork
    console.log('\n[1/5] Deploying factory & circuits on fork...');
    const deployResult = await deployOnFork({ rpcUrl: FORK_RPC });
    const factoryAddress = getAddress(deployResult.factoryAddress);
    console.log(`      Factory address: ${factoryAddress}`);

    // 2. Set up clients using chain layer
    const publicClient = createXLayerPublicClient(FORK_RPC);
    const ownerAccount = privateKeyToAccount(OWNER_KEY);
    const traderAccount = privateKeyToAccount(TRADER_KEY);

    const ownerWallet = createWalletClient({
      account: ownerAccount,
      transport: http(FORK_RPC),
    });

    console.log(`      Owner: ${ownerAccount.address}`);
    console.log(`      Trader: ${traderAccount.address}`);

    // 3. Create a vault using sendCreateVault
    console.log('\n[2/5] Creating vault through sendCreateVault()...');
    const now = BigInt(Math.floor(Date.now() / 1000));
    const limits = {
      maxTradeBase: 25_000_000n, // 25 USDC
      maxDailyBase: 100_000_000n, // 100 USDC
      maxTradesPerDay: 5,
      cooldownSec: 60,
      expiresAt: now + 86400n * 14n,
      withdrawDelaySec: 3600,
    };

    const { txHash, vaultAddress } = await sendCreateVault({
      publicClient,
      walletClient: ownerWallet,
      factoryAddress,
      trader: traderAccount.address,
      limits,
      allowedTokens: [DEFAULT_TOKENS.wokb.address],
      onProgress: (p) => console.log(`      tx status: ${p.status}`),
    });
    console.log(`      Vault created: ${vaultAddress} (tx: ${txHash})`);

    // 4. Read vault state & pin verification
    console.log('\n[3/5] Reading vault state and verifying pin...');
    const state = await readVaultState(publicClient, vaultAddress);
    console.log(`      Owner matches: ${state.owner === ownerAccount.address}`);
    console.log(`      Trader matches: ${state.trader === traderAccount.address}`);
    console.log(
      `      Max trade: ${state.limits.maxTradeBase} (${state.limits.maxTradeBase / 1_000_000n} USDC)`,
    );
    console.log(`      Frozen: ${state.frozen}`);

    const pin = await readPinVerification(publicClient, state);
    console.log(`      Pin verification: ${pin.allMatch ? 'PASS' : 'FAIL'}`);
    console.log(`      Beacon impl match: ${pin.beaconImplMatch}`);
    console.log(`      Codehash match: ${pin.codehashMatch}`);
    console.log(`      Beacon owner zero: ${pin.beaconOwnerZero}`);

    // 5. Preview trade
    console.log('\n[4/5] Previewing trades with previewVaultTrade()...');
    const previewParams = {
      tokenIn: DEFAULT_TOKENS.usdc.address,
      tokenOut: DEFAULT_TOKENS.wokb.address,
      feeTier: 500,
      amountIn: 10_000_000n, // 10 USDC
      amountOutMin: 1n,
      deadline: now + 300n,
    };
    const previewRes = await previewVaultTrade(publicClient, vaultAddress, previewParams);
    console.log(
      `      Preview result: inputBits = 0x${previewRes.inputBits.toString(16)}, allowed = ${previewRes.allowed}`,
    );

    // 6. Execute blocked trade and test decodeAppError
    console.log('\n[5/5] Testing real RuleBlocked error decoding...');
    let caughtError: unknown = null;
    try {
      // Direct call trade with 0 amountIn to trigger RuleBlocked
      await publicClient.simulateContract({
        address: vaultAddress,
        abi: mandateVaultAbi,
        functionName: 'trade',
        args: [
          {
            tokenIn: DEFAULT_TOKENS.usdc.address,
            tokenOut: DEFAULT_TOKENS.wokb.address,
            feeTier: 500,
            amountIn: 0n, // 0 amountIn violates sane bit
            amountOutMin: 1n,
            deadline: now + 300n,
          },
        ],
        account: traderAccount.address,
      });
    } catch (err) {
      caughtError = err;
    }

    if (!caughtError) {
      throw new Error('Expected simulateContract to revert with RuleBlocked');
    }

    const decoded = decodeAppError(caughtError);
    console.log(`      Decoded error name: ${decoded.name}`);
    console.log(`      Message key: ${decoded.messageKey}`);
    console.log(`      Parameters:`, decoded.params);
    console.log(`      Technical details: ${decoded.technicalDetails}`);

    if (decoded.name !== 'RuleBlocked') {
      throw new Error(`Expected error name RuleBlocked, got ${decoded.name}`);
    }

    console.log('\n=== Smoke test PASSED: all chain layer operations verified on live fork ===');
  } finally {
    if (anvilProcess) {
      console.log('Shutting down local Anvil process...');
      anvilProcess.kill();
    }
  }
}

main().catch((err) => {
  console.error('Smoke test FAILED:', err);
  process.exit(1);
});
