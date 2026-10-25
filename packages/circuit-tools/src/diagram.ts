import { type Netlist } from './netlist.js';

export interface DiagramNode {
  readonly id: string;
  readonly label: string;
  readonly type: 'input' | 'gate' | 'output';
  readonly signal: number;
}

export interface DiagramEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly pin?: 'a' | 'b';
}

export interface CircuitGraph {
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

/**
 * Transforms a Netlist into a plain serializable graph representation for diagrams.
 */
export function toGraph(netlist: Netlist): CircuitGraph {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];

  // Input nodes
  for (let i = 0; i < netlist.nIn; i++) {
    const signal = 2 + i;
    nodes.push({
      id: `sig_${signal}`,
      label: `in_${i}`,
      type: 'input',
      signal,
    });
  }

  // Gate nodes and edges
  const baseGateSignal = 2 + netlist.nIn;
  for (let i = 0; i < netlist.gates.length; i++) {
    const gate = netlist.gates[i];
    if (!gate) continue;
    const signal = baseGateSignal + i;
    const gateId = `sig_${signal}`;

    nodes.push({
      id: gateId,
      label: `NAND_${i}`,
      type: 'gate',
      signal,
    });

    edges.push({
      id: `e_${gate.a}_${gateId}_a`,
      source: `sig_${gate.a}`,
      target: gateId,
      pin: 'a',
    });

    edges.push({
      id: `e_${gate.b}_${gateId}_b`,
      source: `sig_${gate.b}`,
      target: gateId,
      pin: 'b',
    });
  }

  // Output nodes
  const totalSignals = baseGateSignal + netlist.gates.length;
  const startOutSignal = totalSignals - netlist.nOut;
  for (let j = 0; j < netlist.nOut; j++) {
    const signal = startOutSignal + j;
    const outId = `out_${j}`;
    nodes.push({
      id: outId,
      label: `out_${j}`,
      type: 'output',
      signal,
    });

    edges.push({
      id: `e_sig_${signal}_${outId}`,
      source: `sig_${signal}`,
      target: outId,
    });
  }

  return { nodes, edges };
}
