import { type Gate, type Netlist, validateNetlist } from './netlist.js';

export type Expr =
  | { readonly kind: 'const'; readonly value: boolean }
  | { readonly kind: 'input'; readonly index: number }
  | { readonly kind: 'not'; readonly expr: Expr }
  | { readonly kind: 'and'; readonly exprs: readonly Expr[] }
  | { readonly kind: 'or'; readonly exprs: readonly Expr[] };

export const input = (index: number): Expr => ({ kind: 'input', index });
export const constVal = (value: boolean): Expr => ({ kind: 'const', value });
export const not = (expr: Expr): Expr => ({ kind: 'not', expr });
export const and = (...exprs: Expr[]): Expr => ({ kind: 'and', exprs });
export const or = (...exprs: Expr[]): Expr => ({ kind: 'or', exprs });

/**
 * Compiles a Boolean expression into a NAND Netlist.
 * Applies constant folding and gate-level sub-expression sharing.
 */
export function compileToNand(rootExpr: Expr, nIn: number): Netlist {
  if (nIn < 0 || !Number.isInteger(nIn)) {
    throw new Error(`Invalid nIn: ${nIn}`);
  }

  const gates: Gate[] = [];
  const gateMap = new Map<string, number>();

  function emitNand(a: number, b: number): number {
    // Constant folding for NAND:
    // NAND(0, x) = 1
    if (a === 0 || b === 0) {
      return 1;
    }
    // NAND(1, 1) = 0
    if (a === 1 && b === 1) {
      return 0;
    }
    // Normalize commutative inputs (smaller signal first)
    const [normA, normB] = a <= b ? [a, b] : [b, a];
    const key = `${normA},${normB}`;

    const existing = gateMap.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const newSignal = 2 + nIn + gates.length;
    gates.push({ type: 'NAND', a: normA, b: normB });
    gateMap.set(key, newSignal);
    return newSignal;
  }

  function emitNot(sig: number): number {
    if (sig === 0) return 1;
    if (sig === 1) return 0;
    return emitNand(sig, sig);
  }

  function emitAnd(sigA: number, sigB: number): number {
    if (sigA === 0 || sigB === 0) return 0;
    if (sigA === 1) return sigB;
    if (sigB === 1) return sigA;
    const nandSig = emitNand(sigA, sigB);
    return emitNot(nandSig);
  }

  function emitOr(sigA: number, sigB: number): number {
    if (sigA === 1 || sigB === 1) return 1;
    if (sigA === 0) return sigB;
    if (sigB === 0) return sigA;
    // OR(a, b) = NAND(NOT a, NOT b)
    return emitNand(emitNot(sigA), emitNot(sigB));
  }

  function compile(expr: Expr): number {
    switch (expr.kind) {
      case 'const':
        return expr.value ? 1 : 0;
      case 'input': {
        if (expr.index < 0 || expr.index >= nIn || !Number.isInteger(expr.index)) {
          throw new Error(`Input index ${expr.index} out of range [0, ${nIn - 1}]`);
        }
        return 2 + expr.index;
      }
      case 'not': {
        const s = compile(expr.expr);
        return emitNot(s);
      }
      case 'and': {
        const first = expr.exprs[0];
        if (!first) return 1; // Empty AND is true
        let current = compile(first);
        for (let i = 1; i < expr.exprs.length; i++) {
          const next = expr.exprs[i];
          if (!next) continue;
          current = emitAnd(current, compile(next));
        }
        return current;
      }
      case 'or': {
        const first = expr.exprs[0];
        if (!first) return 0; // Empty OR is false
        let current = compile(first);
        for (let i = 1; i < expr.exprs.length; i++) {
          const next = expr.exprs[i];
          if (!next) continue;
          current = emitOr(current, compile(next));
        }
        return current;
      }
    }
  }

  const finalSignal = compile(rootExpr);

  // The last gate output must be the circuit output signal.
  // If no gates were emitted or finalSignal is not the last emitted gate,
  // directly append two NAND buffer gates so the output pin is physically driven.
  const lastSignal = 2 + nIn + gates.length - 1;
  if (gates.length === 0 || finalSignal !== lastSignal) {
    const notSig = 2 + nIn + gates.length;
    gates.push({ type: 'NAND', a: finalSignal, b: finalSignal });
    gates.push({ type: 'NAND', a: notSig, b: notSig });
  }

  const netlist: Netlist = {
    nIn,
    nOut: 1,
    gates,
  };

  validateNetlist(netlist);
  return netlist;
}
