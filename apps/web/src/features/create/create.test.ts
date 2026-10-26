import { describe, it, expect } from 'vitest';
import { VAULT_TEMPLATES, templateToLimits } from './templates.js';
import {
  createVaultFormSchema,
  createVaultReducer,
  getInitialCreateVaultState,
} from './createVaultState.js';

describe('Vault Templates', () => {
  const currentTimestamp = 1700000000;
  const minWithdrawDelaySec = 60; // Factory minimum

  for (const [key, template] of Object.entries(VAULT_TEMPLATES)) {
    it(`template "${key}" satisfies all factory and limits constraints`, () => {
      expect(template.maxTradeBase).toBeGreaterThan(0n);
      expect(template.maxDailyBase).toBeGreaterThan(0n);
      expect(template.maxTradeBase).toBeLessThanOrEqual(template.maxDailyBase);
      expect(template.maxTradesPerDay).toBeGreaterThan(0);
      expect(template.expiryDays).toBeGreaterThan(0);
      expect(template.withdrawDelaySec).toBeGreaterThanOrEqual(minWithdrawDelaySec);

      const limits = templateToLimits(template, currentTimestamp);
      expect(limits.maxTradeBase).toBe(template.maxTradeBase);
      expect(limits.maxDailyBase).toBe(template.maxDailyBase);
      expect(limits.maxTradesPerDay).toBe(template.maxTradesPerDay);
      expect(limits.cooldownSec).toBe(template.cooldownSec);
      expect(limits.expiresAt).toBe(BigInt(currentTimestamp + template.expiryDays * 86400));
      expect(limits.withdrawDelaySec).toBe(template.withdrawDelaySec);
    });
  }
});

describe('Create Vault Form Schema (Zod)', () => {
  const validData = {
    templateId: 'balanced' as const,
    maxTradeBase: '100',
    maxDailyBase: '500',
    maxTradesPerDay: 10,
    cooldownSec: 300,
    expiryDays: 30,
    withdrawDelaySec: 86400,
    traderOption: 'wallet' as const,
    customTrader: '',
    allowedTokens: [
      {
        address: '0xe538905cf8410324e03A5A23C1c177a474D59b2b',
        symbol: 'WOKB',
        decimals: 18,
      },
    ],
  };

  it('accepts valid default form data', () => {
    const result = createVaultFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('rejects trade amount > daily amount', () => {
    const invalid = { ...validData, maxTradeBase: '600', maxDailyBase: '500' };
    const result = createVaultFormSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('create.error.tradeExceedsDaily');
    }
  });

  it('rejects custom trader with invalid address', () => {
    const invalid = {
      ...validData,
      traderOption: 'custom' as const,
      customTrader: '0xinvalid',
    };
    const result = createVaultFormSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('create.error.invalidTraderAddress');
    }
  });

  it('rejects more than 20 allowed tokens', () => {
    const tokens = Array.from({ length: 21 }, (_, i) => ({
      address: `0x${i.toString(16).padStart(40, '0')}`,
      symbol: `TKN${i}`,
      decimals: 18,
    }));
    const invalid = { ...validData, allowedTokens: tokens };
    const result = createVaultFormSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('create.error.maxTokensExceeded');
    }
  });
});

describe('Create Vault Reducer', () => {
  it('switches template correctly and sets parameters', () => {
    let state = getInitialCreateVaultState();
    expect(state.templateId).toBe('balanced');
    expect(state.maxTradeBase).toBe('100');

    state = createVaultReducer(state, { type: 'SELECT_TEMPLATE', templateId: 'careful' });
    expect(state.templateId).toBe('careful');
    expect(state.maxTradeBase).toBe('25');
    expect(state.maxDailyBase).toBe('100');
    expect(state.expiryDays).toBe(14);
  });

  it('customizes when field is edited', () => {
    let state = getInitialCreateVaultState();
    state = createVaultReducer(state, {
      type: 'SET_FIELD',
      field: 'maxTradeBase',
      value: '75',
    });
    expect(state.templateId).toBe('custom');
    expect(state.maxTradeBase).toBe('75');
  });

  it('adds and removes tokens', () => {
    let state = getInitialCreateVaultState();
    expect(state.allowedTokens.length).toBe(1);

    const newToken = {
      address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
      symbol: 'TEST',
      decimals: 18,
    };
    state = createVaultReducer(state, { type: 'TOKEN_CHECK_SUCCESS', token: newToken });
    expect(state.allowedTokens.length).toBe(2);

    state = createVaultReducer(state, { type: 'REMOVE_TOKEN', address: newToken.address });
    expect(state.allowedTokens.length).toBe(1);
    expect(state.allowedTokens[0]?.symbol).toBe('WOKB');
  });
});
