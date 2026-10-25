import { describe, expect, it } from 'vitest';
import { mandateV1Netlist } from './mandateV1.js';
import { toGraph } from './diagram.js';

describe('diagram toGraph conversion', () => {
  it('converts MANDATE_V1 netlist to serializable graph', () => {
    const netlist = mandateV1Netlist();
    const graph = toGraph(netlist);

    expect(graph.nodes.length).toBe(netlist.nIn + netlist.gates.length + netlist.nOut);
    expect(graph.edges.length).toBe(netlist.gates.length * 2 + netlist.nOut);

    const inputNodes = graph.nodes.filter((n) => n.type === 'input');
    expect(inputNodes.length).toBe(9);

    const gateNodes = graph.nodes.filter((n) => n.type === 'gate');
    expect(gateNodes.length).toBe(netlist.gates.length);

    const outputNodes = graph.nodes.filter((n) => n.type === 'output');
    expect(outputNodes.length).toBe(1);
  });
});
