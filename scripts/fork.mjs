import { spawn } from 'node:child_process';
import { createPublicClient, http } from 'viem';

const rpcUrl = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech';
const forkBlock = process.env.XLAYER_FORK_BLOCK;

async function run() {
  console.log(`Starting local fork of X Layer (chain 196) from ${rpcUrl}...`);

  let blockToFork = forkBlock;
  if (!blockToFork) {
    try {
      const client = createPublicClient({ transport: http(rpcUrl) });
      const latest = await client.getBlockNumber();
      blockToFork = latest.toString();
      console.log(`Unset XLAYER_FORK_BLOCK; pinning fork to latest block: ${blockToFork}`);
    } catch (err) {
      console.warn(`Could not fetch latest block from ${rpcUrl}:`, err.message);
    }
  } else {
    console.log(`Fork pinned to block ${blockToFork}`);
  }

  const args = ['--fork-url', rpcUrl, '--port', '8545', '--chain-id', '196'];
  if (blockToFork) {
    args.push('--fork-block-number', blockToFork);
  }

  console.log(`Executing: anvil ${args.join(' ')}\n`);
  const child = spawn('anvil', args, { stdio: 'inherit', shell: true });

  child.on('error', (err) => {
    console.error('\nERROR: Failed to run anvil.');
    console.error('Foundry (anvil) must be installed to run a local fork.');
    console.error('Details:', err.message);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`\nanvil exited with code ${code}`);
      process.exit(code ?? 1);
    }
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
