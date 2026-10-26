/**
 * scripts/verify-fork-smoke.ts
 * Exercises on-chain pin verification and live eval against a real Anvil fork of X Layer:
 * 1. Verifies a freshly deployed vault -> asserts allMatch = true (PASS).
 * 2. Verifies with an altered netlist hash expectation -> asserts allMatch = false (FAIL).
 * 3. Evaluates live on-chain processor.eval() vs local simulator.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, getAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayerChain, DEFAULT_TOKENS } from '../apps/web/src/chain/config.js';
import { sendCreateVault } from '../apps/web/src/chain/factory.js';
import { VAULT_TEMPLATES, templateToLimits } from '../apps/web/src/features/create/templates.js';
import {
  resolveContractType,
  fetchVerificationReport,
  evaluateOnChain,
  evaluateLocally,
} from '../apps/web/src/features/verify/verifyHelpers.js';

const ANVIL_PORT = 8545;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const THROW_AWAY_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

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
      // Retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for anvil fork at ${url}`);
}

async function runVerifySmoke() {
  console.log('=== P3-T05 Verify Page Fork Smoke Test ===\n');

  console.log('Starting local Anvil fork of X Layer (chain 196)...');
  const anvil: ChildProcess = spawn(
    'anvil',
    ['--fork-url', 'https://rpc.xlayer.tech', '--port', String(ANVIL_PORT)],
    { shell: true, stdio: 'ignore' },
  );

  try {
    await waitRpc(RPC_URL);
    console.log(`Fork ready at ${RPC_URL}\n`);

    // 1. Deploy factory & circuits
    console.log('[1/4] Deploying factory & circuits on fork...');
    const deployScript = spawnSync('npx', ['tsx', 'scripts/deploy-fork.ts'], {
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, FORK_RPC_URL: RPC_URL },
    });
    if (deployScript.status !== 0) {
      console.error(deployScript.stderr || deployScript.stdout);
      throw new Error(`deploy-fork failed with code ${deployScript.status}`);
    }

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

    // 2. Create fresh vault
    console.log('[2/4] Deploying fresh MandateVault...');
    const block = await client.getBlock({ blockTag: 'latest' });
    const nowSec = Number(block.timestamp);
    const limits = templateToLimits(VAULT_TEMPLATES.balanced, nowSec);

    const { vaultAddress } = await sendCreateVault({
      walletClient: wallet,
      publicClient: client,
      factoryAddress,
      trader: account.address,
      limits,
      allowedTokens: [DEFAULT_TOKENS.wokb.address],
    });
    console.log(`      Vault deployed at: ${vaultAddress}`);

    // Resolve contract types
    const vaultType = await resolveContractType(client, vaultAddress);
    console.log(`      Resolved contract type: ${vaultType}`);
    if (vaultType !== 'vault') {
      throw new Error(`Expected type 'vault', got '${vaultType}'`);
    }

    // 3. Pin Verification: Expect PASS
    console.log('\n[3/4] Verifying security pins on fresh vault (Expected: PASS)...');
    const passReport = await fetchVerificationReport(client, vaultAddress, 'vault');
    console.log(`      Overall match: ${passReport.allMatch ? 'PASS' : 'FAIL'}`);
    console.log(`      Netlist hash match: ${passReport.netlistHashMatch}`);
    console.log(`      Beacon implementation match: ${passReport.beaconImplMatch}`);
    console.log(`      Codehash match: ${passReport.codehashMatch}`);
    console.log(`      Beacon owner == 0x0: ${passReport.beaconOwnerZero}`);

    if (!passReport.allMatch) {
      throw new Error('Fresh vault failed pin verification!');
    }
    console.log('      [PASS VERIFIED]');

    // 4. Pin Verification with altered netlist hash: Expect FAIL
    console.log('\n[4/4] Verifying with altered netlist hash expectation (Expected: FAIL)...');
    const alteredHash: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const failReport = await fetchVerificationReport(client, vaultAddress, 'vault', alteredHash);
    console.log(`      Overall match: ${failReport.allMatch ? 'PASS' : 'FAIL'}`);
    console.log(`      Netlist hash match: ${failReport.netlistHashMatch}`);

    if (failReport.allMatch || failReport.netlistHashMatch) {
      throw new Error('Altered hash did not fail pin verification!');
    }
    console.log('      [FAIL VERIFIED: Correctly rejected altered netlist hash]');

    // 5. Test Live on-chain eval()
    console.log('\n[5/5] Testing processor.eval() vs local simulator...');
    const testCases = [
      { name: 'Normal Buy (0x0ff)', bits: 0x0ff, expected: true },
      { name: 'Normal Exit (0x101)', bits: 0x101, expected: true },
      { name: 'Blocked (Insane sane=0, 0x0fe)', bits: 0x0fe, expected: false },
      { name: 'Blocked (Cooldown 0, 0x07f)', bits: 0x07f, expected: false },
    ];

    for (const tc of testCases) {
      const local = evaluateLocally(tc.bits);
      const onchain = await evaluateOnChain(
        client,
        passReport.processor,
        passReport.circuitId,
        tc.bits,
      );
      console.log(
        `      Case "${tc.name}": local=${local}, onchain=${onchain}, matches=${local === onchain}`,
      );
      if (local !== tc.expected || onchain !== tc.expected) {
        throw new Error(`Case "${tc.name}" failed: expected ${tc.expected}`);
      }
    }

    console.log('\nAll verify fork smoke checks passed cleanly!');
  } finally {
    anvil.kill();
    spawnSync('git', ['restore', 'contracts/test/fork/Generated.sol']);
  }
}

runVerifySmoke().catch((err) => {
  console.error('Fatal error in smoke test:', err);
  process.exit(1);
});
