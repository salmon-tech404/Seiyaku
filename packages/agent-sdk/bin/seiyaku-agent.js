#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.resolve(__dirname, '../src/cli/main.ts');

const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(runner, ['tsx', cliEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
