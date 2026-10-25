import { describe, expect, it } from 'vitest';
import { VERSION } from './index.js';

describe('circuit-tools version', () => {
  it('exports correct version string', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
