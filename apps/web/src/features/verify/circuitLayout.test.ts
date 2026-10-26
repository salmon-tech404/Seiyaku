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
});
