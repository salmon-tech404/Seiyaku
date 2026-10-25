import { describe, expect, it } from 'vitest';
import { input, constVal, not, and, or, compileToNand, type Expr } from './builder.js';
import { evaluate, evalExpr } from './simulate.js';
import { encodeNetlist, type Netlist } from './netlist.js';

// Linear congruential generator for reproducible seeded random property tests
function makePrng(seed: number) {
  let s = seed;
  return function next(): number {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function generateRandomExpr(depth: number, nIn: number, prng: () => number): Expr {
  if (depth <= 0) {
    if (prng() < 0.2) {
      return constVal(prng() < 0.5);
    }
    const idx = Math.floor(prng() * nIn);
    return input(idx);
  }

  const r = prng();
  if (r < 0.3) {
    return not(generateRandomExpr(depth - 1, nIn, prng));
  } else if (r < 0.65) {
    return and(generateRandomExpr(depth - 1, nIn, prng), generateRandomExpr(depth - 1, nIn, prng));
  } else {
    return or(generateRandomExpr(depth - 1, nIn, prng), generateRandomExpr(depth - 1, nIn, prng));
  }
}

describe('builder and compiler', () => {
  it('correctly compiles NOT truth table', () => {
    const expr = not(input(0));
    const netlist = compileToNand(expr, 1);
    expect(evaluate(netlist, 0n)).toBe(1n);
    expect(evaluate(netlist, 1n)).toBe(0n);
  });

  it('correctly compiles AND truth table', () => {
    const expr = and(input(0), input(1));
    const netlist = compileToNand(expr, 2);
    expect(evaluate(netlist, 0b00n)).toBe(0n);
    expect(evaluate(netlist, 0b01n)).toBe(0n);
    expect(evaluate(netlist, 0b10n)).toBe(0n);
    expect(evaluate(netlist, 0b11n)).toBe(1n);
  });

  it('correctly compiles OR truth table', () => {
    const expr = or(input(0), input(1));
    const netlist = compileToNand(expr, 2);
    expect(evaluate(netlist, 0b00n)).toBe(0n);
    expect(evaluate(netlist, 0b01n)).toBe(1n);
    expect(evaluate(netlist, 0b10n)).toBe(1n);
    expect(evaluate(netlist, 0b11n)).toBe(1n);
  });

  it('proves sub-expression sharing reduces gate count', () => {
    // Repeated identical sub-expression: (in0 AND in1) OR (in0 AND in1)
    const sub = and(input(0), input(1));
    const expr = or(sub, sub);
    const netlist = compileToNand(expr, 2);

    // sub emits: Gate 0 = NAND(2,3), Gate 1 = NOT(Gate 0) = NAND(4,4)
    // When sub is compiled again, it hits cache!
    // Then OR(sub, sub): emitOr(sig, sig) = NAND(NOT sig, NOT sig)
    // Total gates should be minimal, not 2x duplicate
    expect(netlist.gates.length).toBeLessThan(7);
  });

  it('evaluates hand-built 12-NAND MAJ3 circuit', () => {
    // 3 inputs: in0 = 2, in1 = 3, in2 = 4
    const maj3Netlist: Netlist = {
      nIn: 3,
      nOut: 1,
      gates: [
        { type: 'NAND', a: 2, b: 3 }, // 5: NOT(in0 & in1)
        { type: 'NAND', a: 5, b: 5 }, // 6: in0 & in1
        { type: 'NAND', a: 3, b: 4 }, // 7: NOT(in1 & in2)
        { type: 'NAND', a: 7, b: 7 }, // 8: in1 & in2
        { type: 'NAND', a: 2, b: 4 }, // 9: NOT(in0 & in2)
        { type: 'NAND', a: 9, b: 9 }, // 10: in0 & in2
        { type: 'NAND', a: 6, b: 6 }, // 11: NOT(in0 & in1)
        { type: 'NAND', a: 8, b: 8 }, // 12: NOT(in1 & in2)
        { type: 'NAND', a: 11, b: 12 }, // 13: (in0 & in1) | (in1 & in2)
        { type: 'NAND', a: 13, b: 13 }, // 14: NOT((in0 & in1) | (in1 & in2))
        { type: 'NAND', a: 10, b: 10 }, // 15: NOT(in0 & in2)
        { type: 'NAND', a: 14, b: 15 }, // 16: MAJ3 output!
      ],
    };

    expect(maj3Netlist.gates.length).toBe(12);
    const bytes = encodeNetlist(maj3Netlist);
    expect(bytes.length).toBe(84); // 12 * 7 bytes

    // Check all 8 input combinations against reference boolean function
    for (let i = 0; i < 8; i++) {
      const b0 = (i & 1) !== 0;
      const b1 = (i & 2) !== 0;
      const b2 = (i & 4) !== 0;
      const expected = (b0 && b1) || (b1 && b2) || (b0 && b2);
      const actual = evaluate(maj3Netlist, BigInt(i)) === 1n;
      expect(actual).toBe(expected);
    }
  });

  it('passes property test for random expressions against reference evaluator', () => {
    const prng = makePrng(42);
    const nIn = 4;

    for (let testCase = 0; testCase < 20; testCase++) {
      const expr = generateRandomExpr(4, nIn, prng);
      const netlist = compileToNand(expr, nIn);

      // Test all 2^4 = 16 inputs
      for (let inputVal = 0; inputVal < 16; inputVal++) {
        const inputBits = BigInt(inputVal);
        const sim = evaluate(netlist, inputBits);
        const ref = evalExpr(expr, inputBits) ? 1n : 0n;
        expect(sim).toBe(ref);
      }
    }
  });
});
