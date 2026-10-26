import { describe, it, expect } from 'vitest';
import {
  TOOL_NAMES,
  SEIYAKU_TOOLS,
  parseGetStateInput,
  parseCheckTradeInput,
  parseTradeInput,
  parseFreezeInput,
} from './tools.js';

describe('MCP tools schemas and strict validation', () => {
  const validToken = '0xe538905cf8410324e03a5a23c1c177a474d59b2b';

  it('exposes exactly 4 tools with correct names and definitions', () => {
    expect(SEIYAKU_TOOLS.length).toBe(4);
    const names = SEIYAKU_TOOLS.map((t) => t.name);
    expect(names).toContain(TOOL_NAMES.GET_STATE);
    expect(names).toContain(TOOL_NAMES.CHECK_TRADE);
    expect(names).toContain(TOOL_NAMES.TRADE);
    expect(names).toContain(TOOL_NAMES.FREEZE);

    for (const tool of SEIYAKU_TOOLS) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });

  describe('seiyaku_get_state input', () => {
    it('accepts empty object or undefined', () => {
      expect(parseGetStateInput({})).toEqual({});
      expect(parseGetStateInput(undefined)).toEqual({});
    });

    it('rejects unexpected extra keys', () => {
      expect(() => parseGetStateInput({ extraParam: 'fail' })).toThrow(/Unexpected parameter/);
    });

    it('strictly rejects sensitive keys like privateKey, secret, key, seed', () => {
      expect(() => parseGetStateInput({ privateKey: '0x123' })).toThrow(/Security rejection/);
      expect(() => parseGetStateInput({ secret: 'password' })).toThrow(/Security rejection/);
      expect(() => parseGetStateInput({ key: '123' })).toThrow(/Security rejection/);
      expect(() => parseGetStateInput({ seed: 'phrase' })).toThrow(/Security rejection/);
    });
  });

  describe('seiyaku_check_trade input', () => {
    it('accepts valid trade parameters', () => {
      const parsed = parseCheckTradeInput({
        side: 'buy',
        token: validToken,
        amountIn: '10.5',
        feeTier: 500,
        slippageBps: 50,
      });

      expect(parsed.side).toBe('buy');
      expect(parsed.token.toLowerCase()).toBe(validToken.toLowerCase());
      expect(parsed.amountIn).toBe('10.5');
      expect(parsed.feeTier).toBe(500);
      expect(parsed.slippageBps).toBe(50);
    });

    it('rejects unexpected extra keys', () => {
      expect(() =>
        parseCheckTradeInput({
          side: 'buy',
          token: validToken,
          amountIn: '10',
          unwanted: true,
        }),
      ).toThrow(/Unexpected parameter/);
    });

    it('strictly rejects sensitive keys', () => {
      expect(() =>
        parseCheckTradeInput({
          side: 'buy',
          token: validToken,
          amountIn: '10',
          privateKey: '0xabc',
        }),
      ).toThrow(/Security rejection/);
    });

    it('rejects invalid side or non-address token', () => {
      expect(() =>
        parseCheckTradeInput({
          side: 'invalid_side',
          token: validToken,
          amountIn: '10',
        }),
      ).toThrow();

      expect(() =>
        parseCheckTradeInput({
          side: 'buy',
          token: 'not-an-address',
          amountIn: '10',
        }),
      ).toThrow();
    });
  });

  describe('seiyaku_trade input', () => {
    it('accepts valid trade parameters', () => {
      const parsed = parseTradeInput({
        side: 'exit',
        token: validToken,
        amountIn: '5',
      });
      expect(parsed.side).toBe('exit');
      expect(parsed.token.toLowerCase()).toBe(validToken.toLowerCase());
      expect(parsed.amountIn).toBe('5');
    });

    it('strictly rejects sensitive keys', () => {
      expect(() =>
        parseTradeInput({
          side: 'exit',
          token: validToken,
          amountIn: '5',
          seed: 'canary seed phrase',
        }),
      ).toThrow(/Security rejection/);
    });
  });

  describe('seiyaku_freeze input', () => {
    it('accepts empty object or undefined', () => {
      expect(parseFreezeInput({})).toEqual({});
      expect(parseFreezeInput(undefined)).toEqual({});
    });

    it('rejects unexpected extra keys', () => {
      expect(() => parseFreezeInput({ force: true })).toThrow(/Unexpected parameter/);
    });

    it('strictly rejects sensitive keys', () => {
      expect(() => parseFreezeInput({ secret: 'canary' })).toThrow(/Security rejection/);
    });
  });
});
