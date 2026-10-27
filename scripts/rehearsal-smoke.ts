/**
 * scripts/rehearsal-smoke.ts
 * Exercises the newly deployed demo factory from the rehearsal deployment
 * using the real AgentClient from @seiyaku/agent-sdk on local fork.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  keccak256,
  encodeAbiParameters,
  pad,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { XLAYER_ADDRESSES } from './config/xlayer.js';
import {
  mandateVaultFactoryAbi,
  erc20Abi,
  mandateVaultAbi,
} from '../packages/agent-sdk/src/abi/index.js';
import { AgentClient, xLayerChain } from '../packages/agent-sdk/src/client.js';

const RPC_URL = 'http://127.0.0.1:8545';
const OWNER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const TRADER_KEY = '0x5de4111afa1a4b94908f83103eb2f954b0a473774953a3ed85c2b0056900a2db' as const;

async function main() {
  console.log('================================================================');
  console.log('         REHEARSAL SMOKE TEST ON FRESH DEMO FACTORY            ');
  console.log('================================================================\n');

  // Load demo factory deployment record
  const demoRecordPath = path.resolve('deployments/mainnet/factory-demo.json');
  if (!fs.existsSync(demoRecordPath)) {
    throw new Error('deployments/mainnet/factory-demo.json not found!');
  }
  const demoRecord = JSON.parse(fs.readFileSync(demoRecordPath, 'utf8'));
  const factoryAddress = getAddress(demoRecord.factory);
  console.log(`Demo Factory Address: ${factoryAddress}`);
  console.log(`Loosen Delay:         ${demoRecord.loosenDelaySec}s`);

  const publicClient = createPublicClient({ chain: xLayerChain, transport: http(RPC_URL) });
  const ownerAccount = privateKeyToAccount(OWNER_KEY);
  const traderAccount = privateKeyToAccount(TRADER_KEY);

  const ownerWallet = createWalletClient({
    chain: xLayerChain,
    account: ownerAccount,
    transport: http(RPC_URL),
  });

  // Fund the owner with USDC on the fork by writing the balance slot (native USDC keeps balances in slot 9).
  console.log('[1/6] Funding Owner with USDC on the fork (balance slot write)...');
  // The trader needs native OKB for gas, and the owner may not have any either on a fresh fork.
  for (const who of [traderAccount.address, ownerAccount.address]) {
    await publicClient.request({
      // @ts-expect-error Anvil custom RPC method
      method: 'anvil_setBalance',
      params: [who, '0x56BC75E2D63100000'],
    });
  }
  const ownerSlot = keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [ownerAccount.address, 9n]),
  );
  await publicClient.request({
    // @ts-expect-error Anvil custom RPC method
    method: 'anvil_setStorageAt',
    params: [XLAYER_ADDRESSES.usdc, ownerSlot, pad(toHex(100_000_000n), { size: 32 })],
  });
  console.log(`Owner ${ownerAccount.address} funded with 100 USDC.`);

  // Create Vault on demo factory
  console.log('\n[2/6] Creating Vault via Demo Factory...');
  const now = (await publicClient.getBlock({ blockTag: 'latest' })).timestamp;
  const initialLimits = {
    maxTradeBase: 20_000_000n, // 20 USDC
    maxDailyBase: 50_000_000n, // 50 USDC
    maxTradesPerDay: 5,
    cooldownSec: 60,
    expiresAt: now + 86400n * 30n,
    withdrawDelaySec: 3600,
  };

  const createTx = await ownerWallet.writeContract({
    address: factoryAddress,
    abi: mandateVaultFactoryAbi,
    functionName: 'createVault',
    args: [traderAccount.address, initialLimits, [XLAYER_ADDRESSES.wokb]],
  });
  await publicClient.waitForTransactionReceipt({ hash: createTx });

  const vaults = await publicClient.readContract({
    address: factoryAddress,
    abi: mandateVaultFactoryAbi,
    functionName: 'vaultsOf',
    args: [ownerAccount.address],
  });
  const vaultAddress = vaults[vaults.length - 1];
  console.log(`Vault deployed at: ${vaultAddress}`);

  // Deposit 50 USDC
  console.log('\n[3/6] Depositing 50 USDC into Vault...');
  const approveTx = await ownerWallet.writeContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'approve',
    args: [vaultAddress, 50_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  const depositTx = await ownerWallet.writeContract({
    address: vaultAddress,
    abi: mandateVaultAbi,
    functionName: 'deposit',
    args: [50_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  const vaultUsdcBal = await publicClient.readContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });
  console.log(`Vault USDC balance: ${vaultUsdcBal / 1_000_000n} USDC`);

  // Initialize SDK AgentClient
  console.log('\n[4/6] Trader executes trade via @seiyaku/agent-sdk AgentClient...');
  const agentClient = new AgentClient({
    vault: vaultAddress,
    account: traderAccount,
    rpcUrls: [RPC_URL],
  });

  const check = await agentClient.check({
    side: 'buy',
    token: XLAYER_ADDRESSES.wokb,
    amountIn: 10_000_000n, // 10 USDC
  });
  console.log(`check allowed: ${check.allowed}, inputBits: 0x${check.inputBits.toString(16)}`);
  if (!check.allowed) {
    throw new Error('Expected trade to be allowed by check()!');
  }

  const tradeRes = await agentClient.trade(
    {
      side: 'buy',
      token: XLAYER_ADDRESSES.wokb,
      amountIn: 10_000_000n,
    },
    { send: true },
  );
  console.log(
    `Trade executed! status: ${tradeRes.status}, txHash: ${tradeRes.txHash}, gas: ${tradeRes.gasUsed}`,
  );

  // Blocked trade through SDK (exceeds 20 USDC limit)
  console.log('\n[5/6] Attempting blocked trade (30 USDC > 20 USDC limit)...');
  const blockedCheck = await agentClient.check({
    side: 'buy',
    token: XLAYER_ADDRESSES.wokb,
    amountIn: 30_000_000n,
  });
  console.log(
    `blockedCheck allowed: ${blockedCheck.allowed}, inputBits: 0b${blockedCheck.inputBits.toString(2)}`,
  );
  if (blockedCheck.allowed) {
    throw new Error('Expected 30 USDC trade to be BLOCKED!');
  }
  console.log(`Failing reasons: ${blockedCheck.reasons.map((r) => r.text).join('; ')}`);
  console.log('Rule correctly blocked trade pre-flight without spending gas.');

  // Queued loosening and timelock test (120s)
  console.log('\n[6/6] Queuing loosening (maxTrade 20 -> 40 USDC) on Demo Factory...');
  const loosenedLimits = {
    ...initialLimits,
    maxTradeBase: 40_000_000n,
  };
  const queueTx = await ownerWallet.writeContract({
    address: vaultAddress,
    abi: mandateVaultAbi,
    functionName: 'queueLoosen',
    args: [loosenedLimits, [], false],
  });
  await publicClient.waitForTransactionReceipt({ hash: queueTx });
  console.log('Loosening queued. Warping 121s (demo factory loosenDelay = 120s)...');

  await publicClient.request({
    // @ts-expect-error Anvil custom RPC method
    method: 'evm_increaseTime',
    params: [121],
  });
  await publicClient.request({
    // @ts-expect-error Anvil custom RPC method
    method: 'evm_mine',
    params: [],
  });

  const applyTx = await ownerWallet.writeContract({
    address: vaultAddress,
    abi: mandateVaultAbi,
    functionName: 'executeLoosen',
    args: [],
  });
  await publicClient.waitForTransactionReceipt({ hash: applyTx });
  console.log('Loosening applied successfully after timelock!');

  console.log('\n================================================================');
  console.log('    REHEARSAL SMOKE TEST PASSED FULLY END-TO-END!               ');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
