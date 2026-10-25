import { describe, expect, it } from 'vitest';
import {
  mandateV1Expression,
  mandateV1Netlist,
  MANDATE_V1_GATE_COUNT,
  MANDATE_V1_HEX,
  MANDATE_V1_NETLIST_HASH,
  MANDATE_V1_INPUTS,
} from './mandateV1.js';
import { evaluate } from './simulate.js';
import { verifyExhaustive } from './verify.js';

// Hand-written reference function matching spec section 3
function referenceMandateV1(bits: number): boolean {
  const sane = (bits & (1 << 0)) !== 0;
  const tokenAllowed = (bits & (1 << 1)) !== 0;
  const notExpired = (bits & (1 << 2)) !== 0;
  const notFrozen = (bits & (1 << 3)) !== 0;
  const sizeOk = (bits & (1 << 4)) !== 0;
  const dailyOk = (bits & (1 << 5)) !== 0;
  const tradesOk = (bits & (1 << 6)) !== 0;
  const cooldownOk = (bits & (1 << 7)) !== 0;
  const isExit = (bits & (1 << 8)) !== 0;

  const buyAllowed =
    tokenAllowed && notExpired && notFrozen && sizeOk && dailyOk && tradesOk && cooldownOk;

  return sane && (isExit || buyAllowed);
}

describe('mandateV1 rule circuit', () => {
  it('has 9 input names matching spec table exactly', () => {
    expect(MANDATE_V1_INPUTS).toEqual([
      'sane',
      'tokenAllowed',
      'notExpired',
      'notFrozen',
      'sizeOk',
      'dailyOk',
      'tradesOk',
      'cooldownOk',
      'isExit',
    ]);
  });

  it('matches hand-written boolean logic for all 512 inputs', () => {
    const netlist = mandateV1Netlist();
    expect(netlist.nIn).toBe(9);
    expect(netlist.nOut).toBe(1);

    let allowedCount = 0;
    for (let i = 0; i < 512; i++) {
      const expected = referenceMandateV1(i);
      const actual = evaluate(netlist, BigInt(i)) === 1n;
      expect(actual).toBe(expected);
      if (actual) allowedCount++;
    }

    // Sanity check: some inputs allow, some block
    expect(allowedCount).toBeGreaterThan(0);
    expect(allowedCount).toBeLessThan(512);
  });

  it('passes verifyExhaustive for all 512 combinations', () => {
    const netlist = mandateV1Netlist();
    const expr = mandateV1Expression();
    const result = verifyExhaustive(netlist, expr);

    expect(result.passed).toBe(true);
    expect(result.checked).toBe(512);
  });

  it('exports consistent constants and keccak hash', () => {
    expect(MANDATE_V1_GATE_COUNT).toBeGreaterThan(0);
    expect(MANDATE_V1_HEX.startsWith('0x')).toBe(true);
    expect(MANDATE_V1_NETLIST_HASH.startsWith('0x')).toBe(true);
    expect(MANDATE_V1_NETLIST_HASH.length).toBe(66); // 32 bytes hex
  });
});
