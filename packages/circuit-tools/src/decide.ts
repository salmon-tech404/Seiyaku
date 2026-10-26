import { mandateV1Netlist } from './mandateV1.js';
import { evaluate } from './simulate.js';
import type { Netlist } from './netlist.js';

let cachedNetlist: Netlist | null = null;

function getCachedMandateNetlist(): Netlist {
  if (!cachedNetlist) {
    cachedNetlist = mandateV1Netlist();
  }
  return cachedNetlist;
}

/**
 * Decides whether the input bits result in allow (true) or block (false)
 * by evaluating the compiled MANDATE_V1 NAND netlist simulator.
 */
export function decide(bits: number): boolean {
  const netlist = getCachedMandateNetlist();
  const outBit = evaluate(netlist, BigInt(bits));
  return outBit === 1n;
}
