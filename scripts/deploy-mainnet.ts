import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  formatEther,
  keccak256,
  slice,
  toHex,
  type Address,
  type Hex,
  type Abi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
import path from 'node:path';
import {
  MANDATE_V1_BYTES,
  MANDATE_V1_GATE_COUNT,
  MANDATE_V1_NETLIST_HASH,
} from '@seiyaku/circuit-tools';
import {
  PROCESSOR_FACTORY_ADDRESS,
  EIP1967_BEACON_SLOT,
  factoryAbi as processorFactoryAbi,
  circuitsAbi,
  transistorsAbi,
  beaconAbi,
} from './lib/tapeout.js';
import { XLAYER_ADDRESSES } from './config/xlayer.js';

/** Marker used only in dry runs where an address cannot be known before broadcast. */
const DRY_RUN_PLACEHOLDER = '0x0000000000000000000000000000000000000000' as Address;

const ALLOWED_RPC_HOSTS = ['rpc.xlayer.tech', 'xlayerrpc.okx.com'];

interface ArtifactJson {
  abi: unknown[];
  bytecode: { object: Hex };
  deployedBytecode: { object: Hex };
}

/**
 * ESTIMATE from a formula, not a simulation: base transaction and create cost, calldata cost of the
 * init code, code deposit cost, plus a fixed allowance for constructor execution.
 */
function estimateCreateGas(artifact: ArtifactJson, constructorAllowance: bigint): bigint {
  const init = artifact.bytecode.object.slice(2);
  let calldataGas = 0n;
  for (let i = 0; i < init.length; i += 2) {
    calldataGas += init.slice(i, i + 2) === '00' ? 4n : 16n;
  }
  const deployedBytes = BigInt(artifact.deployedBytecode.object.slice(2).length / 2);
  return 21_000n + 32_000n + calldataGas + 200n * deployedBytes + constructorAllowance;
}

function loadArtifact(relativePath: string): ArtifactJson {
  const fullPath = path.resolve(relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Artifact not found at ${fullPath}. Did you run 'forge build'?`);
  }
  return JSON.parse(fs.readFileSync(fullPath, 'utf8')) as ArtifactJson;
}

export async function deployMainnet() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--broadcast') || args.includes('--dry-run');
  const spendsRealFunds = args.includes('--i-understand-this-spends-real-funds');

  const rpcUrl = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech';
  console.log('================================================================');
  console.log('         SEIYAKU MANDATE VAULT — MAINNET DEPLOYMENT             ');
  console.log('================================================================');
  console.log(`RPC Endpoint: ${rpcUrl}`);
  console.log(`Execution Mode: ${isDryRun ? 'DRY-RUN (SIMULATION ONLY)' : 'LIVE BROADCAST'}\n`);

  // 1. Host allowlist check
  try {
    const urlObj = new URL(rpcUrl);
    const host = urlObj.hostname.toLowerCase();
    const isAllowedHost = ALLOWED_RPC_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
    if (!isAllowedHost && !rpcUrl.includes('127.0.0.1') && !rpcUrl.includes('localhost')) {
      throw new Error(
        `RPC host "${host}" is not on the allowed X Layer endpoint list (${ALLOWED_RPC_HOSTS.join(', ')}).`,
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not on the allowed')) throw err;
    throw new Error(`Invalid RPC URL: ${rpcUrl}`);
  }

  const xlayerChain = {
    id: 196,
    name: 'X Layer',
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } as const;

  const publicClient = createPublicClient({ chain: xlayerChain, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== 196) {
    throw new Error(`Expected chainId 196 for X Layer mainnet, got ${chainId}`);
  }

  // 2. Private key verification (only for live broadcast)
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  if (!isDryRun) {
    if (!spendsRealFunds) {
      throw new Error(
        'Safety lock: Live broadcast requires explicit flag --i-understand-this-spends-real-funds',
      );
    }
    if (!privateKey || !privateKey.startsWith('0x') || privateKey.length !== 66) {
      throw new Error(
        'Environment variable DEPLOYER_PRIVATE_KEY is missing or invalid. Set it to a 32-byte hex private key.',
      );
    }
  }

  const deployerAccount = privateKey ? privateKeyToAccount(privateKey) : undefined;
  const deployerAddress = deployerAccount
    ? deployerAccount.address
    : ('0x000000000000000000000000000000000000dEaD' as Address);

  console.log(`Deployer Address: ${privateKey ? deployerAddress : '[DRY-RUN PLACEHOLDER]'}\n`);

  // Step 1: Processor Discovery / Planning
  console.log('--- Phase 1: TapeOut Processor & Circuit Pinning ---');
  let circuitsAddr: Address;
  let circuitId: bigint = 1n;

  const createProcessorFlag = args.includes('--create-processor');
  const processorArgIdx = args.indexOf('--processor');
  const customProcessor =
    processorArgIdx !== -1 && args[processorArgIdx + 1]
      ? (getAddress(args[processorArgIdx + 1]) as Address)
      : undefined;

  let totalEstimatedGas = 0n;

  if (customProcessor) {
    circuitsAddr = customProcessor;
    console.log(`Using existing processor: ${circuitsAddr}`);
  } else if (!isDryRun && createProcessorFlag && deployerAccount) {
    console.log('Live creating processor and minting transistors...');
    const walletClient = createWalletClient({
      chain: xlayerChain,
      account: deployerAccount,
      transport: http(rpcUrl),
    });
    const deployFee = await publicClient.readContract({
      address: PROCESSOR_FACTORY_ADDRESS,
      abi: processorFactoryAbi,
      functionName: 'deployFee',
    });
    const protoFee = await publicClient.readContract({
      address: PROCESSOR_FACTORY_ADDRESS,
      abi: processorFactoryAbi,
      functionName: 'protocolFee',
    });
    const mintPrice = 1_000_000_000n; // 1 gwei
    const createTx = await walletClient.writeContract({
      address: PROCESSOR_FACTORY_ADDRESS,
      abi: processorFactoryAbi,
      functionName: 'createCPU',
      args: ['MandateRules', 'MNDT', 'Mandate rule processor for Seiyaku', 10000n, mintPrice],
      value: deployFee + protoFee,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: createTx });
    let createdCircuits: Address | undefined;
    let createdTransistors: Address | undefined;
    for (const log of receipt.logs) {
      if (log.topics[1] && log.topics[2]) {
        createdCircuits = getAddress(`0x${log.topics[1].slice(26)}`);
        createdTransistors = getAddress(`0x${log.topics[2].slice(26)}`);
      }
    }
    if (!createdCircuits || !createdTransistors) {
      throw new Error('Failed to resolve CPUCreated event addresses');
    }
    circuitsAddr = createdCircuits;
    console.log(`Created Circuits processor: ${circuitsAddr}`);

    // Mint NAND transistors
    const transProtoFee = await publicClient.readContract({
      address: createdTransistors,
      abi: transistorsAbi,
      functionName: 'protocolFee',
    });
    const transMintPrice = await publicClient.readContract({
      address: createdTransistors,
      abi: transistorsAbi,
      functionName: 'mintPrice',
    });
    const mintTotalCost = BigInt(MANDATE_V1_GATE_COUNT) * transMintPrice + transProtoFee;
    const mintTx = await walletClient.writeContract({
      address: createdTransistors,
      abi: transistorsAbi,
      functionName: 'mint',
      args: [0n, BigInt(MANDATE_V1_GATE_COUNT)],
      value: mintTotalCost,
    });
    await publicClient.waitForTransactionReceipt({ hash: mintTx });

    // Tapeout circuit
    const tapeoutFee = await publicClient.readContract({
      address: circuitsAddr,
      abi: circuitsAbi,
      functionName: 'TAPEOUT_FEE',
    });
    const tapeoutTx = await walletClient.writeContract({
      address: circuitsAddr,
      abi: circuitsAbi,
      functionName: 'tapeout',
      args: [toHex(MANDATE_V1_BYTES), 9, 1],
      value: tapeoutFee,
    });
    await publicClient.waitForTransactionReceipt({ hash: tapeoutTx });
    try {
      circuitId = await publicClient.readContract({
        address: circuitsAddr,
        abi: circuitsAbi,
        functionName: 'circuitCount',
      });
    } catch {
      circuitId = 1n;
      for (let id = 1n; id <= 100n; id++) {
        try {
          const nl = await publicClient.readContract({
            address: circuitsAddr,
            abi: circuitsAbi,
            functionName: 'netlist',
            args: [id],
          });
          if (nl === toHex(MANDATE_V1_BYTES)) {
            circuitId = id;
            break;
          }
        } catch {
          break;
        }
      }
    }
  } else {
    // Dry-run estimation
    circuitsAddr = DRY_RUN_PLACEHOLDER;
    console.log(
      '[DRY-RUN] Processor address is assigned at broadcast time (not known in advance).',
    );
    console.log(
      'ESTIMATE: processor creation about 0.00726 OKB (deployFee + protocolFee measured on 2026-10-25)',
    );
    console.log('ESTIMATE: transistor minting (17 NAND) about 0.000677 OKB');
    console.log('ESTIMATE: tapeout fee about 0.0013 OKB');
    totalEstimatedGas += 650_000n; // allowance for createCPU, mint and tapeout transactions (ESTIMATE)
  }

  // Pin verification values
  let beacon: Address = '0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C' as Address;
  let beaconImplementation: Address = '0x977f217887E085D298Cb3819cDAD5A0ee35F29B2' as Address;
  let beaconImplementationCodehash: Hex =
    '0x7a15c353205e5245f40f5f5524542a982a4bb3b9a28476e4f10845163f941b30' as Hex;

  try {
    const beaconSlotRaw = await publicClient.getStorageAt({
      address: circuitsAddr,
      slot: EIP1967_BEACON_SLOT,
    });
    if (
      beaconSlotRaw &&
      beaconSlotRaw !== '0x' &&
      !beaconSlotRaw.endsWith('0000000000000000000000000000000000000000')
    ) {
      beacon = getAddress(slice(beaconSlotRaw, 12, 32));
      beaconImplementation = await publicClient.readContract({
        address: beacon,
        abi: beaconAbi,
        functionName: 'implementation',
      });
      const beaconOwner = await publicClient.readContract({
        address: beacon,
        abi: beaconAbi,
        functionName: 'owner',
      });
      if (beaconOwner !== '0x0000000000000000000000000000000000000000') {
        throw new Error(
          `Security validation failed: Beacon owner is not zero address (${beaconOwner})`,
        );
      }
      const implCode = await publicClient.getCode({ address: beaconImplementation });
      if (implCode && implCode !== '0x') {
        beaconImplementationCodehash = keccak256(implCode);
      }
    }
  } catch (err: unknown) {
    if (!isDryRun) throw err;
    console.log('[DRY-RUN] Using verified known beacon pin constants for simulation.');
  }

  console.log(`   Beacon:                ${beacon}`);
  console.log(`   Beacon Implementation: ${beaconImplementation}`);
  console.log(`   Implementation Codehash: ${beaconImplementationCodehash}`);
  console.log(`   Netlist Hash:          ${MANDATE_V1_NETLIST_HASH}\n`);

  // Step 2: MandateVault master implementation
  console.log('--- Phase 2: MandateVault Master Implementation ---');
  const vaultArtifact = loadArtifact('contracts/out/MandateVault.sol/MandateVault.json');
  const vaultAbi = vaultArtifact.abi as Abi;
  const vaultGasEstimate = estimateCreateGas(vaultArtifact, 50_000n);
  console.log(
    `Estimated deployment gas for MandateVault: ~${vaultGasEstimate.toLocaleString()} gas (ESTIMATE by formula)`,
  );
  totalEstimatedGas += vaultGasEstimate;

  let vaultImplAddress: Address;
  if (!isDryRun && deployerAccount) {
    const walletClient = createWalletClient({
      chain: xlayerChain,
      account: deployerAccount,
      transport: http(rpcUrl),
    });
    const deployTx = await walletClient.deployContract({
      abi: vaultAbi,
      bytecode: vaultArtifact.bytecode.object,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx });
    if (!receipt.contractAddress) {
      throw new Error('MandateVault deployment returned no contract address');
    }
    vaultImplAddress = getAddress(receipt.contractAddress);
    console.log(`MandateVault deployed at: ${vaultImplAddress}`);
  } else {
    vaultImplAddress = DRY_RUN_PLACEHOLDER;
    console.log(
      '[DRY-RUN] MandateVault address is assigned at broadcast time (not known in advance).',
    );
  }

  // Step 3: MandateVaultFactory (Production: 24h delay, Demo: 120s delay)
  console.log('\n--- Phase 3: MandateVaultFactory Instances ---');
  const factoryArtifact = loadArtifact(
    'contracts/out/MandateVaultFactory.sol/MandateVaultFactory.json',
  );
  const factoryAbi = factoryArtifact.abi as Abi;
  const factoryGasEstimate = estimateCreateGas(factoryArtifact, 250_000n);
  console.log(
    `Estimated deployment gas per Factory: ~${factoryGasEstimate.toLocaleString()} gas (ESTIMATE by formula)`,
  );
  totalEstimatedGas += 2n * factoryGasEstimate;

  const baseConfig = {
    implementation: vaultImplAddress,
    baseToken: XLAYER_ADDRESSES.usdc,
    swapRouter: XLAYER_ADDRESSES.swapRouter02,
    processor: circuitsAddr,
    circuitId,
    netlistHash: MANDATE_V1_NETLIST_HASH as Hex,
    minWithdrawDelaySec: 3600, // 1 hour, per spec section 8
    maxDepositBase: 500_000_000n, // 500 USDC (6 decimals), per spec section 8, prototype deposit cap
    beacon,
    beaconImplementation,
    beaconImplementationCodehash,
  };

  const prodConfig = { ...baseConfig, loosenDelaySec: 86400 }; // 24 hours
  const demoConfig = { ...baseConfig, loosenDelaySec: 120 }; // 2 minutes

  let prodFactoryAddress: Address;
  let demoFactoryAddress: Address;

  if (!isDryRun && deployerAccount) {
    const walletClient = createWalletClient({
      chain: xlayerChain,
      account: deployerAccount,
      transport: http(rpcUrl),
    });

    console.log('Deploying Production Factory (loosenDelay = 24h)...');
    const prodTx = await walletClient.deployContract({
      abi: factoryAbi,
      bytecode: factoryArtifact.bytecode.object,
      args: [prodConfig],
    });
    const prodReceipt = await publicClient.waitForTransactionReceipt({ hash: prodTx });
    if (!prodReceipt.contractAddress) {
      throw new Error('Production Factory deployment returned no contract address');
    }
    prodFactoryAddress = getAddress(prodReceipt.contractAddress);
    console.log(`Production Factory deployed at: ${prodFactoryAddress}`);

    console.log('Deploying Demo Factory (loosenDelay = 120s)...');
    const demoTx = await walletClient.deployContract({
      abi: factoryAbi,
      bytecode: factoryArtifact.bytecode.object,
      args: [demoConfig],
    });
    const demoReceipt = await publicClient.waitForTransactionReceipt({ hash: demoTx });
    if (!demoReceipt.contractAddress) {
      throw new Error('Demo Factory deployment returned no contract address');
    }
    demoFactoryAddress = getAddress(demoReceipt.contractAddress);
    console.log(`Demo Factory deployed at: ${demoFactoryAddress}`);

    // Save deployments
    const mainnetDir = path.resolve('deployments/mainnet');
    fs.mkdirSync(mainnetDir, { recursive: true });
    fs.writeFileSync(
      path.join(mainnetDir, 'factory-prod.json'),
      JSON.stringify(
        {
          factory: prodFactoryAddress,
          implementation: vaultImplAddress,
          type: 'production',
          loosenDelaySec: prodConfig.loosenDelaySec,
          processor: circuitsAddr,
          circuitId: circuitId.toString(),
          netlistHash: prodConfig.netlistHash,
          beacon,
          beaconImplementation,
          beaconImplementationCodehash,
          baseToken: prodConfig.baseToken,
          swapRouter: prodConfig.swapRouter,
          deployer: deployerAddress,
          deployedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(mainnetDir, 'factory-demo.json'),
      JSON.stringify(
        {
          factory: demoFactoryAddress,
          implementation: vaultImplAddress,
          type: 'demo',
          loosenDelaySec: demoConfig.loosenDelaySec,
          processor: circuitsAddr,
          circuitId: circuitId.toString(),
          netlistHash: demoConfig.netlistHash,
          beacon,
          beaconImplementation,
          beaconImplementationCodehash,
          baseToken: demoConfig.baseToken,
          swapRouter: demoConfig.swapRouter,
          deployer: deployerAddress,
          deployedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log('Saved records to deployments/mainnet/factory-prod.json and factory-demo.json');
  } else {
    prodFactoryAddress = DRY_RUN_PLACEHOLDER;
    demoFactoryAddress = DRY_RUN_PLACEHOLDER;
    console.log(
      '[DRY-RUN] Factory addresses are assigned at broadcast time (not known in advance).',
    );
    console.log(
      `[DRY-RUN] Production config: loosen delay 86400 s, min withdraw delay ${baseConfig.minWithdrawDelaySec} s, deposit cap ${baseConfig.maxDepositBase} (6 decimals)`,
    );
    console.log(
      `[DRY-RUN] Demo config:       loosen delay 120 s (demo only, never present it as the public factory)`,
    );
  }

  // Cost estimation summary
  const gasPrice = await publicClient.getGasPrice();
  const estimatedCostWei = totalEstimatedGas * gasPrice;
  const estimatedTotalOkb = formatEther(estimatedCostWei + 9_237_000_000_000_000n); // Gas + tapeout/mint fees

  console.log('\n================================================================');
  console.log('                 DEPLOYMENT COST ESTIMATION                     ');
  console.log('================================================================');
  console.log(`Current Gas Price:     ${formatEther(gasPrice * 1_000_000_000n)} Gwei`);
  console.log(`Total Gas Estimate:    ${totalEstimatedGas.toLocaleString()} gas`);
  console.log(`Protocol / Mint Fees:  0.009237 OKB`);
  console.log(`Total Estimated Cost:  ~${Number(estimatedTotalOkb).toFixed(5)} OKB`);
  console.log('Recommended Funding:   0.05 OKB (provides safe margin for gas variations)');
  console.log('================================================================\n');

  if (isDryRun) {
    console.log('Dry run complete. No transactions were broadcast.');
  } else {
    console.log(
      'Live deployment complete. Addresses are in deployments/mainnet/*.json (not committed).',
    );
    console.log(
      'Next steps: verify the source on Sourcify and record the addresses (docs/DEPLOY.md).',
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve('scripts/deploy-mainnet.ts')
) {
  deployMainnet().catch((err) => {
    console.error('Fatal error during deploy-mainnet:', err);
    process.exit(1);
  });
}
