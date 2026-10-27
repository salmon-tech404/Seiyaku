/**
 * scripts/capture-p3-fix01.ts
 * Captures real screenshots of the polished web app across all required scenarios:
 * 1. home
 * 2. create-default
 * 3. create-filled
 * 4. dashboard-fresh
 * 5. dashboard-after-buy
 * 6. dashboard-pending
 * 7. verify-pass-diagram
 *
 * For each scenario: 390px (mobile) and 1280px (desktop), dark and light themes, EN and VI.
 * Total: 7 * 2 * 2 * 2 = 56 screenshots saved into docs/screens/p3-fix01/
 * Outputs manifest.json with filename, scenario, viewport, theme, lang, sha256.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium, type Browser, type Page } from '@playwright/test';
import {
  createPublicClient,
  createWalletClient,
  http as viemHttp,
  getAddress,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { deployOnFork } from './deploy-fork.js';
import { XLAYER_ADDRESSES } from './config/xlayer.js';
import {
  mandateVaultFactoryAbi,
  mandateVaultAbi,
  erc20Abi,
} from '../apps/web/src/chain/abi/index.js';
import { TEST_ACCOUNTS, getTestWalletInitScript } from '../apps/web/e2e/testWallet.js';

const OWNER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const TRADER_KEY = '0x5de4111afa1a4b94908f83103eb2f954b0a473774953a3ed85c2b0056900a2db' as const;
const USDC_WHALE = '0x9f73888Fb725A3409548BC8d2e42365AC063E148' as const;

const RPC_URL = 'http://127.0.0.1:8545';
const DIST_PORT = 4173;
const DIST_DIR = path.resolve('apps/web/dist');
const OUTPUT_DIR = path.resolve('docs/screens/p3-fix01');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

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
    console.log('Anvil fork is already available on ' + RPC_URL);
    return null;
  }

  console.log('Spawning Anvil fork on port 8545...');
  const proc = spawn(
    'anvil',
    ['--fork-url', 'https://rpc.xlayer.tech', '--port', '8545', '--chain-id', '196'],
    {
      stdio: 'ignore',
      shell: true,
    },
  );

  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isRpcAvailable(RPC_URL)) {
      console.log('Anvil fork is ready!');
      return proc;
    }
  }

  throw new Error('Anvil fork failed to respond on ' + RPC_URL);
}

function startStaticServer(): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url?.split('?')[0] || '/';
      const cleanPath = urlPath === '/' ? '/index.html' : urlPath;
      const filePath = path.join(DIST_DIR, cleanPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        const indexPath = path.join(DIST_DIR, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
          });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      }
    });

    server.listen(DIST_PORT, '127.0.0.1', () => {
      console.log(`Static server running on http://127.0.0.1:${DIST_PORT}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

interface DeployedVaults {
  factoryAddress: Address;
  freshVault: Address;
  afterBuyVault: Address;
  pendingVault: Address;
}

async function prepareForkVaults(): Promise<DeployedVaults> {
  const xlayerChain = {
    id: 196,
    name: 'X Layer',
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  } as const;

  const publicClient = createPublicClient({ chain: xlayerChain, transport: viemHttp(RPC_URL) });
  const ownerAccount = privateKeyToAccount(OWNER_KEY);
  const traderAccount = privateKeyToAccount(TRADER_KEY);

  const ownerWallet = createWalletClient({
    chain: xlayerChain,
    account: ownerAccount,
    transport: viemHttp(RPC_URL),
  });

  const traderWallet = createWalletClient({
    chain: xlayerChain,
    account: traderAccount,
    transport: viemHttp(RPC_URL),
  });

  // Fund native gas
  await publicClient.request({
    method: 'anvil_setBalance',
    params: [ownerAccount.address, '0x21e19e0c9bab2400000'],
  } as unknown as Parameters<typeof publicClient.request>[0]);
  await publicClient.request({
    method: 'anvil_setBalance',
    params: [traderAccount.address, '0x21e19e0c9bab2400000'],
  } as unknown as Parameters<typeof publicClient.request>[0]);

  // Deploy factory (120s loosen & withdraw delay)
  console.log('Deploying demo factory on fork...');
  const dep = await deployOnFork({
    rpcUrl: RPC_URL,
    demo: true,
    loosenDelaySec: 120,
    minWithdrawDelaySec: 120,
  });
  const factoryAddress = dep.factoryAddress;

  // Fund owner with USDC
  console.log('Funding owner with USDC...');
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
    transport: viemHttp(RPC_URL),
  });

  await whaleWallet.writeContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [ownerAccount.address, 2_000_000_000n], // 2,000 USDC
  });

  await publicClient.request({
    method: 'anvil_stopImpersonatingAccount',
    params: [USDC_WHALE],
  } as unknown as Parameters<typeof publicClient.request>[0]);

  const block = await publicClient.getBlock({ blockTag: 'latest' });
  const limits = {
    maxTradeBase: 50_000_000n, // 50 USDC
    maxDailyBase: 100_000_000n, // 100 USDC
    maxTradesPerDay: 5,
    cooldownSec: 300,
    expiresAt: block.timestamp + 86400n * 30n,
    withdrawDelaySec: 120,
  };

  async function createVaultHelper(): Promise<Address> {
    const tx = await ownerWallet.writeContract({
      address: factoryAddress,
      abi: mandateVaultFactoryAbi,
      functionName: 'createVault',
      args: [traderAccount.address, limits, [XLAYER_ADDRESSES.wokb]],
    });
    const rc = await publicClient.waitForTransactionReceipt({ hash: tx });
    let vAddr: Address | undefined;
    for (const log of rc.logs) {
      if (log.topics[2]) {
        vAddr = getAddress(`0x${log.topics[2].slice(26)}`);
      }
    }
    if (!vAddr) throw new Error('VaultCreated log not found');
    return vAddr;
  }

  // Vault 1: Fresh vault (0 trades, 0 deposits)
  console.log('Creating Vault 1 (Fresh)...');
  const freshVault = await createVaultHelper();

  // Vault 2: After-buy vault (100 USDC deposit + 1 buy trade)
  console.log('Creating Vault 2 (After-Buy)...');
  const afterBuyVault = await createVaultHelper();

  const approveTx2 = await ownerWallet.writeContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'approve',
    args: [afterBuyVault, 100_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx2 });

  const depTx2 = await ownerWallet.writeContract({
    address: afterBuyVault,
    abi: mandateVaultAbi,
    functionName: 'deposit',
    args: [100_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: depTx2 });

  // Execute 1 buy trade on afterBuyVault
  console.log('Executing 1 trade on Vault 2...');
  const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
  const tradeTx = await traderWallet.writeContract({
    address: afterBuyVault,
    abi: mandateVaultAbi,
    functionName: 'trade',
    args: [
      {
        tokenIn: XLAYER_ADDRESSES.usdc,
        tokenOut: XLAYER_ADDRESSES.wokb,
        feeTier: 500,
        amountIn: 10_000_000n, // 10 USDC
        amountOutMin: 1n,
        deadline: latestBlock.timestamp + 300n,
      },
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: tradeTx });

  // Vault 3: Pending vault (100 USDC deposit + queued withdrawal & loosen)
  console.log('Creating Vault 3 (Pending Items)...');
  const pendingVault = await createVaultHelper();

  const approveTx3 = await ownerWallet.writeContract({
    address: XLAYER_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'approve',
    args: [pendingVault, 100_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx3 });

  const depTx3 = await ownerWallet.writeContract({
    address: pendingVault,
    abi: mandateVaultAbi,
    functionName: 'deposit',
    args: [100_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: depTx3 });

  // Queue a withdrawal request on Vault 3
  const reqWithdrawTx = await ownerWallet.writeContract({
    address: pendingVault,
    abi: mandateVaultAbi,
    functionName: 'requestWithdraw',
    args: [XLAYER_ADDRESSES.usdc, 30_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: reqWithdrawTx });

  // Also queue a loosening request on Vault 3 (increase maxTradeBase to 75 USDC)
  try {
    const loosenLimits = {
      ...limits,
      maxTradeBase: 75_000_000n,
      maxDailyBase: 150_000_000n,
    };
    const queueLoosenTx = await ownerWallet.writeContract({
      address: pendingVault,
      abi: mandateVaultAbi,
      functionName: 'queueLoosen',
      args: [loosenLimits, [], false],
    });
    await publicClient.waitForTransactionReceipt({ hash: queueLoosenTx });
  } catch (err) {
    console.warn('queueLoosen notice:', (err as Error).message);
  }

  console.log('Vault states prepared:');
  console.log('  Fresh Vault:    ', freshVault);
  console.log('  After-Buy Vault:', afterBuyVault);
  console.log('  Pending Vault:  ', pendingVault);

  return { factoryAddress, freshVault, afterBuyVault, pendingVault };
}

interface ManifestItem {
  filename: string;
  scenario: string;
  viewport: string;
  theme: 'dark' | 'light';
  lang: 'en' | 'vi';
  sha256: string;
}

async function main() {
  console.log('=== P3-FIX01 SCREENSHOT AUTOMATION CAPTURE ===\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const anvilProc = await ensureAnvilFork();
  const server = await startStaticServer();

  const vaults = await prepareForkVaults();
  const encodedRpc = encodeURIComponent(RPC_URL);

  const browser: Browser = await chromium.launch({
    headless: true,
  });

  const viewports = [
    { label: 'desktop', width: 1280, height: 800 },
    { label: 'mobile', width: 390, height: 844 },
  ];

  const themes: Array<'dark' | 'light'> = ['dark', 'light'];
  const languages: Array<'en' | 'vi'> = ['en', 'vi'];

  const manifest: ManifestItem[] = [];

  try {
    for (const vp of viewports) {
      for (const th of themes) {
        for (const lg of languages) {
          const commonQuery = `theme=${th}&lang=${lg}&rpc=${encodedRpc}&demo=1&factory=${vaults.factoryAddress}`;
          const prefix = `${vp.label}-${th}-${lg}`;

          const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            colorScheme: th,
          });

          // Inject test wallet provider
          await context.addInitScript({
            content: getTestWalletInitScript({
              initialAccount: TEST_ACCOUNTS.owner,
              rpcUrl: RPC_URL,
            }),
          });

          const page: Page = await context.newPage();

          // 1. Home
          {
            const scenario = 'home';
            const filename = `home-${prefix}.png`;
            const url = `http://127.0.0.1:${DIST_PORT}/#/?${commonQuery}`;
            await page.goto(url, { waitUntil: 'networkidle' });
            await page.waitForSelector('.home-hero', { timeout: 10000 });
            await page.waitForTimeout(500);

            const outPath = path.join(OUTPUT_DIR, filename);
            await page.screenshot({ path: outPath, fullPage: true });
            const buf = fs.readFileSync(outPath);
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            manifest.push({
              filename,
              scenario,
              viewport: `${vp.width}x${vp.height}`,
              theme: th,
              lang: lg,
              sha256,
            });
            console.log(`[Captured] ${filename} -> ${sha256.slice(0, 12)}...`);
          }

          // 2. Create Default
          {
            const scenario = 'create-default';
            const filename = `create-default-${prefix}.png`;
            const url = `http://127.0.0.1:${DIST_PORT}/#/create?${commonQuery}`;
            await page.goto(url, { waitUntil: 'networkidle' });
            await page.waitForSelector('.create-page', { timeout: 10000 });
            await page.waitForTimeout(500);

            const outPath = path.join(OUTPUT_DIR, filename);
            await page.screenshot({ path: outPath, fullPage: true });
            const buf = fs.readFileSync(outPath);
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            manifest.push({
              filename,
              scenario,
              viewport: `${vp.width}x${vp.height}`,
              theme: th,
              lang: lg,
              sha256,
            });
            console.log(`[Captured] ${filename} -> ${sha256.slice(0, 12)}...`);
          }

          // 3. Create Filled Form (Custom template filled)
          {
            const scenario = 'create-filled';
            const filename = `create-filled-${prefix}.png`;
            const url = `http://127.0.0.1:${DIST_PORT}/#/create?${commonQuery}`;
            await page.goto(url, { waitUntil: 'networkidle' });
            await page.waitForSelector('.create-page', { timeout: 10000 });

            // Click Custom template button
            const customBtn = page
              .locator('.template-card')
              .filter({ hasText: /custom|tùy chỉnh/i })
              .first();
            if (await customBtn.isVisible()) {
              await customBtn.click();
              await page.waitForTimeout(300);
            }

            // Fill inputs
            const maxTradeInput = page.locator('#maxTradeBase');
            await maxTradeInput.waitFor({ state: 'visible', timeout: 5000 });
            await maxTradeInput.fill('75');
            const maxDailyInput = page.locator('#maxDailyBase');
            if (await maxDailyInput.isVisible()) {
              await maxDailyInput.fill('250');
            }
            const cooldownInput = page.locator('#cooldownSec');
            if (await cooldownInput.isVisible()) {
              await cooldownInput.fill('10');
            }
            const expiryInput = page.locator('#expiresAt');
            if (await expiryInput.isVisible()) {
              await expiryInput.fill('45');
            }
            const withdrawDelayInput = page.locator('#withdrawDelaySec');
            if (await withdrawDelayInput.isVisible()) {
              await withdrawDelayInput.fill('48');
            }

            await page.waitForTimeout(500);

            const outPath = path.join(OUTPUT_DIR, filename);
            await page.screenshot({ path: outPath, fullPage: true });
            const buf = fs.readFileSync(outPath);
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            manifest.push({
              filename,
              scenario,
              viewport: `${vp.width}x${vp.height}`,
              theme: th,
              lang: lg,
              sha256,
            });
            console.log(`[Captured] ${filename} -> ${sha256.slice(0, 12)}...`);
          }

          // 4. Dashboard Fresh
          {
            const scenario = 'dashboard-fresh';
            const filename = `dashboard-fresh-${prefix}.png`;
            const url = `http://127.0.0.1:${DIST_PORT}/#/vault/${vaults.freshVault}?${commonQuery}`;
            await page.goto(url, { waitUntil: 'networkidle' });
            await page.waitForSelector('.vault-header-card', { timeout: 10000 });
            await page.waitForTimeout(600);

            const outPath = path.join(OUTPUT_DIR, filename);
            await page.screenshot({ path: outPath, fullPage: true });
            const buf = fs.readFileSync(outPath);
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            manifest.push({
              filename,
              scenario,
              viewport: `${vp.width}x${vp.height}`,
              theme: th,
              lang: lg,
              sha256,
            });
            console.log(`[Captured] ${filename} -> ${sha256.slice(0, 12)}...`);
          }

          // 5. Dashboard After Buy
          {
            const scenario = 'dashboard-after-buy';
            const filename = `dashboard-after-buy-${prefix}.png`;
            const url = `http://127.0.0.1:${DIST_PORT}/#/vault/${vaults.afterBuyVault}?${commonQuery}`;
            await page.goto(url, { waitUntil: 'networkidle' });
            await page.waitForSelector('.vault-header-card', { timeout: 10000 });

            // Run Trade Checker simulation to show allowed / blocked result box
            const checkerBtn = page.getByRole('button', {
              name: /simulate & check rules|mô phỏng & kiểm tra/i,
            });
            if (await checkerBtn.isVisible()) {
              await checkerBtn.click();
              await page.waitForTimeout(1000);
            }

            await page.waitForTimeout(600);

            const outPath = path.join(OUTPUT_DIR, filename);
            await page.screenshot({ path: outPath, fullPage: true });
            const buf = fs.readFileSync(outPath);
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            manifest.push({
              filename,
              scenario,
              viewport: `${vp.width}x${vp.height}`,
              theme: th,
              lang: lg,
              sha256,
            });
            console.log(`[Captured] ${filename} -> ${sha256.slice(0, 12)}...`);
          }

          // 6. Dashboard Pending Items
          {
            const scenario = 'dashboard-pending';
            const filename = `dashboard-pending-${prefix}.png`;
            const url = `http://127.0.0.1:${DIST_PORT}/#/vault/${vaults.pendingVault}?${commonQuery}`;
            await page.goto(url, { waitUntil: 'networkidle' });
            await page.waitForSelector('.vault-header-card', { timeout: 10000 });
            await page.waitForTimeout(600);

            const outPath = path.join(OUTPUT_DIR, filename);
            await page.screenshot({ path: outPath, fullPage: true });
            const buf = fs.readFileSync(outPath);
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            manifest.push({
              filename,
              scenario,
              viewport: `${vp.width}x${vp.height}`,
              theme: th,
              lang: lg,
              sha256,
            });
            console.log(`[Captured] ${filename} -> ${sha256.slice(0, 12)}...`);
          }

          // 7. Verify PASS & Diagram
          {
            const scenario = 'verify-pass-diagram';
            const filename = `verify-pass-diagram-${prefix}.png`;
            const url = `http://127.0.0.1:${DIST_PORT}/#/verify/${vaults.afterBuyVault}?${commonQuery}`;
            await page.goto(url, { waitUntil: 'networkidle' });
            await page.waitForSelector('.verify-page', { timeout: 10000 });
            await page.waitForSelector('.gate-diagram-card', { timeout: 10000 });
            await page.waitForTimeout(800);

            const outPath = path.join(OUTPUT_DIR, filename);
            await page.screenshot({ path: outPath, fullPage: true });
            const buf = fs.readFileSync(outPath);
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            manifest.push({
              filename,
              scenario,
              viewport: `${vp.width}x${vp.height}`,
              theme: th,
              lang: lg,
              sha256,
            });
            console.log(`[Captured] ${filename} -> ${sha256.slice(0, 12)}...`);
          }

          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
    if (anvilProc) {
      anvilProc.kill();
    }
  }

  // Write manifest
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(
    `\nSuccessfully wrote manifest with ${manifest.length} screenshots to ${manifestPath}`,
  );

  // Validate duplicate hashes across DIFFERENT scenarios
  const hashesByScenario = new Map<string, Set<string>>();
  for (const item of manifest) {
    if (!hashesByScenario.has(item.scenario)) {
      hashesByScenario.set(item.scenario, new Set());
    }
    const scenarioHashes = hashesByScenario.get(item.scenario) ?? new Set<string>();
    scenarioHashes.add(item.sha256);
    hashesByScenario.set(item.scenario, scenarioHashes);
  }

  const allHashes = new Map<string, string>();
  let duplicateAcrossScenarios = false;
  for (const item of manifest) {
    if (allHashes.has(item.sha256)) {
      const prevScenario = allHashes.get(item.sha256) ?? 'unknown';
      if (prevScenario !== item.scenario) {
        console.error(
          `DUPLICATE HASH across different scenarios: "${item.scenario}" and "${prevScenario}" share hash ${item.sha256}`,
        );
        duplicateAcrossScenarios = true;
      }
    } else {
      allHashes.set(item.sha256, item.scenario);
    }
  }

  if (duplicateAcrossScenarios) {
    throw new Error(
      'Screenshot validation failed: distinct scenarios cannot share byte-identical screenshots.',
    );
  }

  console.log('Manifest validation: All 7 scenarios have distinct SHA-256 hashes!');
}

main().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
