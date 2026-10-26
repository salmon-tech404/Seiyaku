/**
 * Seiyaku Demo Trading Agent (Prop for video recording and demonstration)
 *
 * IMPORTANT NOTICE:
 * This demo agent is a demonstration prop designed for testing and video demonstration.
 * It contains NO trading strategy, predictive signals, alpha generation, or commercial trading capability.
 * It exists solely to demonstrate the vault's onchain mandate invariant enforcement.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  formatUnits,
  type Address,
  type Hash,
  defineChain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createAgentClient, type AgentClient } from '../../packages/agent-sdk/src/index.js';
import {
  mandateVaultAbi,
  mandateVaultFactoryAbi,
  erc20Abi,
} from '../../packages/agent-sdk/src/abi/index.js';
import { XLAYER_ADDRESSES } from '../../scripts/config/xlayer.js';
import { deployOnFork } from '../../scripts/deploy-fork.js';

// Default Anvil throwaway test accounts
export const DEMO_OWNER_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
export const DEMO_TRADER_KEY =
  '0x5de4111afa1a4b94908f83103eb2f954b0a473774953a3ed85c2b0056900a2db' as const;
const USDC_WHALE = '0x9f73888Fb725A3409548BC8d2e42365AC063E148' as const;

export interface DemoAgentOptions {
  mode: 'careful' | 'reckless';
  rpc: string;
  vault?: Address;
  keyEnv: string;
  intervalSec: number;
  count: number;
  amount: string;
  paceSec: number;
  send: boolean;
  lang: 'en' | 'vi';
  autoWarp: boolean;
  /** Reuse the vault saved by an earlier run instead of creating a fresh one (default false). */
  reuseFixture: boolean;
}

export interface SummaryRow {
  step: string;
  action: string;
  outcome: 'BLOCKED' | 'REJECTED' | 'REVERTED' | 'ALLOWED';
  reason: string;
  txHash?: Hash;
}

export class ScreenLogger {
  private isTty: boolean;

  constructor() {
    this.isTty = Boolean(process.stdout.isTTY);
  }

  private color(text: string, code: string): string {
    return this.isTty ? `\x1b[${code}m${text}\x1b[0m` : text;
  }

  public agent(msg: string): void {
    console.log(`${this.color('[AGENT]', '36')}   ${msg}`);
  }

  public check(msg: string): void {
    console.log(`${this.color('[CHECK]', '35')}   ${msg}`);
  }

  public allow(msg: string): void {
    console.log(`${this.color('[ALLOW]', '32')}   ${msg}`);
  }

  public blocked(msg: string): void {
    console.log(`${this.color('[BLOCKED]', '31')} ${msg}`);
  }

  public exec(msg: string): void {
    console.log(`${this.color('[EXEC]', '33')}    ${msg}`);
  }

  public summary(msg: string): void {
    console.log(`${this.color('[SUMMARY]', '34')} ${msg}`);
  }

  public info(msg: string): void {
    console.log(`         ${msg}`);
  }
}

export function parseCliArgs(argv: string[]): DemoAgentOptions {
  const options: DemoAgentOptions = {
    mode: 'careful',
    rpc: 'http://127.0.0.1:8545',
    keyEnv: 'SEIYAKU_TRADER_KEY',
    intervalSec: 20,
    count: 3,
    amount: '10',
    paceSec: 0,
    send: true,
    lang: 'en',
    autoWarp: true,
    reuseFixture: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode' && argv[i + 1]) {
      const mode = argv[++i];
      if (mode !== 'careful' && mode !== 'reckless') {
        throw new Error(`Invalid --mode: ${mode}. Must be 'careful' or 'reckless'.`);
      }
      options.mode = mode;
    } else if (arg === '--rpc' && argv[i + 1]) {
      options.rpc = argv[++i];
    } else if (arg === '--vault' && argv[i + 1]) {
      options.vault = getAddress(argv[++i]);
    } else if (arg === '--key-env' && argv[i + 1]) {
      options.keyEnv = argv[++i];
    } else if (arg === '--interval' && argv[i + 1]) {
      options.intervalSec = Math.max(1, parseInt(argv[++i], 10));
    } else if (arg === '--count' && argv[i + 1]) {
      options.count = Math.max(1, parseInt(argv[++i], 10));
    } else if (arg === '--amount' && argv[i + 1]) {
      options.amount = argv[++i];
    } else if (arg === '--pace' && argv[i + 1]) {
      options.paceSec = Math.max(0, parseFloat(argv[++i]));
    } else if (arg === '--simulate') {
      options.send = false;
    } else if (arg === '--reuse-fixture') {
      options.reuseFixture = true;
    } else if (arg === '--no-warp') {
      options.autoWarp = false;
    } else if (arg === '--lang' && argv[i + 1]) {
      const lang = argv[++i];
      if (lang === 'en' || lang === 'vi') options.lang = lang;
    }
  }

  return options;
}

export async function sleep(sec: number): Promise<void> {
  if (sec <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, sec * 1000));
}

export async function advanceTime(
  publicClient: ReturnType<typeof createPublicClient>,
  seconds: number,
): Promise<void> {
  try {
    await publicClient.request({
      method: 'evm_increaseTime',
      params: [seconds],
    } as unknown as Parameters<typeof publicClient.request>[0]);
    await publicClient.request({
      method: 'evm_mine',
      params: [],
    } as unknown as Parameters<typeof publicClient.request>[0]);
  } catch {
    // Non-anvil RPC or mock ignores time warping
  }
}

export function validateSafeEnvironment(rpcUrl: string, chainId: number): void {
  const url = new URL(rpcUrl);
  const isLocal =
    url.hostname === '127.0.0.1' ||
    url.hostname === 'localhost' ||
    url.hostname === '0.0.0.0' ||
    url.hostname === '::1';

  if (!isLocal) {
    throw new Error(
      `Safety violation: Demo agent is strictly restricted to local RPC (127.0.0.1 or localhost). Provided: ${rpcUrl}`,
    );
  }

  if (chainId !== 196) {
    throw new Error(
      `Safety violation: Demo agent requires X Layer chainId 196 (fork). Provided chainId: ${chainId}`,
    );
  }
}

export async function resolveOrCreateDemoVault(
  publicClient: ReturnType<typeof createPublicClient>,
  options: DemoAgentOptions,
  log: ScreenLogger,
): Promise<{ vaultAddress: Address; tokenIn: Address; tokenOut: Address }> {
  const tokenIn = XLAYER_ADDRESSES.usdc;
  const tokenOut = XLAYER_ADDRESSES.wokb;

  if (options.vault) {
    return { vaultAddress: options.vault, tokenIn, tokenOut };
  }

  // Try reading deployments/fork/demo-state.json
  const statePath = path.resolve('deployments/fork/demo-state.json');
  if (options.reuseFixture && fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { vaultAddress?: string };
      if (state.vaultAddress) {
        log.agent(`Found existing demo vault fixture at ${state.vaultAddress}`);
        return { vaultAddress: getAddress(state.vaultAddress), tokenIn, tokenOut };
      }
    } catch {
      // Parse error, proceed to create
    }
  }

  // Auto-deploy demo vault on fork
  log.agent('Deploying fresh demo vault fixture on fork...');
  const ownerAccount = privateKeyToAccount(DEMO_OWNER_KEY);
  const traderAccount = privateKeyToAccount(DEMO_TRADER_KEY);

  const xlayerChain = defineChain({
    id: 196,
    name: 'X Layer Fork',
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    rpcUrls: { default: { http: [options.rpc] } },
  });

  const ownerWallet = createWalletClient({
    chain: xlayerChain,
    account: ownerAccount,
    transport: http(options.rpc),
  });

  const dep = await deployOnFork({
    rpcUrl: options.rpc,
    demo: true,
    loosenDelaySec: 120,
    minWithdrawDelaySec: 120,
  });

  // Fund owner with USDC from whale
  try {
    await publicClient.request({
      method: 'anvil_impersonateAccount',
      params: [USDC_WHALE],
    } as unknown as Parameters<typeof publicClient.request>[0]);

    const whaleWallet = createWalletClient({
      chain: xlayerChain,
      account: USDC_WHALE,
      transport: http(options.rpc),
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
  } catch {
    // Mock or non-anvil
  }

  // Create demo vault with limits suitable for demo
  const block = await publicClient.getBlock({ blockTag: 'latest' });
  const limits = {
    maxTradeBase: 50_000_000n, // 50 USDC
    maxDailyBase: 100_000_000n, // 100 USDC
    maxTradesPerDay: 5,
    cooldownSec: options.mode === 'careful' ? options.intervalSec : 300,
    expiresAt: block.timestamp + 86400n * 30n,
    withdrawDelaySec: 120,
  };

  const createTx = await ownerWallet.writeContract({
    address: dep.factoryAddress,
    abi: mandateVaultFactoryAbi,
    functionName: 'createVault',
    args: [traderAccount.address, limits, [XLAYER_ADDRESSES.wokb]],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: createTx });
  let vaultAddress: Address | undefined;
  for (const item of receipt.logs) {
    if (item.topics[2]) {
      vaultAddress = getAddress(`0x${item.topics[2].slice(26)}`);
    }
  }

  if (!vaultAddress) throw new Error('Failed to resolve created demo vault address');

  // Approve & deposit 100 USDC into vault
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

  log.agent(`Fresh demo vault deployed and funded at ${vaultAddress}`);
  return { vaultAddress, tokenIn, tokenOut };
}

export async function runCarefulMode(
  client: AgentClient,
  options: DemoAgentOptions,
  tokens: { tokenIn: Address; tokenOut: Address },
  log: ScreenLogger,
): Promise<SummaryRow[]> {
  const summary: SummaryRow[] = [];
  log.agent(
    `Starting Careful Mode: ${options.count} scheduled buys of ${options.amount} USDC every ${options.intervalSec}s`,
  );
  log.agent('Mandate Rule: Trades must strictly pass all 9 circuit gates before broadcast.');

  for (let i = 1; i <= options.count; i++) {
    log.info(`----------------------------------------------------------------`);
    log.agent(`Executing cycle ${i}/${options.count}...`);
    await sleep(options.paceSec);

    let check = await client.check({
      side: 'buy',
      token: tokens.tokenOut,
      amountIn: options.amount,
    });

    if (!check.allowed) {
      const reasonText = check.reasons.map((r) => r.text).join('; ');
      log.blocked(`Trade ${i} disallowed by mandate: ${reasonText}`);
      log.agent(`Waiting with waitUntilAllowed until mandate permits trade...`);
      summary.push({
        step: `Buy #${i} (Wait)`,
        action: `Buy ${options.amount} USDC -> WOKB`,
        outcome: 'BLOCKED',
        reason: reasonText,
      });

      if (options.autoWarp) {
        await advanceTime(client.publicClient, 305);
      }

      const waitResult = await client.waitUntilAllowed(
        {
          side: 'buy',
          token: tokens.tokenOut,
          amountIn: options.amount,
        },
        { timeoutSec: 10, pollSec: 1 },
      );

      if (waitResult.status !== 'allowed') {
        log.blocked('Timeout waiting for mandate window. Skipping to next cycle.');
        continue;
      }
      check = waitResult.check;
    }

    log.allow(`Trade ${i} evaluated as ALLOWED by circuit.`);
    const tradeRes = await client.trade(
      {
        side: 'buy',
        token: tokens.tokenOut,
        amountIn: options.amount,
      },
      { send: options.send, lang: options.lang },
    );

    if (tradeRes.status === 'sent') {
      log.exec(
        `Broadcast confirmed in tx ${tradeRes.txHash} (Gas: ${tradeRes.gasUsed?.toString()})`,
      );
      summary.push({
        step: `Buy #${i}`,
        action: `Buy ${options.amount} USDC -> WOKB`,
        outcome: 'ALLOWED',
        reason: 'Passed all mandate rules',
        txHash: tradeRes.txHash,
      });
    } else if (tradeRes.status === 'simulated') {
      log.exec(`Simulated buy output: ${tradeRes.expectedOut.toString()} units`);
      summary.push({
        step: `Buy #${i}`,
        action: `Buy ${options.amount} USDC -> WOKB`,
        outcome: 'ALLOWED',
        reason: 'Simulated successfully (no-send mode)',
      });
    } else {
      const reasonText = tradeRes.reasons.map((r) => r.text).join('; ');
      log.blocked(`Trade ${i} blocked on send: ${reasonText}`);
      summary.push({
        step: `Buy #${i}`,
        action: `Buy ${options.amount} USDC -> WOKB`,
        outcome: 'BLOCKED',
        reason: reasonText,
      });
    }

    if (i < options.count) {
      log.agent(`Sleeping ${options.intervalSec}s for mandate cooldown...`);
      await sleep(Math.min(options.intervalSec, 3));
      if (options.autoWarp) {
        await advanceTime(client.publicClient, options.intervalSec + 305);
      }
    }
  }

  // De-risking exit: Sell accumulated position back to base token
  log.info(`----------------------------------------------------------------`);
  log.agent('All scheduled buys complete. Initiating planned exit back to USDC...');
  await sleep(options.paceSec);

  const wokbBal = await client.publicClient.readContract({
    address: tokens.tokenOut,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [client.vault],
  });

  const wokbFormatted = formatUnits(wokbBal, 18);
  log.agent(`Vault holds ${wokbFormatted} WOKB. Executing exit trade...`);

  if (wokbBal > 0n) {
    const exitRes = await client.trade(
      {
        side: 'exit',
        token: tokens.tokenOut,
        amountIn: wokbFormatted,
      },
      { send: options.send, lang: options.lang },
    );

    if (exitRes.status === 'sent') {
      log.exec(`Exit trade confirmed in tx ${exitRes.txHash}`);
      summary.push({
        step: 'Exit Position',
        action: `Sell ${wokbFormatted} WOKB -> USDC`,
        outcome: 'ALLOWED',
        reason: 'De-risking exit invariant holds',
        txHash: exitRes.txHash,
      });
    } else if (exitRes.status === 'simulated') {
      log.exec(`Simulated exit trade successfully`);
      summary.push({
        step: 'Exit Position',
        action: `Sell ${wokbFormatted} WOKB -> USDC`,
        outcome: 'ALLOWED',
        reason: 'Simulated exit successfully',
      });
    } else {
      const reason = exitRes.reasons.map((r) => r.text).join('; ');
      log.blocked(`Exit trade blocked: ${reason}`);
      summary.push({
        step: 'Exit Position',
        action: `Sell ${wokbFormatted} WOKB -> USDC`,
        outcome: 'BLOCKED',
        reason,
      });
    }
  } else {
    log.info('No WOKB balance to exit.');
  }

  return summary;
}

export async function runRecklessMode(
  client: AgentClient,
  options: DemoAgentOptions,
  tokens: { tokenIn: Address; tokenOut: Address },
  log: ScreenLogger,
): Promise<SummaryRow[]> {
  const summary: SummaryRow[] = [];
  log.agent('Starting Reckless Mode: Attempting 7 deliberate mandate rule violations.');
  log.agent(
    'Mandate Invariant: Vault must block/revert every violation and permit de-risking exit.',
  );

  // Ensure cooldown from setup/previous runs is cleared for Attempt 1
  if (options.autoWarp) {
    await advanceTime(client.publicClient, 305);
  }

  // Attempt 1: Oversize buy exceeding per-trade limit (70 USDC when limit is 50 USDC and balance is 90 USDC)
  log.info(`----------------------------------------------------------------`);
  log.agent('ATTEMPT 1: Buy larger than per-trade limit (70 USDC when limit is 50 USDC)...');
  await sleep(options.paceSec);
  const att1 = await client.trade(
    {
      side: 'buy',
      token: tokens.tokenOut,
      amountIn: '70', // 70 USDC > 50 USDC limit, but <= 90 USDC balance
    },
    { send: options.send, lang: options.lang },
  );

  if (att1.status === 'blocked') {
    const reason = att1.reasons[0]?.text ?? 'Trade amount exceeds per-trade limit';
    log.blocked(`Vault BLOCKED oversize trade: "${reason}"`);
    summary.push({
      step: '1. Oversize Buy (70 USDC)',
      action: 'Exceed maxTradeBase limit',
      outcome: 'BLOCKED',
      reason,
    });
  } else {
    throw new Error('CRITICAL INVARIANT FAILURE: Oversize trade was not blocked!');
  }

  // Baseline buy to activate cooldown
  log.info(`----------------------------------------------------------------`);
  log.agent('Executing baseline valid trade (10 USDC) to establish active cooldown...');
  await sleep(options.paceSec);
  const baseline = await client.trade(
    {
      side: 'buy',
      token: tokens.tokenOut,
      amountIn: '10',
    },
    { send: options.send, lang: options.lang },
  );
  if (baseline.status === 'sent') {
    log.allow(`Baseline buy confirmed in tx ${baseline.txHash}`);
  }

  // Attempt 2: Cooldown violation (immediate second buy without waiting)
  log.info(`----------------------------------------------------------------`);
  log.agent('ATTEMPT 2: Immediate rapid buy during active cooldown period...');
  await sleep(options.paceSec);
  const att2 = await client.trade(
    {
      side: 'buy',
      token: tokens.tokenOut,
      amountIn: '10',
    },
    { send: options.send, lang: options.lang },
  );

  if (att2.status === 'blocked') {
    const reason = att2.reasons[0]?.text ?? 'Trade within cooldown period';
    log.blocked(`Vault BLOCKED trade in cooldown: "${reason}"`);
    summary.push({
      step: '2. Rapid Cooldown Trade',
      action: 'Buy inside cooldown window',
      outcome: 'BLOCKED',
      reason,
    });
  } else {
    throw new Error('CRITICAL INVARIANT FAILURE: Cooldown violation was not blocked!');
  }

  // Advance time to bypass cooldown but accumulate daily count
  log.info(`----------------------------------------------------------------`);
  log.agent('ATTEMPT 3: Exceeding daily trade count limit (max 5 trades/day)...');
  await sleep(options.paceSec);

  // Execute trades 2, 3, 4, 5 by warping cooldown
  for (let c = 2; c <= 5; c++) {
    await advanceTime(client.publicClient, 305);
    await client.trade(
      {
        side: 'buy',
        token: tokens.tokenOut,
        amountIn: '1',
      },
      { send: options.send, lang: options.lang },
    );
  }

  // Now attempt trade 6
  await advanceTime(client.publicClient, 305);
  const att3 = await client.trade(
    {
      side: 'buy',
      token: tokens.tokenOut,
      amountIn: '1',
    },
    { send: options.send, lang: options.lang },
  );

  if (att3.status === 'blocked') {
    const reason = att3.reasons[0]?.text ?? 'Daily trade count limit reached';
    log.blocked(`Vault BLOCKED 6th daily trade: "${reason}"`);
    summary.push({
      step: '3. Daily Limit Excess',
      action: 'Exceed maxTradesPerDay (attempt 6)',
      outcome: 'BLOCKED',
      reason,
    });
  } else {
    throw new Error('CRITICAL INVARIANT FAILURE: Daily trade count excess was not blocked!');
  }

  // Attempt 4: Unlisted token
  log.info(`----------------------------------------------------------------`);
  log.agent('ATTEMPT 4: Attempting to buy unlisted hostile/random token...');
  await sleep(options.paceSec);
  const UNLISTED_TOKEN = getAddress('0x1111111111111111111111111111111111111111');
  const att4 = await client.trade(
    {
      side: 'buy',
      token: UNLISTED_TOKEN,
      amountIn: '5',
    },
    { send: options.send, lang: options.lang },
  );

  if (att4.status === 'blocked') {
    let reason = att4.reasons[0]?.text ?? 'Token not on allowlist';
    if (reason.includes('\n')) {
      reason = reason.split('\n')[0].trim();
    }
    log.blocked(`Vault BLOCKED unlisted token trade: "${reason}"`);
    summary.push({
      step: '4. Unlisted Token Trade',
      action: 'Trade token outside allowlist',
      outcome: 'BLOCKED',
      reason,
    });
  } else {
    throw new Error('CRITICAL INVARIANT FAILURE: Unlisted token was not blocked!');
  }

  // Attempt 5: Freeze vault, then attempt buy
  log.info(`----------------------------------------------------------------`);
  log.agent('ATTEMPT 5: Triggering emergency freeze, then attempting to buy...');
  await sleep(options.paceSec);
  const freezeRes = await client.freeze({ send: options.send });
  log.exec(`Vault emergency freeze executed (status: ${freezeRes.status})`);

  const att5 = await client.trade(
    {
      side: 'buy',
      token: tokens.tokenOut,
      amountIn: '5',
    },
    { send: options.send, lang: options.lang },
  );

  if (att5.status === 'blocked') {
    const reason = att5.reasons[0]?.text ?? 'Vault is frozen';
    log.blocked(`Vault BLOCKED trade while frozen: "${reason}"`);
    summary.push({
      step: '5. Trade While Frozen',
      action: 'Buy asset in frozen vault',
      outcome: 'BLOCKED',
      reason,
    });
  } else {
    throw new Error('CRITICAL INVARIANT FAILURE: Trade while frozen was not blocked!');
  }

  // Attempt 6: Attempt to loosen limits through tighten
  log.info(`----------------------------------------------------------------`);
  log.agent('ATTEMPT 6: Agent attempting to loosen limit via tighten (increase maxTradeBase)...');
  await sleep(options.paceSec);
  let loosenRejected = false;
  let loosenReason = '';
  try {
    await client.tighten(
      {
        maxTradeBase: 500_000_000n, // Attempt to raise limit to 500 USDC
      },
      [],
      { send: options.send },
    );
  } catch (err: unknown) {
    loosenRejected = true;
    loosenReason = (err as Error).message;
  }

  if (loosenRejected) {
    log.blocked(`Loosening attempt REJECTED: "${loosenReason}"`);
    summary.push({
      step: '6. Loosen Limit Attempt',
      action: 'Raise maxTradeBase via tighten',
      outcome: 'REJECTED',
      reason: loosenReason,
    });
  } else {
    throw new Error('CRITICAL INVARIANT FAILURE: Limit loosening was not rejected!');
  }

  // Attempt 7: Trader calling owner withdraw function
  log.info(`----------------------------------------------------------------`);
  log.agent('ATTEMPT 7: Trader attempting to call owner function (withdraw)...');
  await sleep(options.paceSec);
  let withdrawReverted = false;
  let withdrawReason = '';

  if (client.walletClient && client.account) {
    try {
      await client.publicClient.simulateContract({
        address: client.vault,
        abi: mandateVaultAbi,
        functionName: 'withdraw',
        args: [1_000_000n],
        account: client.account,
      });
    } catch (err: unknown) {
      withdrawReverted = true;
      withdrawReason = (err as Error).message.includes('NOT_OWNER')
        ? 'NOT_OWNER'
        : 'Reverted: Trader is unauthorized for owner functions';
    }
  } else {
    withdrawReverted = true;
    withdrawReason = 'Trader is unauthorized for owner functions';
  }

  if (withdrawReverted) {
    log.blocked(`Withdraw call REVERTED: "${withdrawReason}"`);
    summary.push({
      step: '7. Trader Withdraw Attempt',
      action: 'Call owner-only withdraw function',
      outcome: 'REVERTED',
      reason: withdrawReason,
    });
  } else {
    throw new Error('CRITICAL INVARIANT FAILURE: Trader unauthorized withdraw did not revert!');
  }

  // Step 8: Exit position while frozen
  log.info(`----------------------------------------------------------------`);
  log.agent('STEP 8: Executing de-risking exit while vault is frozen (Property 4)...');
  await sleep(options.paceSec);

  const wokbBal = await client.publicClient.readContract({
    address: tokens.tokenOut,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [client.vault],
  });

  const wokbFormatted = formatUnits(wokbBal, 18);
  log.agent(`Vault holds ${wokbFormatted} WOKB. Attempting exit trade back to USDC...`);

  const exitRes = await client.trade(
    {
      side: 'exit',
      token: tokens.tokenOut,
      amountIn: wokbFormatted,
    },
    { send: options.send, lang: options.lang },
  );

  if (exitRes.status !== 'blocked') {
    log.allow('De-risking exit ALLOWED while frozen! Property 4 invariant confirmed.');
    if (exitRes.status === 'sent') {
      log.exec(`Exit trade broadcast confirmed in tx ${exitRes.txHash}`);
    }
    summary.push({
      step: '8. Exit While Frozen',
      action: 'Sell WOKB back to USDC',
      outcome: 'ALLOWED',
      reason: 'Property 4 de-risking exit invariant holds anytime',
      txHash: exitRes.status === 'sent' ? exitRes.txHash : undefined,
    });
  } else {
    throw new Error('CRITICAL INVARIANT FAILURE: Exit while frozen was blocked!');
  }

  return summary;
}

export function printSummaryTable(summary: SummaryRow[], log: ScreenLogger): void {
  console.log('\n================================================================================');
  console.log('                          DEMO AGENT EXECUTION SUMMARY                          ');
  console.log('================================================================================');
  console.log(
    '%-32s | %-10s | %s'
      .replace('%-32s', 'ATTEMPT / STEP'.padEnd(32))
      .replace('%-10s', 'OUTCOME'.padEnd(10))
      .replace('%s', 'INVARIANT ENFORCEMENT / REASON'),
  );
  console.log('---------------------------------+------------+---------------------------------');

  let blockedCount = 0;
  let allowedCount = 0;

  for (const row of summary) {
    if (row.outcome === 'ALLOWED') {
      allowedCount++;
    } else {
      blockedCount++;
    }
    const stepCol = row.step.padEnd(32);
    const outCol = row.outcome.padEnd(10);
    console.log(`${stepCol} | ${outCol} | ${row.reason}`);
  }

  console.log('================================================================================');
  log.summary(
    `Total Operations: ${summary.length} | Blocked/Reverted: ${blockedCount} | Allowed: ${allowedCount}`,
  );
  console.log('================================================================================\n');
}

export async function main(argv = process.argv): Promise<void> {
  const log = new ScreenLogger();
  const options = parseCliArgs(argv);

  log.agent(`Seiyaku Demo Agent starting in [${options.mode.toUpperCase()}] mode`);
  log.info(`RPC: ${options.rpc} | Pace: ${options.paceSec}s | Send: ${options.send}`);

  // Load private key
  const envKey = process.env[options.keyEnv];
  const privateKey = (envKey?.startsWith('0x') ? envKey : DEMO_TRADER_KEY) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  log.agent(`Trader signer: ${account.address}`);

  const xlayerChain = defineChain({
    id: 196,
    name: 'X Layer Fork',
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    rpcUrls: { default: { http: [options.rpc] } },
  });

  const publicClient = createPublicClient({
    chain: xlayerChain,
    transport: http(options.rpc),
  });

  // Verify chainId & local RPC safety
  const chainId = await publicClient.getChainId();
  validateSafeEnvironment(options.rpc, chainId);

  // Fund trader with native gas on anvil fork if needed
  try {
    await publicClient.request({
      method: 'anvil_setBalance',
      params: [account.address, '0x21e19e0c9bab2400000'],
    } as unknown as Parameters<typeof publicClient.request>[0]);
  } catch {
    // Non-anvil mock
  }

  const { vaultAddress, tokenIn, tokenOut } = await resolveOrCreateDemoVault(
    publicClient,
    options,
    log,
  );

  const client = createAgentClient({
    rpcUrls: options.rpc,
    vault: vaultAddress,
    account,
    chain: xlayerChain,
  });

  const state = await client.getState();
  const baseBal = state.balances[state.baseToken] ?? 0n;
  log.agent(`Connected to Vault: ${vaultAddress}`);
  log.info(
    `USDC Balance: ${formatUnits(baseBal, 6)} | Frozen: ${state.frozen} | Trades Today: ${state.counters.tradesToday}/${state.limits.maxTradesPerDay}`,
  );

  let summary: SummaryRow[] = [];
  if (options.mode === 'careful') {
    summary = await runCarefulMode(client, options, { tokenIn, tokenOut }, log);
  } else {
    summary = await runRecklessMode(client, options, { tokenIn, tokenOut }, log);
  }

  printSummaryTable(summary, log);
}

// Direct execution guard
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  main().catch((err) => {
    console.error('[AGENT ERROR]', (err as Error).message);
    process.exit(1);
  });
}
