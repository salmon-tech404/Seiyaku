/* eslint-disable @typescript-eslint/no-non-null-assertion -- test file: indexes are asserted just above each use */
import { describe, it, expect } from 'vitest';
import { computeSignalDepths, evaluateSignals, computeCircuitLayout } from './circuitLayout.js';
import { mandateV1Netlist } from '@seiyaku/circuit-tools';

describe('circuitLayout', () => {
  const netlist = mandateV1Netlist();

  it('computes topological depths with strictly positive depths for gates', () => {
    const depths = computeSignalDepths(netlist.nIn, netlist.gates);
    expect(depths.get(0)).toBe(0);
    expect(depths.get(1)).toBe(0);

    // Inputs 2..10 must have depth 0
    for (let i = 0; i < netlist.nIn; i++) {
      expect(depths.get(2 + i)).toBe(0);
    }

    // Every gate must have depth >= 1 and greater than its input depths
    const baseGate = 2 + netlist.nIn;
    for (let i = 0; i < netlist.gates.length; i++) {
      const gate = netlist.gates[i]!;
      const sig = baseGate + i;
      const d = depths.get(sig)!;
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeGreaterThan(depths.get(gate.a)!);
      expect(d).toBeGreaterThan(depths.get(gate.b)!);
    }
  });

  it('evaluates signals correctly for all-1 inputs vs sane=0', () => {
    // 1. All true (sane=1, allowlist=1, ... isExit=0): should evaluate to 1 (allowed buy)
    const allTrueBuy = [true, true, true, true, true, true, true, true, false];
    const sigs1 = evaluateSignals(allTrueBuy, netlist.nIn, netlist.gates);
    const outSig = 2 + netlist.nIn + netlist.gates.length - 1;
    expect(sigs1.get(outSig)).toBe(true);

    // 2. sane=false: must evaluate to 0 (blocked)
    const insane = [false, true, true, true, true, true, true, true, true];
    const sigs2 = evaluateSignals(insane, netlist.nIn, netlist.gates);
    expect(sigs2.get(outSig)).toBe(false);
  });

  it('generates a valid, non-overlapping SVG layout with valid edge paths', () => {
    const inputValues = [true, true, true, true, true, true, true, true, false];
    const layout = computeCircuitLayout(inputValues);

    expect(layout.width).toBeGreaterThan(600);
    expect(layout.height).toBeGreaterThan(400);
    expect(layout.nodes.length).toBe(9 + 17 + 1); // 9 inputs + 17 gates + 1 output

    // Verify all edges connect valid nodes
    const nodeIds = new Set(layout.nodes.map((n) => n.id));
    for (const edge of layout.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
      expect(edge.pathD).toMatch(/^M [\d.]+ [\d.]+ C/);
    }

    // Verify no two nodes in the same layer overlap in Y
    const layerMap = new Map<number, typeof layout.nodes>();
    for (const node of layout.nodes) {
      if (!layerMap.has(node.layer)) layerMap.set(node.layer, []);
      layerMap.get(node.layer)!.push(node);
    }

    for (const nodesInLayer of layerMap.values()) {
      nodesInLayer.sort((a, b) => a.y - b.y);
      for (let i = 1; i < nodesInLayer.length; i++) {
        const prev = nodesInLayer[i - 1]!;
        const curr = nodesInLayer[i]!;
        expect(curr.y - prev.y).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('layers gates tightly placing isExit inverter (NAND_12) in layer 13 alongside NAND_13', () => {
    const inputValues = [true, true, true, true, true, true, true, true, false];
    const layout = computeCircuitLayout(inputValues);

    const nand12 = layout.nodes.find((n) => n.label === 'NAND_12');
    const nand13 = layout.nodes.find((n) => n.label === 'NAND_13');
    const nand14 = layout.nodes.find((n) => n.label === 'NAND_14');

    expect(nand12).toBeDefined();
    expect(nand13).toBeDefined();
    expect(nand14).toBeDefined();

    // NAND_12 and NAND_13 should both be at layer 13 right before NAND_14 (layer 14)
    expect(nand12!.layer).toBe(13);
    expect(nand13!.layer).toBe(13);
    expect(nand14!.layer).toBe(14);

    // In layer 13, their X positions should be equal and Y positions non-overlapping
    expect(nand12!.x).toBe(nand13!.x);
    expect(Math.abs(nand12!.y - nand13!.y)).toBeGreaterThanOrEqual(30);
  });

  it('routes multi-layer and adjacent edges with clean cubic bezier paths and pin offsets', () => {
    const inputValues = [true, true, true, true, true, true, true, true, false];
    const layout = computeCircuitLayout(inputValues);

    // Gates have 2 inputs: pin a (top) and pin b (bottom)
    const gate11Edges = layout.edges.filter((e) => e.target === 'sig_11');
    expect(gate11Edges.length).toBe(2);

    const edgeA = gate11Edges.find((e) => e.id.endsWith('_a'));
    const edgeB = gate11Edges.find((e) => e.id.endsWith('_b'));
    expect(edgeA).toBeDefined();
    expect(edgeB).toBeDefined();

    // Edge A should target a lower Y (top pin) than Edge B (bottom pin)
    const matchA = edgeA!.pathD.match(/C [\d.]+ [\d.]+, [\d.]+ [\d.]+, ([\d.]+) ([\d.]+)$/);
    const matchB = edgeB!.pathD.match(/C [\d.]+ [\d.]+, [\d.]+ [\d.]+, ([\d.]+) ([\d.]+)$/);
    expect(matchA).not.toBeNull();
    expect(matchB).not.toBeNull();

    const yA = parseFloat(matchA![2]!);
    const yB = parseFloat(matchB![2]!);
    expect(yA).toBeLessThan(yB);
  });

  it('computes layout dimensions dynamically from node bounding box', () => {
    const inputValues = [true, true, true, true, true, true, true, true, false];
    const layout = computeCircuitLayout(inputValues);

    const rightmostNode = Math.max(...layout.nodes.map((n) => n.x + n.width / 2));
    const bottommostNode = Math.max(...layout.nodes.map((n) => n.y + n.height / 2));

    expect(layout.width).toBeGreaterThanOrEqual(rightmostNode);
    expect(layout.height).toBeGreaterThanOrEqual(bottommostNode);
  });

  it('guarantees zero bounding box overlap between any pair of nodes', () => {
    const inputValues = [true, true, true, true, true, true, true, true, false];
    const layout = computeCircuitLayout(inputValues);

    for (let i = 0; i < layout.nodes.length; i++) {
      const a = layout.nodes[i]!;
      const aLeft = a.x - a.width / 2;
      const aRight = a.x + a.width / 2;
      const aTop = a.y - a.height / 2;
      const aBottom = a.y + a.height / 2;

      for (let j = i + 1; j < layout.nodes.length; j++) {
        const b = layout.nodes[j]!;
        const bLeft = b.x - b.width / 2;
        const bRight = b.x + b.width / 2;
        const bTop = b.y - b.height / 2;
        const bBottom = b.y + b.height / 2;

        const overlapsX = aLeft < bRight && aRight > bLeft;
        const overlapsY = aTop < bBottom && aBottom > bTop;
        const overlaps = overlapsX && overlapsY;

        expect(overlaps).toBe(false);
      }
    }
  });

  it('generates completely deterministic output across repeated executions', () => {
    const inputValues = [true, false, true, true, false, true, false, true, false];
    const layout1 = computeCircuitLayout(inputValues);
    const layout2 = computeCircuitLayout(inputValues);

    expect(layout1.width).toBe(layout2.width);
    expect(layout1.height).toBe(layout2.height);
    expect(layout1.nodes.length).toBe(layout2.nodes.length);
    expect(layout1.edges.length).toBe(layout2.edges.length);

    for (let i = 0; i < layout1.nodes.length; i++) {
      expect(layout1.nodes[i]!.x).toBe(layout2.nodes[i]!.x);
      expect(layout1.nodes[i]!.y).toBe(layout2.nodes[i]!.y);
      expect(layout1.nodes[i]!.value).toBe(layout2.nodes[i]!.value);
    }
  });
});
