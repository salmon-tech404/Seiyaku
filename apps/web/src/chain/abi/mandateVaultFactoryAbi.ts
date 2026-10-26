export const mandateVaultFactoryAbi = [
  {
    type: 'constructor',
    inputs: [
      {
        name: 'cfg',
        type: 'tuple',
        internalType: 'struct FactoryConfig',
        components: [
          {
            name: 'implementation',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'baseToken',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'swapRouter',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'processor',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'circuitId',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'netlistHash',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'loosenDelaySec',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'minWithdrawDelaySec',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'maxDepositBase',
            type: 'uint128',
            internalType: 'uint128',
          },
          {
            name: 'beacon',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'beaconImplementation',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'beaconImplementationCodehash',
            type: 'bytes32',
            internalType: 'bytes32',
          },
        ],
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'baseToken',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'beacon',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'beaconImplementation',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'beaconImplementationCodehash',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'circuitId',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'createVault',
    inputs: [
      {
        name: 'trader',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'limits',
        type: 'tuple',
        internalType: 'struct Limits',
        components: [
          {
            name: 'maxTradeBase',
            type: 'uint128',
            internalType: 'uint128',
          },
          {
            name: 'maxDailyBase',
            type: 'uint128',
            internalType: 'uint128',
          },
          {
            name: 'maxTradesPerDay',
            type: 'uint16',
            internalType: 'uint16',
          },
          {
            name: 'cooldownSec',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'expiresAt',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'withdrawDelaySec',
            type: 'uint32',
            internalType: 'uint32',
          },
        ],
      },
      {
        name: 'allowedTokens',
        type: 'address[]',
        internalType: 'address[]',
      },
    ],
    outputs: [
      {
        name: 'vault',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'implementation',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'loosenDelaySec',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxDepositBase',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint128',
        internalType: 'uint128',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'minWithdrawDelaySec',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'netlistHash',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'processor',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'swapRouter',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultsOf',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'address[]',
        internalType: 'address[]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'VaultCreated',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'vault',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'trader',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'CircuitChanged',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ERC1167FailedCreateClone',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidLimits',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroAddress',
    inputs: [],
  },
] as const;
