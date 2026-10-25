import { type Netlist } from './netlist.js';
import { type Expr } from './builder.js';
import { evaluate, evalExpr } from './simulate.js';

export interface VerificationResult {
  readonly checked: number;
  readonly passed: boolean;
  readonly failedInput?: bigint;
  readonly simOutput?: bigint;
  readonly refOutput?: bigint;
}

export interface TruthTableRow {
  readonly inputBits: bigint;
  readonly outputBits: bigint;
}

/**
 * Exhaustively checks that a Netlist simulation matches the reference Expr
 * for all 2^nIn inputs (up to 16 inputs).
 */
export function verifyExhaustive(netlist: Netlist, expr: Expr): VerificationResult {
  if (netlist.nIn > 16) {
    throw new Error(`Exhaustive verification supports up to 16 inputs, got ${netlist.nIn}`);
  }

  const total = 1 << netlist.nIn;
  for (let i = 0; i < total; i++) {
    const inputBits = BigInt(i);
    const sim = evaluate(netlist, inputBits);
    const ref = evalExpr(expr, inputBits) ? 1n : 0n;

    if (sim !== ref) {
      return {
        checked: i,
        passed: false,
        failedInput: inputBits,
        simOutput: sim,
        refOutput: ref,
      };
    }
  }

  return {
    checked: total,
    passed: true,
  };
}

/**
 * Generates the complete truth table for a Netlist.
 */
export function truthTable(netlist: Netlist): TruthTableRow[] {
  if (netlist.nIn > 16) {
    throw new Error(`Truth table generation supports up to 16 inputs, got ${netlist.nIn}`);
  }

  const total = 1 << netlist.nIn;
  const rows: TruthTableRow[] = new Array(total);

  for (let i = 0; i < total; i++) {
    const inputBits = BigInt(i);
    const outputBits = evaluate(netlist, inputBits);
    rows[i] = { inputBits, outputBits };
  }

  return rows;
}
