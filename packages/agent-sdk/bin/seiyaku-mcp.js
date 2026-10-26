#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.resolve(__dirname, '../src/mcp/main.ts');

const child = spawn(process.execPath, ['--import', 'tsx', cliEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('error', () => {
  const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const fallback = spawn(runner, ['tsx', cliEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  fallback.on('exit', (code) => {
    process.exit(code ?? 0);
  });
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
