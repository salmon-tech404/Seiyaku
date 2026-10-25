import { createPublicClient, http, parseAbi, formatUnits } from 'viem';

const rpcUrl = 'https://rpc.xlayer.tech';
const client = createPublicClient({
  transport: http(rpcUrl),
});

const addresses = {
  usdc: '0xB6CEceAB302E2E4948951eE7843FC24E92933061',
  wokb: '0xe538905cf8410324e03a5a23c1c177a474d59b2b',
  uniswapV3Factory: '0x4B2ab38DBF28D31D467aA8993f6c2585981D6804',
  swapRouter02: '0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA',
  quoterV2: '0xD1b797D92d87B688193A2B976eFc8D577D204343',
  tapeoutProcessorFactory: '0x1f09DAeFA827f02CBb40967cc91b259763760761',
};

const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
]);

const factoryAbi = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
]);

const poolAbi = parseAbi([
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
]);

const quoterV2Abi = parseAbi([
  'struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

async function main() {
  console.log(`Connecting to ${rpcUrl}...`);
  const chainId = await client.getChainId();
  const blockNumber = await client.getBlockNumber();
  console.log(`Connected! Chain ID: ${chainId}, Latest Block: ${blockNumber}\n`);

  console.log('=== Checking Contract Bytecode Sizes ===');
  for (const [name, addr] of Object.entries(addresses)) {
    const code = await client.getCode({ address: addr });
    const codeLength = code ? (code.length - 2) / 2 : 0;
    console.log(`  ${name.padEnd(24)} ${addr} -> ${codeLength} bytes code`);
  }

  console.log('\n=== Token Details ===');
  const usdcName = await client.readContract({
    address: addresses.usdc,
    abi: erc20Abi,
    functionName: 'name',
  });
  const usdcSymbol = await client.readContract({
    address: addresses.usdc,
    abi: erc20Abi,
    functionName: 'symbol',
  });
  const usdcDecimals = await client.readContract({
    address: addresses.usdc,
    abi: erc20Abi,
    functionName: 'decimals',
  });
  console.log(`  USDC: ${usdcName} (${usdcSymbol}), Decimals: ${usdcDecimals}`);

  const wokbName = await client.readContract({
    address: addresses.wokb,
    abi: erc20Abi,
    functionName: 'name',
  });
  const wokbSymbol = await client.readContract({
    address: addresses.wokb,
    abi: erc20Abi,
    functionName: 'symbol',
  });
  const wokbDecimals = await client.readContract({
    address: addresses.wokb,
    abi: erc20Abi,
    functionName: 'decimals',
  });
  console.log(`  WOKB: ${wokbName} (${wokbSymbol}), Decimals: ${wokbDecimals}`);

  console.log('\n=== USDC / WOKB Uniswap V3 Pools ===');
  const feeTiers = [
    { fee: 500, label: '0.05%' },
    { fee: 3000, label: '0.3%' },
    { fee: 10000, label: '1%' },
  ];
  for (const { fee, label } of feeTiers) {
    const pool = await client.readContract({
      address: addresses.uniswapV3Factory,
      abi: factoryAbi,
      functionName: 'getPool',
      args: [addresses.usdc, addresses.wokb, fee],
    });

    console.log(`\n  Fee Tier: ${fee} (${label})`);
    console.log(`  Pool Address: ${pool}`);

    if (pool === '0x0000000000000000000000000000000000000000') {
      console.log('  Pool does not exist.');
      continue;
    }

    const poolCode = await client.getCode({ address: pool });
    if (!poolCode || poolCode === '0x') {
      console.log('  Pool has no bytecode.');
      continue;
    }

    const liquidity = await client.readContract({
      address: pool,
      abi: poolAbi,
      functionName: 'liquidity',
    });
    const slot0 = await client.readContract({ address: pool, abi: poolAbi, functionName: 'slot0' });
    console.log(`  Liquidity: ${liquidity.toString()}`);
    console.log(`  Current Tick: ${slot0[1]}`);
    console.log(`  sqrtPriceX96: ${slot0[0].toString()}`);

    // Try a quote for 10 USDC -> WOKB (10 * 10^6)
    if (liquidity > 0n) {
      try {
        const quoteRes = await client.simulateContract({
          address: addresses.quoterV2,
          abi: quoterV2Abi,
          functionName: 'quoteExactInputSingle',
          args: [
            {
              tokenIn: addresses.usdc,
              tokenOut: addresses.wokb,
              amountIn: 10_000_000n, // 10 USDC
              fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });
        const amountOut = quoteRes.result[0];
        console.log(
          `  Quote for 10 USDC -> WOKB: ${amountOut.toString()} raw (${formatUnits(amountOut, 18)} WOKB)`,
        );
      } catch (err) {
        console.log(`  Quote failed: ${err.shortMessage || err.message}`);
      }
    } else {
      console.log('  Liquidity is 0, no quote available.');
    }
  }
}

main().catch(console.error);
