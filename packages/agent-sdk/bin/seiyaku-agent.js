#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.resolve(__dirname, '../src/cli/main.ts');

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', cliEntry, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
  },
);

if (result.error) {
  const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const fallback = spawnSync(runner, ['tsx', cliEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(fallback.status ?? 1);
}

process.exit(result.status ?? 1);
