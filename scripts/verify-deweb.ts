import { createPublicClient, http, parseAbi } from 'viem';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const registryAbi = parseAbi([
  'function fileInfo(address container, string path) external view returns (uint32 size, string contentType, bytes32 sha256Hash, uint40 updatedAt, uint256 chunkCount)',
  'function read(address container, string path) external view returns (bytes memory)',
]);

export async function verifyOnChainSite(options: {
  rpcUrl?: string;
  container: `0x${string}`;
  distDir?: string;
}) {
  const rpcUrl = options.rpcUrl || 'http://127.0.0.1:8545';
  const container = options.container;
  const distDir = options.distDir || path.resolve('apps/web/dist');
  const registry = '0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6';

  const client = createPublicClient({ transport: http(rpcUrl) });
  console.log(`Verifying container ${container} on ${rpcUrl}...`);

  function getFiles(dir: string, base: string = ''): string[] {
    const res: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        res.push(...getFiles(path.join(dir, ent.name), path.join(base, ent.name)));
      } else if (ent.isFile()) {
        res.push('/' + path.join(base, ent.name).replace(/\\/g, '/'));
      }
    }
    return res;
  }

  const files = getFiles(distDir);
  let verified = 0;

  for (const rel of files) {
    const localBuf = fs.readFileSync(path.join(distDir, rel.slice(1)));
    const localHash = '0x' + crypto.createHash('sha256').update(localBuf).digest('hex');

    const info = await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: 'fileInfo',
      args: [container, rel],
    });

    const onChainSize = Number(info[0]);
    const onChainHash = info[2].toLowerCase();

    if (onChainSize !== localBuf.length) {
      throw new Error(`Size mismatch for ${rel}: local ${localBuf.length} vs chain ${onChainSize}`);
    }
    if (onChainHash !== localHash.toLowerCase()) {
      throw new Error(`Hash mismatch for ${rel}: local ${localHash} vs chain ${onChainHash}`);
    }

    console.log(
      `  [VERIFIED] ${rel.padEnd(38)} size=${onChainSize} hash=${onChainHash.slice(0, 18)}...`,
    );
    verified++;
  }

  console.log(`\nPASSED: All ${verified} files verified against on-chain SiteRegistry state!`);
  return { verified, total: files.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/verify-deweb.ts')) {
  const container =
    (process.argv[2] as `0x${string}`) || '0xb43202318e21964262803433c95Cc15a22EAaBA0';
  verifyOnChainSite({ container }).catch((err) => {
    console.error('Verification failed:', err.message);
    process.exit(1);
  });
}
