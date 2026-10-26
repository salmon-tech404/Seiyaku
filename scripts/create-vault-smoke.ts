/**
 * scripts/create-vault-smoke.ts
 * Tests creating a vault with each template against a live Anvil fork of X Layer (chain 196).
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, getAddress, parseAbiItem } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayerChain } from '../apps/web/src/chain/config.js';
import { sendCreateVault } from '../apps/web/src/chain/factory.js';
import { readVaultState } from '../apps/web/src/chain/vault.js';
import {
  VAULT_TEMPLATES,
  templateToLimits,
  type TemplateId,
} from '../apps/web/src/features/create/templates.js';

const ANVIL_PORT = 8545;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const THROW_AWAY_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // Anvil account #1

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

async function runForkTemplateSmoke(): Promise<void> {
  console.log('=== Fork Create Vault Template Smoke Test ===\n');

  console.log('Starting local Anvil fork of X Layer (chain 196)...');
  const anvil: ChildProcess = spawn(
    'anvil',
    ['--fork-url', 'https://rpc.xlayer.tech', '--port', String(ANVIL_PORT)],
    { shell: true, stdio: 'ignore' },
  );

  try {
    await waitRpc(RPC_URL);
    console.log(`Fork ready at ${RPC_URL}\n`);

    // 1. Deploy contracts
    console.log('[1/3] Deploying factory & circuits on fork...');
    const deployScript = spawnSync('npx', ['tsx', 'scripts/deploy-fork.ts'], {
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, FORK_RPC_URL: RPC_URL },
    });
    if (deployScript.status !== 0) {
      console.error(deployScript.stderr || deployScript.stdout);
      throw new Error(`deploy-fork failed with status ${deployScript.status}`);
    }

    // Read deployed factory from deployments/fork/factory.json
    const fs = await import('node:fs');
    const deployment = JSON.parse(
      fs.readFileSync(path.resolve('deployments/fork/factory.json'), 'utf8'),
    );
    const factoryAddress = getAddress(deployment.factory);
    console.log(`      Factory address: ${factoryAddress}`);

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
    const wokb = getAddress('0xe538905cf8410324e03A5A23C1c177a474D59b2b');

    // 2. Deploy vault with each template
    console.log('[2/3] Creating vaults for all 3 templates (Careful, Balanced, Agent safe)...');
    const templatesToTest: Array<Exclude<TemplateId, 'custom'>> = [
      'careful',
      'balanced',
      'agent_safe',
    ];

    const block = await client.getBlock({ blockTag: 'latest' });
    const nowSec = Number(block.timestamp);

    for (const tId of templatesToTest) {
      const template = VAULT_TEMPLATES[tId];
      const limits = templateToLimits(template, nowSec);

      console.log(`   Deploying vault with template: ${template.id}...`);
      const { txHash, vaultAddress } = await sendCreateVault({
        walletClient: wallet,
        publicClient: client,
        factoryAddress,
        trader,
        limits,
        allowedTokens: [wokb],
      });

      console.log(`      Vault address: ${vaultAddress} (tx: ${txHash})`);

      // Read state
      const state = await readVaultState(client, vaultAddress);
      if (state.owner.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error(`Owner mismatch for template ${tId}`);
      }
      if (state.trader.toLowerCase() !== trader.toLowerCase()) {
        throw new Error(`Trader mismatch for template ${tId}`);
      }
      if (state.limits.maxTradeBase !== template.maxTradeBase) {
        throw new Error(`MaxTradeBase mismatch for template ${tId}`);
      }
      if (state.limits.maxDailyBase !== template.maxDailyBase) {
        throw new Error(`MaxDailyBase mismatch for template ${tId}`);
      }
      if (state.limits.maxTradesPerDay !== template.maxTradesPerDay) {
        throw new Error(`MaxTradesPerDay mismatch for template ${tId}`);
      }
      if (state.limits.cooldownSec !== template.cooldownSec) {
        throw new Error(`CooldownSec mismatch for template ${tId}`);
      }
      if (state.limits.withdrawDelaySec !== template.withdrawDelaySec) {
        throw new Error(`WithdrawDelaySec mismatch for template ${tId}`);
      }
      console.log(`      Parameters verified for template: ${template.id} (PASS)`);
    }

    console.log('\n[3/3] Checking factory.vaultsOf(owner)...');
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > 50n ? currentBlock - 50n : 0n;
    const logs = await client.getLogs({
      address: factoryAddress,
      event: parseAbiItem(
        'event VaultCreated(address indexed owner, address vault, address trader)',
      ),
      fromBlock,
    });
    console.log(`      VaultCreated events count: ${logs.length} (expected 3)`);
    if (logs.length !== 3) {
      throw new Error(`Expected 3 VaultCreated events, found ${logs.length}`);
    }

    console.log(
      '\n=== Smoke test PASSED: all 3 templates successfully deployed and verified on fork ===',
    );
  } finally {
    console.log('Shutting down local Anvil process...');
    anvil.kill('SIGTERM');
  }
}

runForkTemplateSmoke().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
