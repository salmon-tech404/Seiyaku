import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

interface DeploymentJson {
  factory?: string;
  implementation?: string;
  type?: string;
}

export async function verifySourcify() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--broadcast') && !args.includes('--submit');
  const isFork = args.includes('--fork');

  console.log('================================================================');
  console.log('             SOURCIFY CONTRACT VERIFICATION                     ');
  console.log('================================================================');
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (SIMULATION ONLY)' : 'SUBMISSION'}\n`);

  const deploymentsDir = isFork
    ? path.resolve('deployments/fork')
    : path.resolve('deployments/mainnet');
  if (!fs.existsSync(deploymentsDir)) {
    console.log(`No deployment files found at ${deploymentsDir}.`);
    console.log('To verify after deployment, run deploy:mainnet first.');
    return;
  }

  const files = fs.readdirSync(deploymentsDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log(`No JSON deployments found in ${deploymentsDir}.`);
    return;
  }

  const contractsToVerify: Array<{ address: string; contractPath: string; name: string }> = [];

  for (const file of files) {
    const filePath = path.join(deploymentsDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DeploymentJson;
      if (
        data.implementation &&
        !contractsToVerify.some((c) => c.address === data.implementation)
      ) {
        contractsToVerify.push({
          address: data.implementation,
          contractPath: 'src/MandateVault.sol:MandateVault',
          name: 'MandateVault Implementation',
        });
      }
      if (data.factory && !contractsToVerify.some((c) => c.address === data.factory)) {
        contractsToVerify.push({
          address: data.factory,
          contractPath: 'src/MandateVaultFactory.sol:MandateVaultFactory',
          name: `MandateVaultFactory (${data.type || file})`,
        });
      }
    } catch {
      // Ignore unparseable
    }
  }

  console.log(`Found ${contractsToVerify.length} unique deployed contracts to verify:\n`);
  for (const c of contractsToVerify) {
    console.log(`  * ${c.name.padEnd(35)} ${c.address} (${c.contractPath})`);
  }
  console.log('');

  if (isDryRun) {
    console.log('DRY-RUN: Would execute:');
    for (const c of contractsToVerify) {
      console.log(
        `  forge verify-contract ${c.address} ${c.contractPath} --verifier sourcify --chain-id 196`,
      );
    }
    console.log('\nPass --submit to perform live verification.');
    return;
  }

  // Live verification submission
  for (const c of contractsToVerify) {
    console.log(`\nSubmitting ${c.name} (${c.address}) to Sourcify...`);
    const cmd = 'forge';
    const forgeArgs = [
      'verify-contract',
      c.address,
      c.contractPath,
      '--verifier',
      'sourcify',
      '--chain-id',
      '196',
    ];
    const res = spawnSync(cmd, forgeArgs, {
      cwd: path.resolve('contracts'),
      stdio: 'inherit',
      shell: true,
    });
    if (res.status === 0) {
      console.log(`Successfully verified ${c.name}!`);
    } else {
      console.warn(`Verification returned code ${res.status} for ${c.name}.`);
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve('scripts/verify-sourcify.ts')
) {
  verifySourcify().catch((err) => {
    console.error('Fatal error during sourcify verification:', err);
    process.exit(1);
  });
}
