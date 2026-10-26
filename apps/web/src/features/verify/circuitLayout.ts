/**
 * apps/web/src/features/verify/circuitLayout.ts
 * Computes a layered topological layout and signal propagation for the Mandate V1 circuit.
 */

import { mandateV1Netlist, toGraph, type CircuitGraph } from '@seiyaku/circuit-tools';

export interface LayoutNode {
  id: string;
  label: string;
  type: 'input' | 'gate' | 'output';
  signal: number;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  value: boolean;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  pathD: string;
  active: boolean;
}

export interface DiagramLayoutResult {
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  signalMap: Map<number, boolean>;
  formulaText: string;
}

const MANDATE_V1_RULE_LABELS: readonly string[] = [
  'sane (Bit 0)',
  'tokenAllowed (Bit 1)',
  'notExpired (Bit 2)',
  'notFrozen (Bit 3)',
  'sizeOk (Bit 4)',
  'dailyOk (Bit 5)',
  'tradesOk (Bit 6)',
  'cooldownOk (Bit 7)',
  'isExit (Bit 8)',
];

/**
 * Computes topological depths for all signals in the netlist.
 */
export function computeSignalDepths(
  nIn: number,
  gates: readonly { a: number; b: number }[],
): Map<number, number> {
  const depths = new Map<number, number>();

  // Constant 0 and 1
  depths.set(0, 0);
  depths.set(1, 0);

  // Inputs: signals 2 to (2 + nIn - 1)
  for (let i = 0; i < nIn; i++) {
    depths.set(2 + i, 0);
  }

  // Gates: base signal = 2 + nIn
  const baseGate = 2 + nIn;
  for (let i = 0; i < gates.length; i++) {
    const gate = gates[i];
    if (!gate) continue;
    const signal = baseGate + i;
    const depthA = depths.get(gate.a) ?? 0;
    const depthB = depths.get(gate.b) ?? 0;
    depths.set(signal, 1 + Math.max(depthA, depthB));
  }

  return depths;
}

/**
 * Evaluates signal values for all signals given the 9 boolean inputs.
 */
export function evaluateSignals(
  inputValues: readonly boolean[],
  nIn: number,
  gates: readonly { a: number; b: number }[],
): Map<number, boolean> {
  const signals = new Map<number, boolean>();

  // Constants
  signals.set(0, false);
  signals.set(1, true);

  // Inputs
  for (let i = 0; i < nIn; i++) {
    signals.set(2 + i, Boolean(inputValues[i]));
  }

  // Gates (NAND logic: !(a && b))
  const baseGate = 2 + nIn;
  for (let i = 0; i < gates.length; i++) {
    const gate = gates[i];
    if (!gate) continue;
    const sig = baseGate + i;
    const valA = signals.get(gate.a) ?? false;
    const valB = signals.get(gate.b) ?? false;
    signals.set(sig, !(valA && valB));
  }

  return signals;
}

/**
 * Generates the layered SVG layout for MANDATE_V1.
 */
export function computeCircuitLayout(inputValues: readonly boolean[]): DiagramLayoutResult {
  const netlist = mandateV1Netlist();
  const graph: CircuitGraph = toGraph(netlist);
  const depths = computeSignalDepths(netlist.nIn, netlist.gates);
  const signalMap = evaluateSignals(inputValues, netlist.nIn, netlist.gates);

  // Find max gate depth
  let maxGateDepth = 0;
  for (const d of depths.values()) {
    if (d > maxGateDepth) maxGateDepth = d;
  }
  const outputLayer = maxGateDepth + 1;

  // Group nodes by layer
  const layerMap = new Map<number, LayoutNode[]>();

  const nodeMap = new Map<string, LayoutNode>();
  const NODE_H = 36;
  const LAYER_X_STEP = 150;
  const PADDING_X = 70;
  const PADDING_Y = 40;
  const Y_STEP = 52;

  // 1. Inputs
  const inputNodes: LayoutNode[] = [];
  for (let i = 0; i < netlist.nIn; i++) {
    const signal = 2 + i;
    const val = signalMap.get(signal) ?? false;
    const label = MANDATE_V1_RULE_LABELS[i] ?? `in_${i}`;
    const n: LayoutNode = {
      id: `sig_${signal}`,
      label,
      type: 'input',
      signal,
      x: PADDING_X,
      y: 0, // Assigned later
      width: 130,
      height: NODE_H,
      layer: 0,
      value: val,
    };
    inputNodes.push(n);
    nodeMap.set(n.id, n);
  }
  layerMap.set(0, inputNodes);

  // 2. Gates
  const baseGate = 2 + netlist.nIn;
  for (let i = 0; i < netlist.gates.length; i++) {
    const signal = baseGate + i;
    const depth = depths.get(signal) ?? 1;
    const val = signalMap.get(signal) ?? false;
    const n: LayoutNode = {
      id: `sig_${signal}`,
      label: `NAND_${i}`,
      type: 'gate',
      signal,
      x: PADDING_X + depth * LAYER_X_STEP,
      y: 0,
      width: 80,
      height: NODE_H,
      layer: depth,
      value: val,
    };
    const layerNodes = layerMap.get(depth) ?? [];
    layerNodes.push(n);
    layerMap.set(depth, layerNodes);
    nodeMap.set(n.id, n);
  }

  // 3. Output
  const outputSignal = baseGate + netlist.gates.length - 1;
  const outVal = signalMap.get(outputSignal) ?? false;
  const outNode: LayoutNode = {
    id: 'out_0',
    label: outVal ? 'ALLOW (1)' : 'BLOCK (0)',
    type: 'output',
    signal: outputSignal,
    x: PADDING_X + outputLayer * LAYER_X_STEP + 20,
    y: 0,
    width: 100,
    height: NODE_H + 4,
    layer: outputLayer,
    value: outVal,
  };
  layerMap.set(outputLayer, [outNode]);
  nodeMap.set(outNode.id, outNode);

  // Compute maximum nodes in any single layer to dimension height
  let maxNodesInLayer = 0;
  for (const list of layerMap.values()) {
    if (list.length > maxNodesInLayer) maxNodesInLayer = list.length;
  }
  const totalHeight = Math.max(540, maxNodesInLayer * Y_STEP + PADDING_Y * 2);

  // Assign Y positions centered in each layer
  for (const list of layerMap.values()) {
    const count = list.length;
    const layerHeight = count * Y_STEP;
    const startY = (totalHeight - layerHeight) / 2 + Y_STEP / 2;

    for (let j = 0; j < count; j++) {
      const node = list[j];
      if (node) {
        node.y = startY + j * Y_STEP;
      }
    }
  }

  // 4. Edges
  const edges: LayoutEdge[] = [];
  for (const e of graph.edges) {
    const srcNode = nodeMap.get(e.source);
    const tgtNode = nodeMap.get(e.target);
    if (!srcNode || !tgtNode) continue;

    const x1 = srcNode.x + srcNode.width / 2;
    const y1 = srcNode.y;
    const x2 = tgtNode.x - tgtNode.width / 2;
    const y2 = tgtNode.y;

    const dx = Math.max(30, (x2 - x1) / 2);
    const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    const active = srcNode.value;

    edges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      pathD,
      active,
    });
  }

  const totalWidth = PADDING_X + outputLayer * LAYER_X_STEP + 160;

  return {
    width: totalWidth,
    height: totalHeight,
    nodes: Array.from(nodeMap.values()),
    edges,
    signalMap,
    formulaText:
      'allow = sane AND ( isExit OR ( tokenAllowed AND notExpired AND notFrozen AND sizeOk AND dailyOk AND tradesOk AND cooldownOk ) )',
  };
}
