import {
  MANDATE_V1_INPUTS,
  MANDATE_V1_GATE_COUNT,
  MANDATE_V1_HEX,
  MANDATE_V1_NETLIST_HASH,
  mandateV1Netlist,
  truthTable,
} from '@seiyaku/circuit-tools';

console.log('=== MANDATE_V1 Circuit Specification ===');
console.log('Input Names (ordered by bit index 0..8):');
MANDATE_V1_INPUTS.forEach((name, i) => {
  console.log(`  Bit ${i}: ${name}`);
});

console.log(`\nNAND Gate Count: ${MANDATE_V1_GATE_COUNT}`);
console.log(`Netlist Hex Bytes (${MANDATE_V1_HEX.length / 2 - 1} bytes):`);
console.log(MANDATE_V1_HEX);
console.log(`\nKeccak256 Netlist Hash: ${MANDATE_V1_NETLIST_HASH}`);

const netlist = mandateV1Netlist();
const table = truthTable(netlist);
const allowedRows = table.filter((r) => r.outputBits === 1n);
const blockedRows = table.filter((r) => r.outputBits === 0n);

console.log(`\nTruth Table Summary (Total 512 combinations):`);
console.log(`  Allowed (output = 1): ${allowedRows.length}`);
console.log(`  Blocked (output = 0): ${blockedRows.length}`);
