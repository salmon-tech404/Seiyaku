import { describe, it, expect, vi } from 'vitest';
import { runCli, CLI_EXIT_CODES, sanitizeSecret } from './cli/run.js';
import { z } from 'zod';

describe('CLI execution and safety tests', () => {
  it('returns code 0 on --help', async () => {
    const code = await runCli(['node', 'seiyaku-agent', '--help']);
    expect(code).toBe(CLI_EXIT_CODES.SUCCESS);
  });

  it('returns code 0 on --version', async () => {
    const code = await runCli(['node', 'seiyaku-agent', '--version']);
    expect(code).toBe(CLI_EXIT_CODES.SUCCESS);
  });

  it('returns code 4 on missing command', async () => {
    const code = await runCli(['node', 'seiyaku-agent']);
    expect(code).toBe(CLI_EXIT_CODES.INVALID_INPUT);
  });

  it('returns code 4 on invalid vault address', async () => {
    const code = await runCli(['node', 'seiyaku-agent', 'state', '--vault', '0xinvalid']);
    expect(code).toBe(CLI_EXIT_CODES.INVALID_INPUT);
  });

  it('returns code 0 on explain with all bits satisfied', async () => {
    const code = await runCli(['node', 'seiyaku-agent', 'explain', '511']);
    expect(code).toBe(CLI_EXIT_CODES.SUCCESS);
  });

  it('outputs valid JSON schema on explain --json', async () => {
    let output = '';
    const spy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      output += msg;
    });

    const code = await runCli(['node', 'seiyaku-agent', 'explain', '510', '--json']);
    expect(code).toBe(CLI_EXIT_CODES.SUCCESS);

    const parsed = JSON.parse(output);
    const explainSchema = z.object({
      bits: z.number(),
      reasons: z.array(
        z.object({
          code: z.string(),
          name: z.string(),
          text: z.string(),
          bitIndex: z.number(),
        }),
      ),
    });

    expect(() => explainSchema.parse(parsed)).not.toThrow();
    expect(parsed.reasons).toHaveLength(1);
    expect(parsed.reasons[0].code).toBe('ERR_INSANE_PARAMS');

    spy.mockRestore();
  });

  describe('Canary Secret Privacy (D26)', () => {
    const CANARY_KEY = '0x9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef';

    it('sanitizes secret key from text', () => {
      const dirty = `An error occurred with key ${CANARY_KEY} while broadcasting`;
      const clean = sanitizeSecret(dirty, CANARY_KEY);
      expect(clean).not.toContain(CANARY_KEY);
      expect(clean).toContain('[REDACTED_SECRET]');
    });

    it('canary test: private key never leaks into stdout, stderr, or errors during CLI run', async () => {
      process.env.CANARY_TEST_KEY_ENV = CANARY_KEY;

      const logs: string[] = [];
      const errors: string[] = [];

      const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
        logs.push(String(msg));
      });
      const errSpy = vi.spyOn(console, 'error').mockImplementation((msg) => {
        errors.push(String(msg));
      });

      try {
        // Run against an invalid/unreachable RPC to force network error
        const code = await runCli([
          'node',
          'seiyaku-agent',
          'trade',
          '--vault',
          '0x1111111111111111111111111111111111111111',
          '--side',
          'buy',
          '--token',
          '0xe538905cf8410324e03a5a23c1c177a474d59b2b',
          '--amount',
          '10',
          '--rpc',
          'http://127.0.0.1:19999',
          '--key-env',
          'CANARY_TEST_KEY_ENV',
          '--send',
        ]);

        expect(code).toBe(CLI_EXIT_CODES.NETWORK_ERROR);

        const allOutput = [...logs, ...errors].join('\n');
        expect(allOutput).not.toContain(CANARY_KEY);
        expect(allOutput).not.toContain('9876543210abcdef');
      } finally {
        logSpy.mockRestore();
        errSpy.mockRestore();
        delete process.env.CANARY_TEST_KEY_ENV;
      }
    });
  });
});
