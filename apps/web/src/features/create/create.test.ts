import { describe, it, expect } from 'vitest';
import { VAULT_TEMPLATES, templateToLimits } from './templates.js';
import {
  createVaultFormSchema,
  createVaultReducer,
  getInitialCreateVaultState,
  minutesToSeconds,
  secondsToMinutes,
  hoursToSeconds,
  secondsToHours,
  daysToSeconds,
  secondsToDays,
  formatMinutesDuration,
  formatHoursDuration,
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

describe('Unit Conversions & Friendly Boundary Logic', () => {
  it('converts minutes to seconds and vice versa accurately', () => {
    expect(minutesToSeconds(5)).toBe(300);
    expect(minutesToSeconds(1)).toBe(60);
    expect(minutesToSeconds(30)).toBe(1800);
    expect(minutesToSeconds(0)).toBe(0);

    expect(secondsToMinutes(300)).toBe(5);
    expect(secondsToMinutes(60)).toBe(1);
    expect(secondsToMinutes(1800)).toBe(30);
    expect(secondsToMinutes(0)).toBe(0);
  });

  it('converts hours to seconds and vice versa accurately', () => {
    expect(hoursToSeconds(24)).toBe(86400);
    expect(hoursToSeconds(48)).toBe(172800);
    expect(hoursToSeconds(1)).toBe(3600);
    expect(hoursToSeconds(0)).toBe(0);

    expect(secondsToHours(86400)).toBe(24);
    expect(secondsToHours(172800)).toBe(48);
    expect(secondsToHours(3600)).toBe(1);
    expect(secondsToHours(0)).toBe(0);
  });

  it('converts days to seconds and vice versa accurately', () => {
    expect(daysToSeconds(1)).toBe(86400);
    expect(daysToSeconds(14)).toBe(1209600);
    expect(daysToSeconds(30)).toBe(2592000);
    expect(daysToSeconds(0)).toBe(0);

    expect(secondsToDays(86400)).toBe(1);
    expect(secondsToDays(1209600)).toBe(14);
    expect(secondsToDays(2592000)).toBe(30);
    expect(secondsToDays(0)).toBe(0);
  });

  it('formats minutes and hours durations nicely using translation lookup', () => {
    const mockT = (key: string, params?: Record<string, string | number>) => {
      if (key === 'countdown.minutes') return `${params?.count} minutes`;
      if (key === 'countdown.hours') return `${params?.count} hours`;
      if (key === 'countdown.seconds') return `${params?.count} seconds`;
      return key;
    };

    expect(formatMinutesDuration(300, mockT)).toBe('5 minutes');
    expect(formatMinutesDuration(60, mockT)).toBe('1 minutes');
    expect(formatMinutesDuration(45, mockT)).toBe('45 seconds');

    expect(formatHoursDuration(86400, mockT)).toBe('24 hours');
    expect(formatHoursDuration(172800, mockT)).toBe('48 hours');
    expect(formatHoursDuration(3600, mockT)).toBe('1 hours');
  });

  it('verifies all templates match clean friendly units', () => {
    // Balanced: 5 minutes cooldown, 30 days expiry, 24 hours withdrawal delay
    const balanced = VAULT_TEMPLATES.balanced;
    expect(secondsToMinutes(balanced.cooldownSec)).toBe(5);
    expect(balanced.expiryDays).toBe(30);
    expect(secondsToHours(balanced.withdrawDelaySec)).toBe(24);

    // Careful: 30 minutes cooldown, 14 days expiry, 24 hours withdrawal delay
    const careful = VAULT_TEMPLATES.careful;
    expect(secondsToMinutes(careful.cooldownSec)).toBe(30);
    expect(careful.expiryDays).toBe(14);
    expect(secondsToHours(careful.withdrawDelaySec)).toBe(24);

    // Agent safe: 1 minute cooldown, 7 days expiry, 48 hours withdrawal delay
    const agentSafe = VAULT_TEMPLATES.agent_safe;
    expect(secondsToMinutes(agentSafe.cooldownSec)).toBe(1);
    expect(agentSafe.expiryDays).toBe(7);
    expect(secondsToHours(agentSafe.withdrawDelaySec)).toBe(48);
  });
});
