import { describe, it, expect } from 'vitest';
import { parseHash, matchPattern } from './index.js';

describe('Hash router parsing and matching', () => {
  it('parses empty and root hashes', () => {
    expect(parseHash('')).toEqual({ path: '/', query: new URLSearchParams('') });
    expect(parseHash('#/')).toEqual({ path: '/', query: new URLSearchParams('') });
    expect(parseHash('#')).toEqual({ path: '/', query: new URLSearchParams('') });
  });

  it('parses paths and query parameters', () => {
    const res = parseHash('#/create?demo=1&foo=bar');
    expect(res.path).toBe('/create');
    expect(res.query.get('demo')).toBe('1');
    expect(res.query.get('foo')).toBe('bar');
  });

  it('parses vault address routes with query parameters', () => {
    const res = parseHash('#/vault/0x1234567890abcdef?demo=1');
    expect(res.path).toBe('/vault/0x1234567890abcdef');
    expect(res.query.get('demo')).toBe('1');
  });

  it('matches static routes correctly', () => {
    expect(matchPattern('/', '/')).toEqual({});
    expect(matchPattern('/create', '/create')).toEqual({});
    expect(matchPattern('/create', '/other')).toBeNull();
  });

  it('matches parameterized routes correctly', () => {
    const params = matchPattern('/vault/:address', '/vault/0xdeadbeef');
    expect(params).toEqual({ address: '0xdeadbeef' });

    const mismatch = matchPattern('/vault/:address', '/create');
    expect(mismatch).toBeNull();
  });
});
