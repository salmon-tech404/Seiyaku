import { createPublicClient, createWalletClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
import path from 'node:path';
import { MANDATE_V1_GATE_COUNT, MANDATE_V1_NETLIST_HASH } from '@seiyaku/circuit-tools';
import {
  ANVIL_DEFAULT_KEY,
  PROCESSOR_FACTORY_ADDRESS,
  tapeoutMandateOnFork,
  packCandidate1,
  packCandidate2,
  packCandidate3,
} from './lib/tapeout.js';

export { packCandidate1, packCandidate2, packCandidate3 };

async function main() {
  const rpcUrl = process.env.FORK_RPC_URL || 'http://127.0.0.1:8545';
  console.log(`=== TapeOut Fork Runner: connecting to ${rpcUrl} ===`);

  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const account = privateKeyToAccount(ANVIL_DEFAULT_KEY);
  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
  });

  const res = await tapeoutMandateOnFork(publicClient, walletClient, account);

  // Save deployments
  const deploymentsDir = path.resolve('deployments/fork');
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const deployData = {
    factory: PROCESSOR_FACTORY_ADDRESS,
    circuits: res.circuitsAddr,
    transistors: res.transistorsAddr,
    circuitId: res.circuitId.toString(),
    netlistHash: MANDATE_V1_NETLIST_HASH,
    gateCount: MANDATE_V1_GATE_COUNT,
    packingRule: res.packingRule,
    forkBlock: res.blockNum.toString(),
  };
  fs.writeFileSync(
    path.join(deploymentsDir, 'mandate-v1.json'),
    JSON.stringify(deployData, null, 2),
  );

  // Generate Solidity constants file
  const genSolDir = path.resolve('contracts/test/fork');
  fs.mkdirSync(genSolDir, { recursive: true });
  const checksummedCircuits = getAddress(res.circuitsAddr);
  fs.writeFileSync(
    path.join(genSolDir, 'Generated.sol'),
    `// SPDX-License-Identifier: MIT
// GENERATED FILE - DO NOT COMMIT
pragma solidity 0.8.23;

library GeneratedConstants {
    address internal constant PROCESSOR = ${checksummedCircuits};
    uint256 internal constant CIRCUIT_ID = ${res.circuitId};
    bytes32 internal constant NETLIST_HASH = ${MANDATE_V1_NETLIST_HASH};
}
`,
  );

  console.log('\n=== TapeOut on Fork Summary ===');
  console.log(`Gate count: ${MANDATE_V1_GATE_COUNT}`);
  console.log(`Processor (circuits): ${res.circuitsAddr}`);
  console.log(`Transistors: ${res.transistorsAddr}`);
  console.log(`Circuit ID: ${res.circuitId}`);
  console.log(`Packing Rule: ${res.packingRule}`);
  console.log('Result saved to deployments/fork/mandate-v1.json');
  console.log(
    'contracts/test/fork/Generated.sol now holds fork specific values. Run `npm run fork:reset-generated` before committing.',
  );
}

main().catch((err) => {
  console.error('Fatal error during tapeout-fork:', err);
  process.exit(1);
});
