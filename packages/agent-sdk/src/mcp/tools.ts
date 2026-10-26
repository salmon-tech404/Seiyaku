import { z } from 'zod';
import { addressSchema } from '../types.js';

export const TOOL_NAMES = {
  GET_STATE: 'seiyaku_get_state',
  CHECK_TRADE: 'seiyaku_check_trade',
  TRADE: 'seiyaku_trade',
  FREEZE: 'seiyaku_freeze',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

// Zod Input Schemas (strictly reject extra keys)
export const getStateInputSchema = z.object({}).strict();

export const checkTradeInputSchema = z
  .object({
    side: z.enum(['buy', 'exit']),
    token: addressSchema,
    amountIn: z.string(),
    feeTier: z.number().int().optional(),
    slippageBps: z.number().int().min(0).max(300).optional(),
  })
  .strict();

export const tradeInputSchema = z
  .object({
    side: z.enum(['buy', 'exit']),
    token: addressSchema,
    amountIn: z.string(),
    feeTier: z.number().int().optional(),
    slippageBps: z.number().int().min(0).max(300).optional(),
  })
  .strict();

export const freezeInputSchema = z.object({}).strict();

export type GetStateInput = z.infer<typeof getStateInputSchema>;
export type CheckTradeInput = z.infer<typeof checkTradeInputSchema>;
export type TradeInput = z.infer<typeof tradeInputSchema>;
export type FreezeInput = z.infer<typeof freezeInputSchema>;

// Sensitive parameter patterns forbidden in tool inputs
const FORBIDDEN_SENSITIVE_KEYS = [
  'privatekey',
  'private_key',
  'privkey',
  'priv_key',
  'secret',
  'key',
  'seed',
  'seedphrase',
  'seed_phrase',
  'mnemonic',
  'passphrase',
  'password',
] as const;

/**
 * Validates that an input object contains no unexpected or sensitive keys.
 */
export function validateNoUnexpectedKeys(
  input: unknown,
  allowedKeys: readonly string[],
  toolName: string,
): void {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return;
  }

  const keys = Object.keys(input as Record<string, unknown>);
  for (const k of keys) {
    const lowerKey = k.toLowerCase().replace(/[-_]/g, '');
    for (const forbidden of FORBIDDEN_SENSITIVE_KEYS) {
      if (
        lowerKey === forbidden ||
        lowerKey.includes('privatekey') ||
        lowerKey.includes('seedphrase') ||
        lowerKey.includes('seed') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('passphrase') ||
        lowerKey.includes('mnemonic')
      ) {
        throw new Error(
          `Security rejection: Sensitive key "${k}" must never be provided to ${toolName}. Private keys and secrets are handled strictly out-of-band.`,
        );
      }
    }

    if (!allowedKeys.includes(k)) {
      throw new Error(
        `Unexpected parameter "${k}" provided to ${toolName}. Extra parameters are strictly rejected.`,
      );
    }
  }
}

export function parseGetStateInput(input: unknown): GetStateInput {
  validateNoUnexpectedKeys(input, [], TOOL_NAMES.GET_STATE);
  return getStateInputSchema.parse(input ?? {});
}

export function parseCheckTradeInput(input: unknown): CheckTradeInput {
  validateNoUnexpectedKeys(
    input,
    ['side', 'token', 'amountIn', 'feeTier', 'slippageBps'],
    TOOL_NAMES.CHECK_TRADE,
  );
  return checkTradeInputSchema.parse(input);
}

export function parseTradeInput(input: unknown): TradeInput {
  validateNoUnexpectedKeys(
    input,
    ['side', 'token', 'amountIn', 'feeTier', 'slippageBps'],
    TOOL_NAMES.TRADE,
  );
  return tradeInputSchema.parse(input);
}

export function parseFreezeInput(input: unknown): FreezeInput {
  validateNoUnexpectedKeys(input, [], TOOL_NAMES.FREEZE);
  return freezeInputSchema.parse(input ?? {});
}

// JSON Schema specifications for MCP tools
export const getStateJsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

export const checkTradeJsonSchema = {
  type: 'object',
  properties: {
    side: {
      type: 'string',
      enum: ['buy', 'exit'],
      description:
        "Trade direction: 'buy' swaps base token into target token; 'exit' sells target token back to base token.",
    },
    token: {
      type: 'string',
      pattern: '^0x[a-fA-F0-9]{40}$',
      description: 'The 20-byte ERC-20 token address on X Layer.',
    },
    amountIn: {
      type: 'string',
      description: 'Input token amount in human-readable decimal units (e.g. "1.5" or "100").',
    },
    feeTier: {
      type: 'integer',
      description:
        'Uniswap V3 pool fee tier in hundredths of a pip (e.g. 500 for 0.05%, 3000 for 0.3%). Default is 500.',
    },
    slippageBps: {
      type: 'integer',
      minimum: 0,
      maximum: 300,
      description:
        'Maximum allowed slippage in basis points (1 bp = 0.01%, 50 = 0.5%, max 300 bps / 3%). Default is 50.',
    },
  },
  required: ['side', 'token', 'amountIn'],
  additionalProperties: false,
} as const;

export const tradeJsonSchema = {
  type: 'object',
  properties: {
    side: {
      type: 'string',
      enum: ['buy', 'exit'],
      description:
        "Trade direction: 'buy' swaps base token into target token; 'exit' sells target token back to base token.",
    },
    token: {
      type: 'string',
      pattern: '^0x[a-fA-F0-9]{40}$',
      description: 'The 20-byte ERC-20 token address on X Layer.',
    },
    amountIn: {
      type: 'string',
      description: 'Input token amount in human-readable decimal units (e.g. "1.5" or "100").',
    },
    feeTier: {
      type: 'integer',
      description:
        'Uniswap V3 pool fee tier in hundredths of a pip (e.g. 500 for 0.05%, 3000 for 0.3%). Default is 500.',
    },
    slippageBps: {
      type: 'integer',
      minimum: 0,
      maximum: 300,
      description:
        'Maximum allowed slippage in basis points (1 bp = 0.01%, 50 = 0.5%, max 300 bps / 3%). Default is 50.',
    },
  },
  required: ['side', 'token', 'amountIn'],
  additionalProperties: false,
} as const;

export const freezeJsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: readonly string[] | undefined;
    additionalProperties: false;
  };
}

export const SEIYAKU_GET_STATE_TOOL: McpToolDefinition = {
  name: TOOL_NAMES.GET_STATE,
  description:
    'Query the current state of the Seiyaku MandateVault including on-chain trading limits (max trade size, daily limit, daily max trades, cooldown, expiry), daily spend counters, allowed trading tokens, token balances, pending timelocked limit changes, and vault freeze status. All token symbols returned are sanitized against prompt injection.',
  inputSchema: getStateJsonSchema,
};

export const SEIYAKU_CHECK_TRADE_TOOL: McpToolDefinition = {
  name: TOOL_NAMES.CHECK_TRADE,
  description:
    'Precheck and simulate a trade against the on-chain Mandate circuit rules and pool quote without broadcasting a transaction. Verifies that trade size, daily volume, trades count, allowed tokens list, and cooldown constraints are satisfied.',
  inputSchema: checkTradeJsonSchema,
};

export const SEIYAKU_TRADE_TOOL: McpToolDefinition = {
  name: TOOL_NAMES.TRADE,
  description:
    'Check and execute a trade through the MandateVault. When allowSend is false (default), runs in preview simulation mode and returns { sent: false, simulation: outcome }. When allowSend is true, verifies circuit rules, re-quotes for fresh slippage protection, and broadcasts the trade on-chain.',
  inputSchema: tradeJsonSchema,
};

export const SEIYAKU_FREEZE_TOOL: McpToolDefinition = {
  name: TOOL_NAMES.FREEZE,
  description:
    'Emergency freeze: blocks new buys immediately. Exits back to the base token stay open. Only the vault owner can unfreeze, after the loosening delay. When allowSend is false, returns simulation only. When allowSend is true, broadcasts freeze on-chain.',
  inputSchema: freezeJsonSchema,
};

export const SEIYAKU_TOOLS: readonly McpToolDefinition[] = [
  SEIYAKU_GET_STATE_TOOL,
  SEIYAKU_CHECK_TRADE_TOOL,
  SEIYAKU_TRADE_TOOL,
  SEIYAKU_FREEZE_TOOL,
];

export const MCP_TOOL_DEFINITIONS = SEIYAKU_TOOLS;
