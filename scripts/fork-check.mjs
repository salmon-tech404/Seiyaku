import { createPublicClient, http } from 'viem';

const targetUrl = process.env.FORK_CHECK_URL || 'http://127.0.0.1:8545';

const addresses = {
  usdc: '0xB6CEceAB302E2E4948951eE7843FC24E92933061',
  wokb: '0xe538905cf8410324e03a5a23c1c177a474d59b2b',
  uniswapV3Factory: '0x4B2ab38DBF28D31D467aA8993f6c2585981D6804',
  swapRouter02: '0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA',
  quoterV2: '0xD1b797D92d87B688193A2B976eFc8D577D204343',
  tapeoutProcessorFactory: '0x1f09DAeFA827f02CBb40967cc91b259763760761',
};

async function main() {
  console.log(`Connecting to fork at ${targetUrl}...`);
  const client = createPublicClient({ transport: http(targetUrl) });

  let chainId;
  let blockNumber;
  try {
    chainId = await client.getChainId();
    blockNumber = await client.getBlockNumber();
  } catch (err) {
    console.error(`ERROR: Could not connect to fork RPC at ${targetUrl}. Is anvil running?`);
    console.error('Details:', err.message);
    process.exit(1);
  }

  console.log(`Connected! Chain ID: ${chainId}, Block: ${blockNumber}\n`);

  let hasEmpty = false;
  for (const [name, addr] of Object.entries(addresses)) {
    const code = await client.getCode({ address: addr });
    const codeSize = code && code !== '0x' ? (code.length - 2) / 2 : 0;
    console.log(`  ${name.padEnd(25)} ${addr} -> ${codeSize} bytes code`);
    if (codeSize === 0) {
      console.error(`  [FAIL] Address ${name} (${addr}) has empty bytecode on fork!`);
      hasEmpty = true;
    }
  }

  if (hasEmpty) {
    console.error('\nFork check FAILED: one or more addresses have empty bytecode.');
    process.exit(1);
  }

  console.log('\nFork check PASSED: all addresses have verified non-empty bytecode.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
