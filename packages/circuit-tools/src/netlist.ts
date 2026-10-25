export class NetlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetlistError';
  }
}

export interface NandGate {
  readonly type: 'NAND';
  readonly a: number;
  readonly b: number;
}

export type Gate = NandGate;

export interface Netlist {
  readonly nIn: number;
  readonly nOut: number;
  readonly gates: readonly Gate[];
}

const MAX_U24 = 16_777_215;

/**
 * Validates a netlist for signal ranges, topological ordering, and gate count.
 */
export function validateNetlist(netlist: Netlist): void {
  if (netlist.nIn < 0 || !Number.isInteger(netlist.nIn)) {
    throw new NetlistError(`Invalid nIn: ${netlist.nIn}`);
  }
  if (netlist.nOut < 0 || !Number.isInteger(netlist.nOut)) {
    throw new NetlistError(`Invalid nOut: ${netlist.nOut}`);
  }

  const baseInputSignals = 2 + netlist.nIn;

  for (let i = 0; i < netlist.gates.length; i++) {
    const gate = netlist.gates[i];
    if (!gate) {
      throw new NetlistError(`Missing gate at index ${i}`);
    }
    const currentSignal = baseInputSignals + i;

    if (gate.a < 0 || gate.a > MAX_U24 || gate.b < 0 || gate.b > MAX_U24) {
      throw new NetlistError(`Gate ${i} references signal out of u24 range (${gate.a}, ${gate.b})`);
    }

    if (gate.a >= currentSignal || gate.b >= currentSignal) {
      throw new NetlistError(
        `NAND: future signal (gate ${i} at signal ${currentSignal} references ${gate.a}, ${gate.b})`,
      );
    }
  }

  if (netlist.nOut > 0 && netlist.gates.length < netlist.nOut) {
    throw new NetlistError(
      `Netlist has ${netlist.gates.length} gates but requires ${netlist.nOut} outputs`,
    );
  }
}

/**
 * Encodes a Netlist into binary TapeOut format (7 bytes per NAND gate, big-endian u24).
 */
export function encodeNetlist(netlist: Netlist): Uint8Array {
  validateNetlist(netlist);

  const bytes = new Uint8Array(netlist.gates.length * 7);
  for (let i = 0; i < netlist.gates.length; i++) {
    const gate = netlist.gates[i];
    if (!gate) continue;
    const offset = i * 7;
    // Opcode 0x00 for NAND
    bytes[offset] = 0x00;
    // Big-endian u24 for a
    bytes[offset + 1] = (gate.a >> 16) & 0xff;
    bytes[offset + 2] = (gate.a >> 8) & 0xff;
    bytes[offset + 3] = gate.a & 0xff;
    // Big-endian u24 for b
    bytes[offset + 4] = (gate.b >> 16) & 0xff;
    bytes[offset + 5] = (gate.b >> 8) & 0xff;
    bytes[offset + 6] = gate.b & 0xff;
  }

  return bytes;
}

/**
 * Decodes TapeOut netlist bytes into a Netlist object.
 */
export function decodeNetlist(bytes: Uint8Array, nIn: number, nOut: number): Netlist {
  if (bytes.length % 7 !== 0) {
    throw new NetlistError(`Invalid bytes length: ${bytes.length} is not a multiple of 7`);
  }

  const gateCount = bytes.length / 7;
  const gates: Gate[] = [];

  for (let i = 0; i < gateCount; i++) {
    const offset = i * 7;
    const opcode = bytes[offset];
    if (opcode !== 0x00) {
      throw new NetlistError(`Unsupported opcode at gate ${i}: 0x${opcode?.toString(16)}`);
    }

    const b1 = bytes[offset + 1] ?? 0;
    const b2 = bytes[offset + 2] ?? 0;
    const b3 = bytes[offset + 3] ?? 0;
    const a = (b1 << 16) | (b2 << 8) | b3;

    const b4 = bytes[offset + 4] ?? 0;
    const b5 = bytes[offset + 5] ?? 0;
    const b6 = bytes[offset + 6] ?? 0;
    const b = (b4 << 16) | (b5 << 8) | b6;

    gates.push({ type: 'NAND', a, b });
  }

  const netlist: Netlist = { nIn, nOut, gates };
  validateNetlist(netlist);
  return netlist;
}
