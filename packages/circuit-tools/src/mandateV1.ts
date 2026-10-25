import { keccak256, toHex, type Hex } from 'viem';
import { and, or, input, type Expr, compileToNand } from './builder.js';
import { type Netlist, encodeNetlist } from './netlist.js';

export const MANDATE_V1_INPUTS = [
  'sane',
  'tokenAllowed',
  'notExpired',
  'notFrozen',
  'sizeOk',
  'dailyOk',
  'tradesOk',
  'cooldownOk',
  'isExit',
] as const;

export type MandateV1InputName = (typeof MANDATE_V1_INPUTS)[number];

/**
 * Constructs the reference AST expression for MANDATE_V1.
 * Formula: allow = sane AND ( isExit OR ( tokenAllowed AND notExpired AND notFrozen AND sizeOk AND dailyOk AND tradesOk AND cooldownOk ) )
 */
export function mandateV1Expression(): Expr {
  const sane = input(0);
  const tokenAllowed = input(1);
  const notExpired = input(2);
  const notFrozen = input(3);
  const sizeOk = input(4);
  const dailyOk = input(5);
  const tradesOk = input(6);
  const cooldownOk = input(7);
  const isExit = input(8);

  const buyAllowed = and(
    tokenAllowed,
    notExpired,
    notFrozen,
    sizeOk,
    dailyOk,
    tradesOk,
    cooldownOk,
  );

  return and(sane, or(isExit, buyAllowed));
}

/**
 * Compiles the MANDATE_V1 rule into a 9-input, 1-output NAND Netlist.
 */
export function mandateV1Netlist(): Netlist {
  const expr = mandateV1Expression();
  return compileToNand(expr, 9);
}

const compiledNetlist = mandateV1Netlist();
const encodedBytes = encodeNetlist(compiledNetlist);

export const MANDATE_V1_GATE_COUNT: number = compiledNetlist.gates.length;
export const MANDATE_V1_BYTES: Uint8Array = encodedBytes;
export const MANDATE_V1_HEX: Hex = toHex(encodedBytes);
export const MANDATE_V1_NETLIST_HASH: Hex = keccak256(encodedBytes);
