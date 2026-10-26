export const mandateVaultAbi = [
  {
    type: 'constructor',
    inputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowedTokens',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
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
    name: 'buyVolumeTodayBase',
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
    name: 'cancelLoosen',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'cancelWithdraw',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
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
    name: 'dayIndex',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint64',
        internalType: 'uint64',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'executeLoosen',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'executeWithdraw',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'freeze',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'frozen',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'initialize',
    inputs: [
      {
        name: 'p',
        type: 'tuple',
        internalType: 'struct VaultInitParams',
        components: [
          {
            name: 'owner',
            type: 'address',
            internalType: 'address',
          },
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
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'lastBuyAt',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint64',
        internalType: 'uint64',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'limits',
    inputs: [],
    outputs: [
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
    name: 'owner',
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
    name: 'pendingLoosen',
    inputs: [],
    outputs: [
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
        name: 'eta',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'exists',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'unfreeze',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pendingWithdrawal',
    inputs: [],
    outputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'eta',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'exists',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'previewTrade',
    inputs: [
      {
        name: 'p',
        type: 'tuple',
        internalType: 'struct TradeParams',
        components: [
          {
            name: 'tokenIn',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'tokenOut',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'feeTier',
            type: 'uint24',
            internalType: 'uint24',
          },
          {
            name: 'amountIn',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'amountOutMin',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'deadline',
            type: 'uint64',
            internalType: 'uint64',
          },
        ],
      },
    ],
    outputs: [
      {
        name: 'inputBits',
        type: 'uint16',
        internalType: 'uint16',
      },
      {
        name: 'allowed',
        type: 'bool',
        internalType: 'bool',
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
    name: 'queueLoosen',
    inputs: [
      {
        name: 'next',
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
        name: 'addTokens',
        type: 'address[]',
        internalType: 'address[]',
      },
      {
        name: 'unfreeze',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'requestWithdraw',
    inputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setTrader',
    inputs: [
      {
        name: 'newTrader',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'state',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct VaultStateView',
        components: [
          {
            name: 'owner',
            type: 'address',
            internalType: 'address',
          },
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
            name: 'frozen',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'dayIndex',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'tradesToday',
            type: 'uint16',
            internalType: 'uint16',
          },
          {
            name: 'buyVolumeTodayBase',
            type: 'uint128',
            internalType: 'uint128',
          },
          {
            name: 'lastBuyAt',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'pending',
            type: 'tuple',
            internalType: 'struct PendingChange',
            components: [
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
                name: 'addTokens',
                type: 'address[]',
                internalType: 'address[]',
              },
              {
                name: 'eta',
                type: 'uint64',
                internalType: 'uint64',
              },
              {
                name: 'exists',
                type: 'bool',
                internalType: 'bool',
              },
              {
                name: 'unfreeze',
                type: 'bool',
                internalType: 'bool',
              },
            ],
          },
          {
            name: 'withdrawal',
            type: 'tuple',
            internalType: 'struct PendingWithdrawal',
            components: [
              {
                name: 'token',
                type: 'address',
                internalType: 'address',
              },
              {
                name: 'amount',
                type: 'uint256',
                internalType: 'uint256',
              },
              {
                name: 'eta',
                type: 'uint64',
                internalType: 'uint64',
              },
              {
                name: 'exists',
                type: 'bool',
                internalType: 'bool',
              },
            ],
          },
        ],
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
    name: 'tighten',
    inputs: [
      {
        name: 'next',
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
        name: 'removeTokens',
        type: 'address[]',
        internalType: 'address[]',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'trade',
    inputs: [
      {
        name: 'p',
        type: 'tuple',
        internalType: 'struct TradeParams',
        components: [
          {
            name: 'tokenIn',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'tokenOut',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'feeTier',
            type: 'uint24',
            internalType: 'uint24',
          },
          {
            name: 'amountIn',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'amountOutMin',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'deadline',
            type: 'uint64',
            internalType: 'uint64',
          },
        ],
      },
    ],
    outputs: [
      {
        name: 'amountOut',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'trader',
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
    name: 'tradesToday',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint16',
        internalType: 'uint16',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Frozen',
    inputs: [
      {
        name: 'caller',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'LoosenCancelled',
    inputs: [
      {
        name: 'caller',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'LoosenExecuted',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'applied',
        type: 'tuple',
        indexed: false,
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
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'LoosenQueued',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'next',
        type: 'tuple',
        indexed: false,
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
        name: 'addTokens',
        type: 'address[]',
        indexed: false,
        internalType: 'address[]',
      },
      {
        name: 'eta',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
      {
        name: 'unfreeze',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Tightened',
    inputs: [
      {
        name: 'caller',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'next',
        type: 'tuple',
        indexed: false,
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
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Traded',
    inputs: [
      {
        name: 'tokenIn',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'tokenOut',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amountIn',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'amountOut',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'isExit',
        type: 'bool',
        indexed: true,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TraderChanged',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'newTrader',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'WithdrawCancelled',
    inputs: [
      {
        name: 'caller',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'WithdrawExecuted',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'token',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'WithdrawRequested',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'token',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'eta',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'AddressEmptyCode',
    inputs: [
      {
        name: 'target',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'AddressInsufficientBalance',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'AlreadyInitialized',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CircuitChanged',
    inputs: [],
  },
  {
    type: 'error',
    name: 'DepositCapExceeded',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FailedInnerCall',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidLimits',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotOwner',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotOwnerOrTrader',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotStricter',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotTrader',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NothingPending',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ReentrancyGuardReentrantCall',
    inputs: [],
  },
  {
    type: 'error',
    name: 'RuleBlocked',
    inputs: [
      {
        name: 'inputBits',
        type: 'uint16',
        internalType: 'uint16',
      },
    ],
  },
  {
    type: 'error',
    name: 'SafeERC20FailedOperation',
    inputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'SwapMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TooEarly',
    inputs: [
      {
        name: 'eta',
        type: 'uint64',
        internalType: 'uint64',
      },
    ],
  },
  {
    type: 'error',
    name: 'TransferFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroAddress',
    inputs: [],
  },
] as const;
