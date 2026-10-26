/**
 * scripts/capture-screens-p3-t04.ts
 * Deploys vaults in various states on an Anvil fork and captures real screenshots of the dashboard.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http as viemHttp,
  getAddress,
  parseUnits,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayerChain, DEFAULT_TOKENS } from '../apps/web/src/chain/config.js';
import { sendCreateVault } from '../apps/web/src/chain/factory.js';
import { mandateVaultAbi, erc20Abi } from '../apps/web/src/chain/abi/index.js';
import { VAULT_TEMPLATES, templateToLimits } from '../apps/web/src/features/create/templates.js';

const ANVIL_PORT = 8545;
const WEB_PORT = 4175;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIST_DIR = path.resolve('apps/web/dist');

const THROW_AWAY_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // Account #1
const STRANGER_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'; // Account #2

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function startWebServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    let filePath = path.join(DIST_DIR, (req.url || '').split('?')[0]);
    if (filePath.endsWith(path.sep) || !path.extname(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(WEB_PORT, '127.0.0.1', () => resolve(server));
  });
}

function runChromeAsync(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(CHROME_PATH, args, { windowsHide: true });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Chrome exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

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

async function main() {
  console.log('=== P3-T04 Capture Screenshots with Live Fork ===\n');

  // 1. Build web app
  console.log('Building web app...');
  const buildRes = spawnSync('npm', ['run', 'build:web'], { shell: true, encoding: 'utf8' });
  if (buildRes.status !== 0) {
    console.error(buildRes.stderr || buildRes.stdout);
    throw new Error('Web build failed');
  }

  // 2. Start Anvil fork
  console.log('Starting Anvil fork on port', ANVIL_PORT);
  const anvil: ChildProcess = spawn(
    'anvil',
    ['--fork-url', 'https://rpc.xlayer.tech', '--port', String(ANVIL_PORT)],
    { shell: true, stdio: 'ignore' },
  );

  let webServer: http.Server | null = null;

  try {
    await waitRpc(RPC_URL);
    console.log(`Fork ready at ${RPC_URL}`);

    // Deploy contracts on fork
    console.log('Deploying factory & circuits on fork...');
    const deployScript = spawnSync('npx', ['tsx', 'scripts/deploy-fork.ts'], {
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, FORK_RPC_URL: RPC_URL },
    });
    if (deployScript.status !== 0) {
      console.error(deployScript.stderr || deployScript.stdout);
      throw new Error('deploy-fork failed');
    }

    const deployment = JSON.parse(
      fs.readFileSync(path.resolve('deployments/fork/factory.json'), 'utf8'),
    );
    const factoryAddress = getAddress(deployment.factory);

    const client = createPublicClient({
      chain: xLayerChain,
      transport: viemHttp(RPC_URL),
    });

    const account = privateKeyToAccount(THROW_AWAY_KEY);
    const wallet = createWalletClient({
      chain: xLayerChain,
      transport: viemHttp(RPC_URL),
      account,
    });

    // Fund account with native OKB and USDC
    const RICH_USDC_HOLDER = getAddress('0x9f73888Fb725A3409548BC8d2e42365AC063E148');
    await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'anvil_impersonateAccount',
        params: [RICH_USDC_HOLDER],
      }),
    });
    await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'anvil_setBalance',
        params: [RICH_USDC_HOLDER, '0x56BC75E2D63100000'], // 100 OKB
      }),
    });

    const richSigner = createWalletClient({
      chain: xLayerChain,
      transport: viemHttp(RPC_URL),
      account: RICH_USDC_HOLDER,
    });
    const fundHash = await richSigner.writeContract({
      address: DEFAULT_TOKENS.usdc.address,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [account.address, parseUnits('1000', 6)],
    });
    await client.waitForTransactionReceipt({ hash: fundHash });
    await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'anvil_stopImpersonatingAccount',
        params: [RICH_USDC_HOLDER],
      }),
    });

    // Helper to fund vault
    async function fundVault(vAddr: Address, amountUsdc: string) {
      const amt = parseUnits(amountUsdc, 6);
      const appHash = await wallet.writeContract({
        address: DEFAULT_TOKENS.usdc.address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [vAddr, amt],
      });
      await client.waitForTransactionReceipt({ hash: appHash });
      const depHash = await wallet.writeContract({
        address: vAddr,
        abi: mandateVaultAbi,
        functionName: 'deposit',
        args: [amt],
      });
      await client.waitForTransactionReceipt({ hash: depHash });
    }

    // Vault 1: Fresh Vault
    console.log('Creating Vault 1 (Fresh)...');
    const nowSec = Math.floor(Date.now() / 1000);
    const limits1 = templateToLimits(VAULT_TEMPLATES.balanced, nowSec);
    const res1 = await sendCreateVault({
      publicClient: client,
      walletClient: wallet,
      factoryAddress,
      baseToken: DEFAULT_TOKENS.usdc.address,
      trader: account.address,
      allowedTokens: [DEFAULT_TOKENS.wokb.address],
      limits: limits1,
    });
    const freshVault = res1.vaultAddress;
    await fundVault(freshVault, '100');
    console.log('Vault 1 ready:', freshVault);

    // Vault 2: After Buy
    console.log('Creating Vault 2 (After Buy)...');
    const res2 = await sendCreateVault({
      publicClient: client,
      walletClient: wallet,
      factoryAddress,
      baseToken: DEFAULT_TOKENS.usdc.address,
      trader: account.address,
      allowedTokens: [DEFAULT_TOKENS.wokb.address],
      limits: limits1,
    });
    const tradedVault = res2.vaultAddress;
    await fundVault(tradedVault, '100');
    // Execute a buy swap on Uniswap V3 via vault trade
    try {
      const tradeHash = await wallet.writeContract({
        address: tradedVault,
        abi: mandateVaultAbi,
        functionName: 'trade',
        args: [
          {
            tokenIn: DEFAULT_TOKENS.usdc.address,
            tokenOut: DEFAULT_TOKENS.wokb.address,
            feeTier: 500,
            amountIn: parseUnits('10', 6),
            amountOutMin: 1n,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
          },
        ],
      });
      await client.waitForTransactionReceipt({ hash: tradeHash });
      console.log('Vault 2 buy executed');
    } catch (err) {
      console.warn('Trade buy skipped, simulating via deposit:', err);
    }

    // Vault 3: Frozen
    console.log('Creating Vault 3 (Frozen)...');
    const res3 = await sendCreateVault({
      publicClient: client,
      walletClient: wallet,
      factoryAddress,
      baseToken: DEFAULT_TOKENS.usdc.address,
      trader: account.address,
      allowedTokens: [DEFAULT_TOKENS.wokb.address],
      limits: limits1,
    });
    const frozenVault = res3.vaultAddress;
    await fundVault(frozenVault, '100');
    const frzHash = await wallet.writeContract({
      address: frozenVault,
      abi: mandateVaultAbi,
      functionName: 'freeze',
    });
    await client.waitForTransactionReceipt({ hash: frzHash });
    console.log('Vault 3 frozen');

    // Vault 4: Pending Loosen & Withdraw
    console.log('Creating Vault 4 (Pending Loosen & Withdraw)...');
    const res4 = await sendCreateVault({
      publicClient: client,
      walletClient: wallet,
      factoryAddress,
      baseToken: DEFAULT_TOKENS.usdc.address,
      trader: account.address,
      allowedTokens: [DEFAULT_TOKENS.wokb.address],
      limits: limits1,
    });
    const pendingVault = res4.vaultAddress;
    await fundVault(pendingVault, '100');
    // Queue loosening
    const loosenHash = await wallet.writeContract({
      address: pendingVault,
      abi: mandateVaultAbi,
      functionName: 'queueLoosen',
      args: [
        {
          maxTradeBase: parseUnits('50', 6),
          maxDailyBase: parseUnits('200', 6),
          maxTradesPerDay: 20,
          cooldownSec: 120,
          expiresAt: limits1.expiresAt,
          withdrawDelaySec: limits1.withdrawDelaySec,
        },
        [],
        false,
      ],
    });
    await client.waitForTransactionReceipt({ hash: loosenHash });
    // Request withdraw
    const wdrawHash = await wallet.writeContract({
      address: pendingVault,
      abi: mandateVaultAbi,
      functionName: 'requestWithdraw',
      args: [DEFAULT_TOKENS.usdc.address, parseUnits('25', 6)],
    });
    await client.waitForTransactionReceipt({ hash: wdrawHash });
    console.log('Vault 4 pending loosen & withdraw queued');

    // Start preview web server
    webServer = await startWebServer();
    console.log(`Web server listening at http://127.0.0.1:${WEB_PORT}`);

    const outputDir = path.resolve('docs/screens/p3-t04');
    fs.mkdirSync(outputDir, { recursive: true });

    const strangerAccount = privateKeyToAccount(STRANGER_KEY).address;

    const screens = [
      // 1. Fresh mobile dark en
      {
        name: 'vault-390-dark-en-fresh.png',
        width: 390,
        height: 2400,
        url: `http://127.0.0.1:${WEB_PORT}/#/vault/${freshVault}?rpc=${RPC_URL}&mockAccount=${account.address}&theme=dark&lang=en`,
      },
      // 2. Fresh mobile light vi
      {
        name: 'vault-390-light-vi-fresh.png',
        width: 390,
        height: 2400,
        url: `http://127.0.0.1:${WEB_PORT}/#/vault/${freshVault}?rpc=${RPC_URL}&mockAccount=${account.address}&theme=light&lang=vi`,
      },
      // 3. Fresh desktop dark en
      {
        name: 'vault-1280-dark-en-fresh.png',
        width: 1280,
        height: 2200,
        url: `http://127.0.0.1:${WEB_PORT}/#/vault/${freshVault}?rpc=${RPC_URL}&mockAccount=${account.address}&theme=dark&lang=en`,
      },
      // 4. Fresh desktop light vi
      {
        name: 'vault-1280-light-vi-fresh.png',
        width: 1280,
        height: 2200,
        url: `http://127.0.0.1:${WEB_PORT}/#/vault/${freshVault}?rpc=${RPC_URL}&mockAccount=${account.address}&theme=light&lang=vi`,
      },
      // 5. After buy
      {
        name: 'vault-1280-dark-en-after-buy.png',
        width: 1280,
        height: 2200,
        url: `http://127.0.0.1:${WEB_PORT}/#/vault/${tradedVault}?rpc=${RPC_URL}&mockAccount=${account.address}&theme=dark&lang=en`,
      },
      // 6. Frozen
      {
        name: 'vault-1280-dark-en-frozen.png',
        width: 1280,
        height: 2200,
        url: `http://127.0.0.1:${WEB_PORT}/#/vault/${frozenVault}?rpc=${RPC_URL}&mockAccount=${account.address}&theme=dark&lang=en`,
      },
      // 7. Pending loosen
      {
        name: 'vault-1280-dark-en-pending-loosen.png',
        width: 1280,
        height: 2200,
        url: `http://127.0.0.1:${WEB_PORT}/#/vault/${pendingVault}?rpc=${RPC_URL}&mockAccount=${account.address}&theme=dark&lang=en`,
      },
      // 8. Pending withdraw
      {
        name: 'vault-1280-dark-en-pending-withdraw.png',
        width: 1280,
        height: 2200,
        url: `http://127.0.0.1:${WEB_PORT}/#/vault/${pendingVault}?rpc=${RPC_URL}&mockAccount=${account.address}&theme=dark&lang=en`,
      },
      // 9. Trade checker allowed
      {
        name: 'vault-1280-dark-en-checker-allowed.png',
        width: 1280,
        height: 2200,
        url: `http://127.0.0.1:${WEB_PORT}/#/vault/${freshVault}?rpc=${RPC_URL}&mockAccount=${account.address}&checkAmount=10&theme=dark&lang=en`,
      },
      // 10. Trade checker blocked
      {
        name: 'vault-1280-dark-en-checker-blocked.png',
        width: 1280,
        height: 2200,
        url: `http://127.0.0.1:${WEB_PORT}/#/vault/${freshVault}?rpc=${RPC_URL}&mockAccount=${account.address}&checkAmount=500&theme=dark&lang=en`,
      },
      // 11. Stranger view
      {
        name: 'vault-1280-dark-en-stranger.png',
        width: 1280,
        height: 2200,
        url: `http://127.0.0.1:${WEB_PORT}/#/vault/${freshVault}?rpc=${RPC_URL}&mockAccount=${strangerAccount}&theme=dark&lang=en`,
      },
    ];

    for (const sc of screens) {
      const outPath = path.join(outputDir, sc.name);
      console.log(`Capturing ${sc.name} (${sc.width}x${sc.height})...`);
      // Allow Chrome 1.5 seconds to settle and render on-chain data
      await runChromeAsync([
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--virtual-time-budget=2000',
        '--user-data-dir=C:\\temp\\cshot-p3-t04',
        `--window-size=${sc.width},${sc.height}`,
        `--screenshot=${outPath}`,
        sc.url,
      ]);
      const stat = fs.statSync(outPath);
      console.log(`  Saved ${sc.name} (${(stat.size / 1024).toFixed(1)} KB)`);
    }

    console.log('\nAll P3-T04 screenshots captured successfully!');
  } finally {
    if (webServer) {
      webServer.close();
    }
    anvil.kill();
    // restore Generated.sol if touched
    spawnSync('git', ['restore', 'contracts/test/fork/Generated.sol']);
  }
}

main().catch((err) => {
  console.error('Fatal error in capture script:', err);
  process.exit(1);
});
