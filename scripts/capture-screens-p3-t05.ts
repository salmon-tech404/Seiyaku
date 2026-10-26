/**
 * scripts/capture-screens-p3-t05.ts
 * Captures real screenshots of the Verify page (diagram, live eval, PASS, FAIL) using headless Chrome.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http as viemHttp, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayerChain, DEFAULT_TOKENS } from '../apps/web/src/chain/config.js';
import { sendCreateVault } from '../apps/web/src/chain/factory.js';
import { VAULT_TEMPLATES, templateToLimits } from '../apps/web/src/features/create/templates.js';

const ANVIL_PORT = 8545;
const WEB_PORT = 4176;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIST_DIR = path.resolve('apps/web/dist');

const THROW_AWAY_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

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
      // Retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for anvil fork at ${url}`);
}

async function main() {
  console.log('=== P3-T05 Capture Screenshots with Live Fork ===\n');

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

    // Deploy a verified MandateVault
    console.log('Creating fresh vault for verification...');
    const nowSec = Math.floor(Date.now() / 1000);
    const limits = templateToLimits(VAULT_TEMPLATES.balanced, nowSec);
    const res = await sendCreateVault({
      publicClient: client,
      walletClient: wallet,
      factoryAddress,
      baseToken: DEFAULT_TOKENS.usdc.address,
      trader: account.address,
      allowedTokens: [DEFAULT_TOKENS.wokb.address],
      limits,
    });
    const verifiedVault = res.vaultAddress;
    console.log('Verified Vault ready:', verifiedVault);

    // Start preview web server
    webServer = await startWebServer();
    console.log(`Web server listening at http://127.0.0.1:${WEB_PORT}`);

    const outputDir = path.resolve('docs/screens/p3-t05');
    fs.mkdirSync(outputDir, { recursive: true });

    const screens = [
      // 1. Mobile dark en PASS
      {
        name: 'verify-390-dark-en-pass.png',
        width: 390,
        height: 2200,
        url: `http://127.0.0.1:${WEB_PORT}/#/verify/${verifiedVault}?rpc=${RPC_URL}&theme=dark&lang=en`,
      },
      // 2. Mobile light vi PASS
      {
        name: 'verify-390-light-vi-pass.png',
        width: 390,
        height: 2200,
        url: `http://127.0.0.1:${WEB_PORT}/#/verify/${verifiedVault}?rpc=${RPC_URL}&theme=light&lang=vi`,
      },
      // 3. Desktop dark en PASS
      {
        name: 'verify-1280-dark-en-pass.png',
        width: 1280,
        height: 2000,
        url: `http://127.0.0.1:${WEB_PORT}/#/verify/${verifiedVault}?rpc=${RPC_URL}&theme=dark&lang=en`,
      },
      // 4. Desktop light vi PASS
      {
        name: 'verify-1280-light-vi-pass.png',
        width: 1280,
        height: 2000,
        url: `http://127.0.0.1:${WEB_PORT}/#/verify/${verifiedVault}?rpc=${RPC_URL}&theme=light&lang=vi`,
      },
      // 5. Desktop dark en FAIL (altered netlist hash)
      {
        name: 'verify-1280-dark-en-fail.png',
        width: 1280,
        height: 2000,
        url: `http://127.0.0.1:${WEB_PORT}/#/verify/${verifiedVault}?rpc=${RPC_URL}&mockFail=1&theme=dark&lang=en`,
      },
      // 6. Diagram focus
      {
        name: 'verify-1280-dark-en-diagram.png',
        width: 1280,
        height: 1200,
        url: `http://127.0.0.1:${WEB_PORT}/#/verify/${verifiedVault}?rpc=${RPC_URL}&theme=dark&lang=en`,
      },
      // 7. Live evaluation focus
      {
        name: 'verify-1280-dark-en-eval.png',
        width: 1280,
        height: 1200,
        url: `http://127.0.0.1:${WEB_PORT}/#/verify/${verifiedVault}?rpc=${RPC_URL}&theme=dark&lang=en`,
      },
    ];

    for (const sc of screens) {
      const outPath = path.join(outputDir, sc.name);
      console.log(`Capturing ${sc.name} (${sc.width}x${sc.height})...`);
      await runChromeAsync([
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--virtual-time-budget=2000',
        '--user-data-dir=C:\\temp\\cshot-p3-t05',
        `--window-size=${sc.width},${sc.height}`,
        `--screenshot=${outPath}`,
        sc.url,
      ]);
      const stat = fs.statSync(outPath);
      console.log(`  Saved ${sc.name} (${(stat.size / 1024).toFixed(1)} KB)`);
    }

    console.log('\nAll P3-T05 screenshots captured successfully!');
  } finally {
    if (webServer) {
      webServer.close();
    }
    anvil.kill();
    spawnSync('git', ['restore', 'contracts/test/fork/Generated.sol']);
  }
}

main().catch((err) => {
  console.error('Fatal error in capture script:', err);
  process.exit(1);
});
