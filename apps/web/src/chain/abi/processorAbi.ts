export const processorAbi = [
  {
    type: 'function',
    name: 'eval',
    inputs: [
      {
        name: 'id',
        type: 'uint256',
      },
      {
        name: 'inputs',
        type: 'bytes',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bytes',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'netlist',
    inputs: [
      {
        name: 'id',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bytes',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'circuitCount',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'TAPEOUT_FEE',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
] as const;
