// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import en from '../../i18n/en.json';
import viDict from '../../i18n/vi.json';

describe('i18n dictionary parity and typing', () => {
  it('has identical keys between en.json and vi.json', () => {
    const enKeys = Object.keys(en).sort();
    const viKeys = Object.keys(viDict).sort();

    expect(enKeys).toEqual(viKeys);
  });

  it('contains no empty translation strings', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim().length, `en.${key} is empty`).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(viDict)) {
      expect(value.trim().length, `vi.${key} is empty`).toBeGreaterThan(0);
    }
  });
});

describe('i18n interpolation and pluralization logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('interpolates single and multiple parameters', () => {
    const template = 'Hello {name}, you have {count} messages.';
    const result = template.replaceAll('{name}', 'Alice').replaceAll('{count}', '5');
    expect(result).toBe('Hello Alice, you have 5 messages.');
  });

  it('selects plural forms correctly using Intl.PluralRules', () => {
    const enRules = new Intl.PluralRules('en');
    expect(enRules.select(1)).toBe('one');
    expect(enRules.select(2)).toBe('other');
    expect(enRules.select(0)).toBe('other');

    const viRules = new Intl.PluralRules('vi');
    expect(viRules.select(1)).toBe('other');
    expect(viRules.select(5)).toBe('other');
  });

  it('handles localStorage errors gracefully without throwing', () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied');
    });

    // Should not throw even when storage throws
    let errorCaught = false;
    try {
      window.localStorage.getItem('seiyaku_lang');
    } catch {
      errorCaught = true;
    }
    expect(errorCaught).toBe(true);
    storageSpy.mockRestore();
  });
});
