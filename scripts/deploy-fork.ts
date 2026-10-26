import { createPublicClient, createWalletClient, http, getAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
import path from 'node:path';
import { MANDATE_V1_NETLIST_HASH } from '@seiyaku/circuit-tools';
import { ANVIL_DEFAULT_KEY, tapeoutMandateOnFork } from './lib/tapeout.js';
import { XLAYER_ADDRESSES } from './config/xlayer.js';

interface ArtifactJson {
  abi: unknown[];
  bytecode: {
    object: Hex;
  };
}

function loadArtifact(relativePath: string): ArtifactJson {
  const fullPath = path.resolve(relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Artifact not found at ${fullPath}. Did you run 'forge build'?`);
  }
  return JSON.parse(fs.readFileSync(fullPath, 'utf8')) as ArtifactJson;
}

export async function deployOnFork(options?: { rpcUrl?: string; allowLive?: boolean }) {
  const rpcUrl = options?.rpcUrl || process.env.FORK_RPC_URL || 'http://127.0.0.1:8545';
  console.log(`=== Deploy Fork: connecting to ${rpcUrl} ===`);

  const isLocalHost = rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost');
  const allowLive = options?.allowLive || process.argv.includes('--allow-live');

  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const account = privateKeyToAccount(ANVIL_DEFAULT_KEY);
  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
  });

  const chainId = await publicClient.getChainId();
  if (chainId !== 196) {
    throw new Error(`Expected chainId 196 for X Layer, got ${chainId}`);
  }

  // Safety check: refuse to run against live non-fork RPC without explicit override flag
  if (!isLocalHost && !allowLive) {
    throw new Error(
      'Refusing to run deploy-fork on non-fork/remote RPC without explicit --allow-live flag.',
    );
  }

  console.log('1. Taping out MANDATE_V1 on fork...');
  const tapeoutRes = await tapeoutMandateOnFork(publicClient, walletClient, account);
  console.log(`   Processor: ${tapeoutRes.circuitsAddr}`);
  console.log(`   Circuit ID: ${tapeoutRes.circuitId}`);
  console.log(`   Beacon: ${tapeoutRes.beacon}`);
  console.log(`   Beacon Implementation: ${tapeoutRes.beaconImplementation}`);
  console.log(`   Codehash: ${tapeoutRes.beaconImplementationCodehash}`);

  // 2. Deploy MandateVault implementation
  console.log('2. Deploying MandateVault master implementation...');
  const vaultArtifact = loadArtifact('contracts/out/MandateVault.sol/MandateVault.json');
  const vaultDeployTx = await walletClient.deployContract({
    abi: vaultArtifact.abi,
    bytecode: vaultArtifact.bytecode.object,
  });
  const vaultReceipt = await publicClient.waitForTransactionReceipt({ hash: vaultDeployTx });
  if (!vaultReceipt.contractAddress) {
    throw new Error('MandateVault deployment receipt did not return a contract address');
  }
  const vaultImplAddress = getAddress(vaultReceipt.contractAddress);
  console.log(`   MandateVault implementation deployed at: ${vaultImplAddress}`);

  // 3. Deploy MandateVaultFactory
  console.log('3. Deploying MandateVaultFactory...');
  const factoryArtifact = loadArtifact(
    'contracts/out/MandateVaultFactory.sol/MandateVaultFactory.json',
  );

  const factoryConfig = {
    implementation: vaultImplAddress,
    baseToken: XLAYER_ADDRESSES.usdc,
    swapRouter: XLAYER_ADDRESSES.swapRouter02,
    processor: tapeoutRes.circuitsAddr,
    circuitId: tapeoutRes.circuitId,
    netlistHash: MANDATE_V1_NETLIST_HASH as Hex,
    loosenDelaySec: 86400,
    minWithdrawDelaySec: 86400,
    maxDepositBase: 1_000_000_000_000n, // 1,000,000 USDC
    beacon: tapeoutRes.beacon,
    beaconImplementation: tapeoutRes.beaconImplementation,
    beaconImplementationCodehash: tapeoutRes.beaconImplementationCodehash,
  };

  const factoryDeployTx = await walletClient.deployContract({
    abi: factoryArtifact.abi,
    bytecode: factoryArtifact.bytecode.object,
    args: [factoryConfig],
  });
  const factoryReceipt = await publicClient.waitForTransactionReceipt({ hash: factoryDeployTx });
  if (!factoryReceipt.contractAddress) {
    throw new Error('MandateVaultFactory deployment receipt did not return a contract address');
  }
  const factoryAddress = getAddress(factoryReceipt.contractAddress);
  console.log(`   MandateVaultFactory deployed at: ${factoryAddress}`);

  // 4. Save deployments/fork/factory.json
  const deploymentsDir = path.resolve('deployments/fork');
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const deployData = {
    factory: factoryAddress,
    implementation: vaultImplAddress,
    baseToken: factoryConfig.baseToken,
    swapRouter: factoryConfig.swapRouter,
    processor: factoryConfig.processor,
    circuitId: factoryConfig.circuitId.toString(),
    netlistHash: factoryConfig.netlistHash,
    beacon: factoryConfig.beacon,
    beaconImplementation: factoryConfig.beaconImplementation,
    beaconImplementationCodehash: factoryConfig.beaconImplementationCodehash,
    loosenDelaySec: factoryConfig.loosenDelaySec,
    minWithdrawDelaySec: factoryConfig.minWithdrawDelaySec,
    maxDepositBase: factoryConfig.maxDepositBase.toString(),
    deployer: account.address,
    forkBlock: tapeoutRes.blockNum.toString(),
  };

  fs.writeFileSync(path.join(deploymentsDir, 'factory.json'), JSON.stringify(deployData, null, 2));
  console.log('   Saved deployment to deployments/fork/factory.json');

  // 5. Update contracts/test/fork/Generated.sol
  const genSolDir = path.resolve('contracts/test/fork');
  fs.mkdirSync(genSolDir, { recursive: true });
  fs.writeFileSync(
    path.join(genSolDir, 'Generated.sol'),
    `// SPDX-License-Identifier: MIT
// GENERATED FILE - DO NOT COMMIT
pragma solidity 0.8.23;

library GeneratedConstants {
    address internal constant PROCESSOR = ${tapeoutRes.circuitsAddr};
    uint256 internal constant CIRCUIT_ID = ${tapeoutRes.circuitId};
    bytes32 internal constant NETLIST_HASH = ${MANDATE_V1_NETLIST_HASH};
    address internal constant FACTORY = ${factoryAddress};
    address internal constant VAULT_IMPL = ${vaultImplAddress};
    address internal constant BEACON = ${tapeoutRes.beacon};
    address internal constant BEACON_IMPL = ${tapeoutRes.beaconImplementation};
    bytes32 internal constant BEACON_IMPL_CODEHASH = ${tapeoutRes.beaconImplementationCodehash};
}
`,
  );
  console.log('   Updated contracts/test/fork/Generated.sol with deployed addresses.');

  return {
    factoryAddress,
    vaultImplAddress,
    tapeoutRes,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/deploy-fork.ts')) {
  deployOnFork().catch((err) => {
    console.error('Fatal error during deploy-fork:', err);
    process.exit(1);
  });
}
