import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  toHex,
  formatEther,
  formatGwei,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const SITE_REGISTRY_XLAYER: Address = '0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6';
const CHUNK_SIZE = 24_000;

const registryAbi = parseAbi([
  'function putFile(address container, string path, string contentType, bytes32 sha256Hash, bytes data) external',
  'function appendChunk(address container, string path, uint256 expectIndex, bytes data) external',
  'function setFallback(address container, string path) external',
  'function fileInfo(address container, string path) external view returns (uint32 size, string contentType, bytes32 sha256Hash, uint40 updatedAt, uint256 chunkCount)',
  'function read(address container, string path) external view returns (bytes memory)',
]);

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}

interface FileItem {
  readonly relPath: string;
  readonly fullPath: string;
  readonly size: number;
  readonly contentType: string;
  readonly sha256: Hex;
  readonly chunks: readonly Uint8Array[];
}

function scanDist(distDir: string): FileItem[] {
  const items: FileItem[] = [];

  function walk(currentDir: string, base: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(full, path.join(base, entry.name));
      } else if (entry.isFile()) {
        const rel = '/' + path.join(base, entry.name).replace(/\\/g, '/');
        const buf = fs.readFileSync(full);
        const hash = crypto.createHash('sha256').update(buf).digest();
        const chunks: Uint8Array[] = [];
        for (let i = 0; i < buf.length; i += CHUNK_SIZE) {
          chunks.push(new Uint8Array(buf.subarray(i, i + CHUNK_SIZE)));
        }
        if (chunks.length === 0) {
          chunks.push(new Uint8Array(0));
        }

        items.push({
          relPath: rel,
          fullPath: full,
          size: buf.length,
          contentType: getContentType(full),
          sha256: `0x${hash.toString('hex')}` as Hex,
          chunks,
        });
      }
    }
  }

  walk(distDir, '');
  return items;
}

export async function publishSite(options: {
  distDir: string;
  rpcUrl?: string;
  container: Address;
  dryRun?: boolean;
  isMainnetConfirmed?: boolean;
  privateKey?: Hex;
}) {
  const rpcUrl = options.rpcUrl || process.env.XLAYER_RPC_URL || 'http://127.0.0.1:8545';
  const dryRun = options.dryRun ?? true;

  console.log(`=== DeWEB Site Publisher ===`);
  console.log(`RPC Endpoint: ${rpcUrl}`);
  console.log(`Container:    ${options.container}`);
  console.log(`Dist folder:  ${options.distDir}`);
  console.log(`Mode:         ${dryRun ? 'DRY-RUN (Simulating cost only)' : 'LIVE PUBLISHING'}\n`);

  if (!fs.existsSync(options.distDir)) {
    throw new Error(`Dist directory not found: ${options.distDir}. Run build first.`);
  }

  const files = scanDist(options.distDir);
  console.log(`Found ${files.length} files to publish:`);
  let totalBytes = 0;
  let totalChunks = 0;
  for (const f of files) {
    console.log(
      `  ${f.relPath.padEnd(30)} ${f.size.toString().padStart(8)} bytes (${f.chunks.length} chunks, ${f.contentType})`,
    );
    totalBytes += f.size;
    totalChunks += f.chunks.length;
  }
  console.log(`\nTotal payload: ${totalBytes} bytes in ${totalChunks} transactions/chunks.`);

  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  const gasPrice = await publicClient.getGasPrice();
  console.log(`Target Chain ID: ${chainId}, Current Gas Price: ${formatGwei(gasPrice)} gwei`);

  if (
    !dryRun &&
    chainId === 196 &&
    !rpcUrl.includes('127.0.0.1') &&
    !rpcUrl.includes('localhost')
  ) {
    if (!options.isMainnetConfirmed) {
      throw new Error(
        'Refusing to publish to X Layer mainnet without explicit --mainnet confirmation flag and deployer key.',
      );
    }
  }

  // Cost estimations:
  // putFile / appendChunk base cost: ~60k gas overhead + ~216 gas per byte (calldata + code store)
  let estimatedTotalGas = 0n;
  for (const f of files) {
    for (const chunk of f.chunks) {
      const chunkGas = 65_000n + BigInt(chunk.length) * 216n;
      estimatedTotalGas += chunkGas;
    }
  }
  // setFallback call: ~45k gas
  estimatedTotalGas += 45_000n;

  const estimatedCostWei = estimatedTotalGas * gasPrice;
  console.log(`\nEstimated Gas:  ${estimatedTotalGas.toLocaleString()} gas`);
  console.log(`Estimated Cost: ${formatEther(estimatedCostWei)} OKB`);

  if (dryRun) {
    console.log('\n[Dry-run complete]: No transactions sent.');
    return {
      filesCount: files.length,
      totalBytes,
      totalChunks,
      estimatedGas: estimatedTotalGas,
      estimatedCostWei,
    };
  }

  const deployerKey = options.privateKey || (process.env.DEPLOYER_KEY as Hex);
  if (!deployerKey) {
    throw new Error('Missing deployer private key for live publish');
  }

  const account = privateKeyToAccount(deployerKey);
  const walletClient = createWalletClient({ account, transport: http(rpcUrl) });

  console.log(`Publishing from account ${account.address}...`);

  for (const f of files) {
    console.log(`Uploading ${f.relPath} (first chunk)...`);
    const chunk0 = f.chunks[0] || new Uint8Array(0);
    const putTx = await walletClient.writeContract({
      address: SITE_REGISTRY_XLAYER,
      abi: registryAbi,
      functionName: 'putFile',
      args: [options.container, f.relPath, f.contentType, f.sha256, toHex(chunk0)],
    });
    console.log(`  putFile tx: ${putTx}`);
    await publicClient.waitForTransactionReceipt({ hash: putTx });

    for (let idx = 1; idx < f.chunks.length; idx++) {
      const chunk = f.chunks[idx] || new Uint8Array(0);
      console.log(`  Appending chunk ${idx}/${f.chunks.length - 1}...`);
      const appendTx = await walletClient.writeContract({
        address: SITE_REGISTRY_XLAYER,
        abi: registryAbi,
        functionName: 'appendChunk',
        args: [options.container, f.relPath, BigInt(idx), toHex(chunk)],
      });
      await publicClient.waitForTransactionReceipt({ hash: appendTx });
    }
  }

  console.log('Setting fallback path to /index.html...');
  const fallbackTx = await walletClient.writeContract({
    address: SITE_REGISTRY_XLAYER,
    abi: registryAbi,
    functionName: 'setFallback',
    args: [options.container, '/index.html'],
  });
  console.log(`  setFallback tx: ${fallbackTx}`);
  await publicClient.waitForTransactionReceipt({ hash: fallbackTx });

  console.log('\nSite publication finished successfully!');
  return {
    filesCount: files.length,
    totalBytes,
    totalChunks,
    estimatedGas: estimatedTotalGas,
    estimatedCostWei,
  };
}

// CLI runner
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const args = process.argv.slice(2);
  const isMainnet = args.includes('--mainnet');
  const isLive = args.includes('--live');
  const distDir = path.resolve('apps/web/dist');
  const container =
    (args.find((a) => a.startsWith('0x')) as Address) ||
    '0x0000000000000000000000000000000000000001';

  publishSite({
    distDir,
    container,
    dryRun: !isLive,
    isMainnetConfirmed: isMainnet,
  }).catch((err) => {
    console.error('Publish error:', err.message);
    process.exit(1);
  });
}
