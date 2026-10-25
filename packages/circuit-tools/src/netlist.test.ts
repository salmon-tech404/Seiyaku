import { describe, expect, it } from 'vitest';
import {
  encodeNetlist,
  decodeNetlist,
  validateNetlist,
  NetlistError,
  type Netlist,
} from './netlist.js';

describe('netlist encoding and decoding', () => {
  it('round-trips a valid netlist', () => {
    const netlist: Netlist = {
      nIn: 2,
      nOut: 1,
      gates: [
        { type: 'NAND', a: 2, b: 3 }, // Gate 0, sig 4
        { type: 'NAND', a: 4, b: 4 }, // Gate 1, sig 5
      ],
    };

    const encoded = encodeNetlist(netlist);
    expect(encoded.length).toBe(14); // 2 gates * 7 bytes

    const decoded = decodeNetlist(encoded, 2, 1);
    expect(decoded.nIn).toBe(2);
    expect(decoded.nOut).toBe(1);
    expect(decoded.gates).toEqual(netlist.gates);
  });

  it('rejects forward reference (future signal)', () => {
    const badNetlist: Netlist = {
      nIn: 2,
      nOut: 1,
      gates: [
        { type: 'NAND', a: 2, b: 5 }, // signal 5 does not exist yet (base is 4, gate 0 is sig 4)
      ],
    };

    expect(() => validateNetlist(badNetlist)).toThrow(NetlistError);
    expect(() => encodeNetlist(badNetlist)).toThrow(/future signal/);
  });

  it('rejects self reference', () => {
    const badNetlist: Netlist = {
      nIn: 2,
      nOut: 1,
      gates: [
        { type: 'NAND', a: 2, b: 4 }, // gate 0 output IS signal 4, cannot reference itself
      ],
    };

    expect(() => validateNetlist(badNetlist)).toThrow(/future signal/);
  });

  it('rejects invalid byte lengths on decode', () => {
    const badBytes = new Uint8Array([0x00, 0x01, 0x02]);
    expect(() => decodeNetlist(badBytes, 1, 1)).toThrow(/multiple of 7/);
  });
});
