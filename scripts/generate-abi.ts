/**
 * scripts/generate-abi.ts
 * Generates typed `as const` ABIs from Foundry artifacts into apps/web/src/chain/abi/
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import prettier from 'prettier';

const TARGET_DIR = path.resolve('apps/web/src/chain/abi');

export async function generateAbis(outDir: string = TARGET_DIR): Promise<void> {
  // 1. Build contracts with forge
  console.log('Running forge build...');
  const forgeResult = spawnSync('forge', ['build'], {
    cwd: path.resolve('contracts'),
    shell: true,
    stdio: 'inherit',
  });
  if (forgeResult.status !== 0) {
    throw new Error(`forge build failed with exit code ${forgeResult.status}`);
  }

  fs.mkdirSync(outDir, { recursive: true });

  // Read prettier config
  const prettierConfig = (await prettier.resolveConfig(path.resolve('.prettierrc'))) || {};

  async function formatAndWrite(filename: string, content: string): Promise<void> {
    const formatted = await prettier.format(content, {
      ...prettierConfig,
      parser: 'typescript',
    });
    fs.writeFileSync(path.join(outDir, filename), formatted);
  }

  // 2. Read artifacts
  const vaultArtifactPath = path.resolve('contracts/out/MandateVault.sol/MandateVault.json');
  const factoryArtifactPath = path.resolve(
    'contracts/out/MandateVaultFactory.sol/MandateVaultFactory.json',
  );
  const erc20ArtifactPath = path.resolve('contracts/out/IERC20Metadata.sol/IERC20Metadata.json');

  const vaultArtifact = JSON.parse(fs.readFileSync(vaultArtifactPath, 'utf8'));
  const factoryArtifact = JSON.parse(fs.readFileSync(factoryArtifactPath, 'utf8'));
  const erc20Artifact = JSON.parse(fs.readFileSync(erc20ArtifactPath, 'utf8'));

  // Processor ABI
  const processorAbi = [
    {
      type: 'function',
      name: 'eval',
      inputs: [
        { name: 'id', type: 'uint256' },
        { name: 'inputs', type: 'bytes' },
      ],
      outputs: [{ name: '', type: 'bytes' }],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'netlist',
      inputs: [{ name: 'id', type: 'uint256' }],
      outputs: [{ name: '', type: 'bytes' }],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'circuitCount',
      inputs: [],
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'TAPEOUT_FEE',
      inputs: [],
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
    },
  ];

  // Beacon ABI
  const beaconAbi = [
    {
      type: 'function',
      name: 'implementation',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'owner',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
      stateMutability: 'view',
    },
  ];

  // Write individual ABI files
  await formatAndWrite(
    'mandateVaultAbi.ts',
    `export const mandateVaultAbi = ${JSON.stringify(vaultArtifact.abi, null, 2)} as const;\n`,
  );

  await formatAndWrite(
    'mandateVaultFactoryAbi.ts',
    `export const mandateVaultFactoryAbi = ${JSON.stringify(factoryArtifact.abi, null, 2)} as const;\n`,
  );

  await formatAndWrite(
    'erc20Abi.ts',
    `export const erc20Abi = ${JSON.stringify(erc20Artifact.abi, null, 2)} as const;\n`,
  );

  await formatAndWrite(
    'processorAbi.ts',
    `export const processorAbi = ${JSON.stringify(processorAbi, null, 2)} as const;\n`,
  );

  await formatAndWrite(
    'beaconAbi.ts',
    `export const beaconAbi = ${JSON.stringify(beaconAbi, null, 2)} as const;\n`,
  );

  await formatAndWrite(
    'index.ts',
    `export * from './mandateVaultAbi.js';\nexport * from './mandateVaultFactoryAbi.js';\nexport * from './erc20Abi.js';\nexport * from './processorAbi.js';\nexport * from './beaconAbi.js';\n`,
  );

  console.log(`Successfully generated ABIs to ${outDir}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  generateAbis().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
