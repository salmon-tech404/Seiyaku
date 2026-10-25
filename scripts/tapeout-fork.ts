import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  toHex,
  getAddress,
  formatEther,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
import path from 'node:path';
import {
  mandateV1Netlist,
  MANDATE_V1_BYTES,
  MANDATE_V1_GATE_COUNT,
  MANDATE_V1_NETLIST_HASH,
  evaluate,
} from '@seiyaku/circuit-tools';

// Anvil default account #0 (throwaway test key only)
const ANVIL_DEFAULT_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

const factoryAddress = '0x1f09DAeFA827f02CBb40967cc91b259763760761' as const;

const factoryAbi = parseAbi([
  'function deployFee() view returns (uint256)',
  'function protocolFee() view returns (uint256)',
  'function createCPU(string name, string symbol, string story, uint256 transistorSupply, uint256 mintPrice) payable returns (address transistors, address circuits)',
]);

const circuitsAbi = parseAbi([
  'function TAPEOUT_FEE() view returns (uint256)',
  'function tapeout(bytes nl, uint32 nIn, uint32 nOut) payable returns (uint256)',
  'function eval(uint256 id, bytes inputs) view returns (bytes)',
  'function netlist(uint256 id) view returns (bytes)',
  'function transistors() view returns (address)',
  'function circuitCount() view returns (uint256)',
]);

const transistorsAbi = parseAbi([
  'function mint(uint256 typeId, uint256 count) payable',
  'function mintPrice() view returns (uint256)',
  'function protocolFee() view returns (uint256)',
]);

export function packCandidate1(inputBits: bigint): Hex {
  // Candidate 1: Two bytes, little-endian bit order (bit 0 in byte 0 lowest bit, bit 8 in byte 1 lowest bit)
  const b0 = Number(inputBits & 0xffn);
  const b1 = Number((inputBits >> 8n) & 0xffn);
  return toHex(new Uint8Array([b0, b1]));
}

export function packCandidate2(inputBits: bigint): Hex {
  // Candidate 2: Two bytes, bit 8 in first byte
  const b0 = Number((inputBits >> 8n) & 0xffn);
  const b1 = Number(inputBits & 0xffn);
  return toHex(new Uint8Array([b0, b1]));
}

export function packCandidate3(inputBits: bigint): Hex {
  // Candidate 3: uint16 big-endian
  const val = Number(inputBits & 0xffffn);
  return toHex(new Uint8Array([(val >> 8) & 0xff, val & 0xff]));
}

async function main() {
  const rpcUrl = process.env.FORK_RPC_URL || 'http://127.0.0.1:8545';
  console.log(`=== TapeOut Fork Runner: connecting to ${rpcUrl} ===`);

  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const account = privateKeyToAccount(ANVIL_DEFAULT_KEY);
  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
  });

  const chainId = await publicClient.getChainId();
  if (chainId !== 196) {
    throw new Error(`Expected chainId 196 on fork, got ${chainId}`);
  }
  const blockNum = await publicClient.getBlockNumber();
  console.log(`Chain ID: ${chainId}, Fork Block: ${blockNum}`);

  // Ensure balance and clean EOA code (Anvil fork accounts may inherit bytecode on live networks)
  try {
    await publicClient.request({
      method: 'anvil_setBalance',
      params: [account.address, '0x21e19e0c9bab2400000'],
    } as unknown as Parameters<typeof publicClient.request>[0]);
    await publicClient.request({
      method: 'anvil_setCode',
      params: [account.address, '0x'],
    } as unknown as Parameters<typeof publicClient.request>[0]);
  } catch {
    // Non-fatal if node is not anvil
  }

  // 1. Read factory fees
  const deployFee = await publicClient.readContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: 'deployFee',
  });
  const protoFee = await publicClient.readContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: 'protocolFee',
  });
  console.log(
    `Processor factory deployFee: ${formatEther(deployFee)} OKB, protocolFee: ${formatEther(protoFee)} OKB`,
  );

  // 2. Call createCPU
  console.log('Calling createCPU (name: MandateRules, symbol: MNDT, supply: 10000)...');
  const mintPrice = 1_000_000_000n; // 1 gwei
  const createCpuTx = await walletClient.writeContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: 'createCPU',
    args: ['MandateRules', 'MNDT', 'Mandate rule processor for Seiyaku', 10000n, mintPrice],
    value: deployFee + protoFee,
  });
  console.log(`createCPU tx: ${createCpuTx}`);
  const createCpuReceipt = await publicClient.waitForTransactionReceipt({ hash: createCpuTx });

  let circuitsAddr: Address | undefined;
  let transistorsAddr: Address | undefined;

  for (const log of createCpuReceipt.logs) {
    if (log.topics[1] && log.topics[2]) {
      circuitsAddr = `0x${log.topics[1].slice(26)}` as Address;
      transistorsAddr = `0x${log.topics[2].slice(26)}` as Address;
    }
  }

  if (!transistorsAddr || !circuitsAddr) {
    throw new Error('Failed to parse CPUCreated event addresses');
  }

  console.log(`Created Transistors contract: ${transistorsAddr}`);
  console.log(`Created Circuits processor:    ${circuitsAddr}`);

  // 3. Mint NAND transistors
  console.log(`Minting ${MANDATE_V1_GATE_COUNT} NAND transistors (type 0)...`);
  const transProtoFee = await publicClient.readContract({
    address: transistorsAddr,
    abi: transistorsAbi,
    functionName: 'protocolFee',
  });
  const transMintPrice = await publicClient.readContract({
    address: transistorsAddr,
    abi: transistorsAbi,
    functionName: 'mintPrice',
  });
  const mintTotalCost = BigInt(MANDATE_V1_GATE_COUNT) * transMintPrice + transProtoFee;

  const mintTx = await walletClient.writeContract({
    address: transistorsAddr,
    abi: transistorsAbi,
    functionName: 'mint',
    args: [0n, BigInt(MANDATE_V1_GATE_COUNT)],
    value: mintTotalCost,
  });
  console.log(`mint tx: ${mintTx}`);
  await publicClient.waitForTransactionReceipt({ hash: mintTx });

  // 4. Tapeout circuit
  console.log('Taping out MANDATE_V1 circuit (9 in, 1 out)...');
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
  console.log(`tapeout tx: ${tapeoutTx}`);
  await publicClient.waitForTransactionReceipt({ hash: tapeoutTx });

  // 5. Discover circuit ID
  let circuitId = 1n;
  try {
    const count = await publicClient.readContract({
      address: circuitsAddr,
      abi: circuitsAbi,
      functionName: 'circuitCount',
    });
    circuitId = count;
    console.log(`Found circuitCount: ${count}`);
  } catch {
    // Scan matching netlist
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
          console.log(`Matched netlist at circuit id ${id}`);
          break;
        }
      } catch {
        break;
      }
    }
  }

  // 6. Test packing candidates against simulator for all 512 inputs
  console.log(`Testing packing rule candidates on circuit ${circuitId}...`);
  const candidates = [
    { name: 'Candidate 1: two bytes, little-endian bit order', fn: packCandidate1 },
    { name: 'Candidate 2: two bytes, bit 8 in byte 0', fn: packCandidate2 },
    { name: 'Candidate 3: uint16 big-endian', fn: packCandidate3 },
  ];

  const netlist = mandateV1Netlist();
  let winningCandidate: string | null = null;

  for (const cand of candidates) {
    let matched = 0;
    for (let i = 0; i < 512; i++) {
      const inputBits = BigInt(i);
      const packed = cand.fn(inputBits);
      const evalBytes = await publicClient.readContract({
        address: circuitsAddr,
        abi: circuitsAbi,
        functionName: 'eval',
        args: [circuitId, packed],
      });
      // Parse output bit (bit 0 of first byte)
      const outByte = parseInt(evalBytes.slice(2, 4) || '0', 16);
      const actualBit = BigInt(outByte & 1);
      const expectedBit = evaluate(netlist, inputBits);

      if (actualBit === expectedBit) {
        matched++;
      } else {
        break;
      }
    }
    console.log(`  ${cand.name}: ${matched}/512 matched`);
    if (matched === 512) {
      winningCandidate = cand.name;
      break;
    }
  }

  // Save deployments
  const deploymentsDir = path.resolve('deployments/fork');
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const deployData = {
    factory: factoryAddress,
    circuits: circuitsAddr,
    transistors: transistorsAddr,
    circuitId: circuitId.toString(),
    netlistHash: MANDATE_V1_NETLIST_HASH,
    gateCount: MANDATE_V1_GATE_COUNT,
    packingRule: winningCandidate || 'Candidate 1: two bytes, little-endian bit order',
    forkBlock: blockNum.toString(),
  };
  fs.writeFileSync(
    path.join(deploymentsDir, 'mandate-v1.json'),
    JSON.stringify(deployData, null, 2),
  );

  // Generate Solidity constants file
  const genSolDir = path.resolve('contracts/test/fork');
  fs.mkdirSync(genSolDir, { recursive: true });
  const checksummedCircuits = getAddress(circuitsAddr);
  fs.writeFileSync(
    path.join(genSolDir, 'Generated.sol'),
    `// SPDX-License-Identifier: MIT
// GENERATED FILE - DO NOT COMMIT
pragma solidity 0.8.23;

library GeneratedConstants {
    address internal constant PROCESSOR = ${checksummedCircuits};
    uint256 internal constant CIRCUIT_ID = ${circuitId};
    bytes32 internal constant NETLIST_HASH = ${MANDATE_V1_NETLIST_HASH};
}
`,
  );

  console.log('\n=== TapeOut on Fork Summary ===');
  console.log(`Gate count: ${MANDATE_V1_GATE_COUNT}`);
  console.log(`Processor (circuits): ${circuitsAddr}`);
  console.log(`Transistors: ${transistorsAddr}`);
  console.log(`Circuit ID: ${circuitId}`);
  console.log(`Packing Rule: ${winningCandidate}`);
  console.log('Result saved to deployments/fork/mandate-v1.json');
}

main().catch((err) => {
  console.error('Fatal error during tapeout-fork:', err);
  process.exit(1);
});
