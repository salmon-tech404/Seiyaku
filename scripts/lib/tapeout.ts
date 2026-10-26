import {
  parseAbi,
  toHex,
  getAddress,
  keccak256,
  slice,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Account,
} from 'viem';
import {
  mandateV1Netlist,
  MANDATE_V1_BYTES,
  MANDATE_V1_GATE_COUNT,
  evaluate,
} from '@seiyaku/circuit-tools';

export const ANVIL_DEFAULT_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

export const PROCESSOR_FACTORY_ADDRESS = '0x1f09DAeFA827f02CBb40967cc91b259763760761' as const;

export const EIP1967_BEACON_SLOT =
  '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50' as const;

export const factoryAbi = parseAbi([
  'function deployFee() view returns (uint256)',
  'function protocolFee() view returns (uint256)',
  'function createCPU(string name, string symbol, string story, uint256 transistorSupply, uint256 mintPrice) payable returns (address transistors, address circuits)',
]);

export const circuitsAbi = parseAbi([
  'function TAPEOUT_FEE() view returns (uint256)',
  'function tapeout(bytes nl, uint32 nIn, uint32 nOut) payable returns (uint256)',
  'function eval(uint256 id, bytes inputs) view returns (bytes)',
  'function netlist(uint256 id) view returns (bytes)',
  'function transistors() view returns (address)',
  'function circuitCount() view returns (uint256)',
]);

export const transistorsAbi = parseAbi([
  'function mint(uint256 typeId, uint256 count) payable',
  'function mintPrice() view returns (uint256)',
  'function protocolFee() view returns (uint256)',
]);

export const beaconAbi = parseAbi([
  'function implementation() view returns (address)',
  'function owner() view returns (address)',
]);

export function packCandidate1(inputBits: bigint): Hex {
  const b0 = Number(inputBits & 0xffn);
  const b1 = Number((inputBits >> 8n) & 0xffn);
  return toHex(new Uint8Array([b0, b1]));
}

export function packCandidate2(inputBits: bigint): Hex {
  const b0 = Number((inputBits >> 8n) & 0xffn);
  const b1 = Number(inputBits & 0xffn);
  return toHex(new Uint8Array([b0, b1]));
}

export function packCandidate3(inputBits: bigint): Hex {
  const val = Number(inputBits & 0xffffn);
  return toHex(new Uint8Array([(val >> 8) & 0xff, val & 0xff]));
}

export interface TapeoutResult {
  circuitsAddr: Address;
  transistorsAddr: Address;
  circuitId: bigint;
  beacon: Address;
  beaconImplementation: Address;
  beaconImplementationCodehash: Hex;
  packingRule: string;
  blockNum: bigint;
}

export async function tapeoutMandateOnFork(
  publicClient: PublicClient,
  walletClient: WalletClient,
  account: Account,
): Promise<TapeoutResult> {
  const chainId = await publicClient.getChainId();
  if (chainId !== 196) {
    throw new Error(`Expected chainId 196 on fork, got ${chainId}`);
  }
  const blockNum = await publicClient.getBlockNumber();

  // Reset anvil EOA balance & code
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
    address: PROCESSOR_FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'deployFee',
  });
  const protoFee = await publicClient.readContract({
    address: PROCESSOR_FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'protocolFee',
  });

  // 2. Call createCPU
  const mintPrice = 1_000_000_000n; // 1 gwei
  const createCpuTx = await walletClient.writeContract({
    address: PROCESSOR_FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'createCPU',
    args: ['MandateRules', 'MNDT', 'Mandate rule processor for Seiyaku', 10000n, mintPrice],
    value: deployFee + protoFee,
  });
  const createCpuReceipt = await publicClient.waitForTransactionReceipt({ hash: createCpuTx });

  let circuitsAddr: Address | undefined;
  let transistorsAddr: Address | undefined;

  for (const log of createCpuReceipt.logs) {
    if (log.topics[1] && log.topics[2]) {
      circuitsAddr = getAddress(`0x${log.topics[1].slice(26)}`);
      transistorsAddr = getAddress(`0x${log.topics[2].slice(26)}`);
    }
  }

  if (!transistorsAddr || !circuitsAddr) {
    throw new Error('Failed to parse CPUCreated event addresses');
  }

  // 3. Mint NAND transistors
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
  await publicClient.waitForTransactionReceipt({ hash: mintTx });

  // 4. Tapeout circuit
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

  // 5. Discover circuit ID
  let circuitId = 1n;
  try {
    const count = await publicClient.readContract({
      address: circuitsAddr,
      abi: circuitsAbi,
      functionName: 'circuitCount',
    });
    circuitId = count;
  } catch {
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

  // 6. Test packing rule candidates against simulator
  const candidates = [
    { name: 'Candidate 1: two bytes, little-endian bit order', fn: packCandidate1 },
    { name: 'Candidate 2: two bytes, bit 8 in byte 0', fn: packCandidate2 },
    { name: 'Candidate 3: uint16 big-endian', fn: packCandidate3 },
  ];

  const netlist = mandateV1Netlist();
  let winningCandidate = 'Candidate 1: two bytes, little-endian bit order';

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
      const outByte = parseInt(evalBytes.slice(2, 4) || '0', 16);
      const actualBit = BigInt(outByte & 1);
      const expectedBit = evaluate(netlist, inputBits);

      if (actualBit === expectedBit) {
        matched++;
      } else {
        break;
      }
    }
    if (matched === 512) {
      winningCandidate = cand.name;
      break;
    }
  }

  // 7. Discover Beacon and implementation
  const beaconSlotRaw = await publicClient.getStorageAt({
    address: circuitsAddr,
    slot: EIP1967_BEACON_SLOT,
  });
  if (!beaconSlotRaw) {
    throw new Error('Failed to read beacon storage slot from circuits contract');
  }
  const beacon = getAddress(slice(beaconSlotRaw, 12, 32));

  const beaconImplementation = await publicClient.readContract({
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
    throw new Error(`Expected beacon owner to be zero address, got ${beaconOwner}`);
  }

  const implCode = await publicClient.getCode({ address: beaconImplementation });
  if (!implCode || implCode === '0x') {
    throw new Error(`Empty code at beacon implementation ${beaconImplementation}`);
  }
  const beaconImplementationCodehash = keccak256(implCode);

  return {
    circuitsAddr,
    transistorsAddr,
    circuitId,
    beacon,
    beaconImplementation,
    beaconImplementationCodehash,
    packingRule: winningCandidate,
    blockNum,
  };
}
