import { z } from 'zod';
import { isAddress, getAddress } from 'viem';
import { VAULT_TEMPLATES, type TemplateId } from './templates.js';

export const addressSchema = z
  .string()
  .trim()
  .refine((val) => isAddress(val), {
    message: 'create.error.invalidAddress',
  })
  .transform((val) => getAddress(val));

export const createVaultFormSchema = z
  .object({
    templateId: z.enum(['careful', 'balanced', 'agent_safe', 'custom']),
    maxTradeBase: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,6})?$/, 'create.error.invalidAmount'),
    maxDailyBase: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,6})?$/, 'create.error.invalidAmount'),
    maxTradesPerDay: z.number().int().min(1, 'create.error.minOneTrade'),
    cooldownSec: z.number().int().min(0, 'create.error.invalidCooldown'),
    expiryDays: z.number().int().min(1, 'create.error.minOneDay'),
    withdrawDelaySec: z.number().int().min(60, 'create.error.withdrawDelayTooShort'),
    traderOption: z.enum(['wallet', 'custom']),
    customTrader: z.string().trim(),
    allowedTokens: z
      .array(
        z.object({
          address: z.string(),
          symbol: z.string(),
          decimals: z.number(),
        }),
      )
      .max(20, 'create.error.maxTokensExceeded'),
  })
  .superRefine((data, ctx) => {
    const trade = parseFloat(data.maxTradeBase || '0');
    const daily = parseFloat(data.maxDailyBase || '0');

    if (trade <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxTradeBase'],
        message: 'create.error.amountMustBePositive',
      });
    }

    if (daily <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxDailyBase'],
        message: 'create.error.amountMustBePositive',
      });
    }

    if (trade > daily) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxTradeBase'],
        message: 'create.error.tradeExceedsDaily',
      });
    }

    if (data.traderOption === 'custom') {
      if (!isAddress(data.customTrader)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customTrader'],
          message: 'create.error.invalidTraderAddress',
        });
      }
    }
  });

export type CreateVaultFormValues = z.infer<typeof createVaultFormSchema>;

export interface AllowedTokenItem {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
}

export interface CreateVaultState {
  templateId: TemplateId;
  maxTradeBase: string; // Human readable USDC string (e.g. "25")
  maxDailyBase: string; // Human readable USDC string (e.g. "100")
  maxTradesPerDay: number;
  cooldownSec: number;
  expiryDays: number;
  withdrawDelaySec: number;
  traderOption: 'wallet' | 'custom';
  customTrader: string;
  allowedTokens: AllowedTokenItem[];
  newTokenInput: string;
  tokenValidationState: 'idle' | 'checking' | 'valid' | 'error';
  tokenValidationError: string | null;
  formErrors: Record<string, string>;
  isSubmitting: boolean;
}

export type CreateVaultAction =
  | { type: 'SELECT_TEMPLATE'; templateId: TemplateId }
  | { type: 'SET_FIELD'; field: string; value: string | number }
  | { type: 'SET_TRADER_OPTION'; option: 'wallet' | 'custom' }
  | { type: 'SET_CUSTOM_TRADER'; address: string }
  | { type: 'SET_NEW_TOKEN_INPUT'; input: string }
  | { type: 'TOKEN_CHECK_START' }
  | { type: 'TOKEN_CHECK_SUCCESS'; token: AllowedTokenItem }
  | { type: 'TOKEN_CHECK_ERROR'; error: string }
  | { type: 'REMOVE_TOKEN'; address: string }
  | { type: 'SET_FORM_ERRORS'; errors: Record<string, string> }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean };

export function getInitialCreateVaultState(): CreateVaultState {
  const balanced = VAULT_TEMPLATES.balanced;
  return {
    templateId: 'balanced',
    maxTradeBase: '100',
    maxDailyBase: '500',
    maxTradesPerDay: balanced.maxTradesPerDay,
    cooldownSec: balanced.cooldownSec,
    expiryDays: balanced.expiryDays,
    withdrawDelaySec: balanced.withdrawDelaySec,
    traderOption: 'wallet',
    customTrader: '',
    allowedTokens: [
      {
        address: '0xe538905cf8410324e03A5A23C1c177a474D59b2b',
        symbol: 'WOKB',
        decimals: 18,
      },
    ],
    newTokenInput: '',
    tokenValidationState: 'idle',
    tokenValidationError: null,
    formErrors: {},
    isSubmitting: false,
  };
}

export function createVaultReducer(
  state: CreateVaultState,
  action: CreateVaultAction,
): CreateVaultState {
  switch (action.type) {
    case 'SELECT_TEMPLATE': {
      if (action.templateId === 'custom') {
        return {
          ...state,
          templateId: 'custom',
        };
      }
      const t = VAULT_TEMPLATES[action.templateId];
      return {
        ...state,
        templateId: action.templateId,
        maxTradeBase: (Number(t.maxTradeBase) / 1e6).toString(),
        maxDailyBase: (Number(t.maxDailyBase) / 1e6).toString(),
        maxTradesPerDay: t.maxTradesPerDay,
        cooldownSec: t.cooldownSec,
        expiryDays: t.expiryDays,
        withdrawDelaySec: t.withdrawDelaySec,
      };
    }

    case 'SET_FIELD': {
      return {
        ...state,
        [action.field]: action.value,
        templateId: 'custom', // Editing customizes parameters
      };
    }

    case 'SET_TRADER_OPTION': {
      return {
        ...state,
        traderOption: action.option,
      };
    }

    case 'SET_CUSTOM_TRADER': {
      return {
        ...state,
        customTrader: action.address,
      };
    }

    case 'SET_NEW_TOKEN_INPUT': {
      return {
        ...state,
        newTokenInput: action.input,
        tokenValidationState: 'idle',
        tokenValidationError: null,
      };
    }

    case 'TOKEN_CHECK_START': {
      return {
        ...state,
        tokenValidationState: 'checking',
        tokenValidationError: null,
      };
    }

    case 'TOKEN_CHECK_SUCCESS': {
      return {
        ...state,
        allowedTokens: [...state.allowedTokens, action.token],
        newTokenInput: '',
        tokenValidationState: 'idle',
        tokenValidationError: null,
      };
    }

    case 'TOKEN_CHECK_ERROR': {
      return {
        ...state,
        tokenValidationState: 'error',
        tokenValidationError: action.error,
      };
    }

    case 'REMOVE_TOKEN': {
      return {
        ...state,
        allowedTokens: state.allowedTokens.filter(
          (t) => t.address.toLowerCase() !== action.address.toLowerCase(),
        ),
      };
    }

    case 'SET_FORM_ERRORS': {
      return {
        ...state,
        formErrors: action.errors,
      };
    }

    case 'SET_SUBMITTING': {
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };
    }

    default:
      return state;
  }
}
