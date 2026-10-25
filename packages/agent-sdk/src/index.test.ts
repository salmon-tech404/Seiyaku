import { describe, expect, it } from 'vitest';
import { VERSION } from './index.js';

describe('agent-sdk version', () => {
  it('exports correct version string', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
