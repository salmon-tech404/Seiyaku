import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  http as viemHttp,
  parseAbi,
  formatUnits,
} from 'viem';
import { deployOnFork } from './deploy-fork.js';
import { XLAYER_ADDRESSES } from './config/xlayer.js';
import { TEST_ACCOUNTS } from '../apps/web/e2e/testWallet.js';

const USDC_WHALE = '0x9f73888Fb725A3409548BC8d2e42365AC063E148' as const;

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

function startStaticServer(distDir: string, port = 4173): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url?.split('?')[0] || '/';
      const cleanPath = urlPath === '/' ? '/index.html' : urlPath;
      const filePath = path.join(distDir, cleanPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        // Fallback to index.html for SPA hash routing
        const indexPath = path.join(distDir, 'index.html');
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

    server.listen(port, '127.0.0.1', () => {
      console.log(`Static server listening on http://127.0.0.1:${port}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

async function main() {
  console.log('================================================================');
  console.log('          SEIYAKU SUITE — END-TO-END AUTOMATION RUNNER          ');
  console.log('================================================================');

  // Ensure foundry in PATH
  if (process.env.PATH && !process.env.PATH.includes('.foundry')) {
    process.env.PATH = `C:\\Users\\PC\\.foundry\\bin;${process.env.PATH}`;
  }

  let anvilProcess: ReturnType<typeof spawn> | null = null;
  let staticServer: http.Server | null = null;

  try {
    // 1. Ensure local fork is running on port 8545
    const rpcAvailable = await isRpcAvailable('http://127.0.0.1:8545');
    if (!rpcAvailable) {
      console.log('1. Starting local Anvil fork on port 8545...');
      anvilProcess = spawn(
        'anvil',
        ['--fork-url', 'https://rpc.xlayer.tech', '--port', '8545', '--chain-id', '196'],
        {
          detached: false,
          stdio: 'ignore',
          shell: true,
        },
      );

      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (await isRpcAvailable('http://127.0.0.1:8545')) break;
      }
    } else {
      console.log('1. Reusing existing Anvil fork on port 8545.');
    }

    // 2. Deploy demo stack
    console.log('\n2. Deploying demo contracts on fork...');
    const testVaultsPath = path.resolve('deployments/fork/test-vaults.json');
    if (fs.existsSync(testVaultsPath)) {
      fs.unlinkSync(testVaultsPath);
    }
    const dep = await deployOnFork({
      rpcUrl: 'http://127.0.0.1:8545',
      demo: true,
      loosenDelaySec: 120,
      minWithdrawDelaySec: 120,
    });
    console.log(`   Factory deployed at: ${dep.factoryAddress}`);

    // 3. Fund owner account with USDC
    console.log('\n3. Funding owner account with 1,000 USDC from whale...');
    const xlayerChain = {
      id: 196,
      name: 'X Layer',
      nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
      rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
    } as const;

    const publicClient = createPublicClient({
      chain: xlayerChain,
      transport: viemHttp('http://127.0.0.1:8545'),
    });
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
      transport: viemHttp('http://127.0.0.1:8545'),
    });

    const erc20Abi = parseAbi([
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address) view returns (uint256)',
    ]);

    await whaleWallet.writeContract({
      address: XLAYER_ADDRESSES.usdc,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [TEST_ACCOUNTS.owner, 1_000_000_000n],
    });

    await publicClient.request({
      method: 'anvil_stopImpersonatingAccount',
      params: [USDC_WHALE],
    } as unknown as Parameters<typeof publicClient.request>[0]);

    await publicClient.request({
      method: 'anvil_setBalance',
      params: [TEST_ACCOUNTS.owner, '0x21e19e0c9bab2400000'],
    } as unknown as Parameters<typeof publicClient.request>[0]);
    await publicClient.request({
      method: 'anvil_setBalance',
      params: [TEST_ACCOUNTS.trader, '0x21e19e0c9bab2400000'],
    } as unknown as Parameters<typeof publicClient.request>[0]);

    const ownerBal = await publicClient.readContract({
      address: XLAYER_ADDRESSES.usdc,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [TEST_ACCOUNTS.owner],
    });
    console.log(`   Owner balance: ${formatUnits(ownerBal, 6)} USDC`);

    // 4. Build web app statically
    console.log('\n4. Building web application statically...');
    execSync('npm run build:web', { stdio: 'inherit' });
    execSync('node scripts/check-static.mjs', { stdio: 'inherit' });

    // 5. Start static HTTP server on port 4173
    console.log('\n5. Starting static HTTP server...');
    const distDir = path.resolve('apps/web/dist');
    staticServer = await startStaticServer(distDir, 4173);

    // 6. Measure throttled mobile performance
    console.log('\n6. Measuring Throttled Mobile Performance (390x844, 4x CPU, 1.6 Mbps)...');
    const { measureThrottledMobile } = await import('./measure-perf.js');
    const perfMetrics = await measureThrottledMobile('http://127.0.0.1:4173');
    console.log(
      `   FCP: ${perfMetrics.fcpMs} ms | DCL: ${perfMetrics.domContentLoadedMs} ms | Load: ${perfMetrics.loadMs} ms`,
    );
    console.log(
      `   Total Static Bundle: ${(perfMetrics.totalUncompressedBytes / 1024).toFixed(2)} KB (budget: 600.00 KB)`,
    );

    // 7. Run Playwright E2E tests
    console.log('\n7. Running Playwright E2E test suites...');
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const pwChild = spawn(npxCmd, ['playwright', 'test'], {
      stdio: 'inherit',
      shell: true,
    });

    const pwExitCode = await new Promise<number>((resolve) => {
      pwChild.on('close', (code) => resolve(code ?? 1));
    });

    if (pwExitCode !== 0) {
      throw new Error(`Playwright tests exited with code ${pwExitCode}`);
    }

    // 7. Generate screenshot manifest
    console.log('\n7. Generating screenshot manifest...');
    const screensDir = path.resolve('docs/screens/e2e');
    if (fs.existsSync(screensDir)) {
      const files = fs.readdirSync(screensDir).filter((f) => f.endsWith('.png'));
      const manifest = files.map((filename) => {
        const filePath = path.join(screensDir, filename);
        const buf = fs.readFileSync(filePath);
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        return {
          filename,
          scenario: filename.replace('.png', '').replace(/-/g, ' '),
          viewport: filename.includes('mobile') ? '390x844' : '1280x800',
          sha256,
        };
      });
      fs.writeFileSync(path.join(screensDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      console.log(`   Generated manifest with ${manifest.length} screenshots.`);
    }

    console.log('\n================================================================');
    console.log('              ALL E2E SUITES PASSED SUCCESSFULLY                ');
    console.log('================================================================\n');
  } finally {
    if (staticServer) {
      console.log('Stopping static HTTP server...');
      staticServer.close();
    }
    if (anvilProcess) {
      console.log('Stopping Anvil fork process...');
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${anvilProcess.pid} /F /T`, { stdio: 'ignore' });
        } else {
          anvilProcess.kill('SIGKILL');
        }
      } catch {
        // Ignored
      }
    }
  }
}

main().catch((err) => {
  console.error('\nFatal error in run-e2e:', err);
  process.exit(1);
});
