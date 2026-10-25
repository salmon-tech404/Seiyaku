import { type Netlist } from './netlist.js';
import { type Expr } from './builder.js';

/**
 * Evaluates a Netlist against inputBits using the packing rule "bit 0 = first input".
 * Returns outputBits packed with bit 0 = first output.
 */
export function evaluate(netlist: Netlist, inputBits: bigint): bigint {
  const totalSignals = 2 + netlist.nIn + netlist.gates.length;
  // Signals: false = 0, true = 1
  const signals = new Uint8Array(totalSignals);

  // Constant signals
  signals[0] = 0;
  signals[1] = 1;

  // Input signals: pin i is signal 2 + i, driven by bit i
  for (let i = 0; i < netlist.nIn; i++) {
    const bit = (inputBits >> BigInt(i)) & 1n;
    signals[2 + i] = Number(bit);
  }

  // Gates: NAND evaluation
  const baseGateSignal = 2 + netlist.nIn;
  for (let i = 0; i < netlist.gates.length; i++) {
    const gate = netlist.gates[i];
    if (!gate) continue;
    const aVal = signals[gate.a] ?? 0;
    const bVal = signals[gate.b] ?? 0;
    // NAND: 0 if both are 1, else 1
    signals[baseGateSignal + i] = aVal === 1 && bVal === 1 ? 0 : 1;
  }

  // Outputs: the last nOut signals are circuit outputs
  let outputBits = 0n;
  const startOutSignal = totalSignals - netlist.nOut;
  for (let j = 0; j < netlist.nOut; j++) {
    const outVal = signals[startOutSignal + j] ?? 0;
    if (outVal === 1) {
      outputBits |= 1n << BigInt(j);
    }
  }

  return outputBits;
}

/**
 * Independent reference evaluator of an Expr tree directly (not through NAND).
 */
export function evalExpr(expr: Expr, inputBits: bigint): boolean {
  switch (expr.kind) {
    case 'const':
      return expr.value;
    case 'input': {
      const bit = (inputBits >> BigInt(expr.index)) & 1n;
      return bit === 1n;
    }
    case 'not':
      return !evalExpr(expr.expr, inputBits);
    case 'and':
      return expr.exprs.every((e) => evalExpr(e, inputBits));
    case 'or':
      return expr.exprs.some((e) => evalExpr(e, inputBits));
  }
}
