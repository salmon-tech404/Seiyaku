import { spawnSync } from 'node:child_process';
import path from 'node:path';

const steps = [
  {
    name: 'forge fmt --check',
    cmd: 'forge',
    args: ['fmt', '--check'],
    cwd: path.resolve('contracts'),
  },
  { name: 'forge build', cmd: 'forge', args: ['build'], cwd: path.resolve('contracts') },
  {
    name: 'forge test',
    cmd: 'forge',
    args: ['test', '--match-contract', 'VersionTest'],
    cwd: path.resolve('contracts'),
  },
  { name: 'ESLint', cmd: 'npx', args: ['eslint', '.'], cwd: path.resolve('.') },
  {
    name: 'Prettier check',
    cmd: 'npx',
    args: ['prettier', '--check', '.'],
    cwd: path.resolve('.'),
  },
  {
    name: 'TypeScript typecheck (circuit-tools)',
    cmd: 'npx',
    args: ['tsc', '--noEmit'],
    cwd: path.resolve('packages/circuit-tools'),
  },
  {
    name: 'TypeScript typecheck (agent-sdk)',
    cmd: 'npx',
    args: ['tsc', '--noEmit'],
    cwd: path.resolve('packages/agent-sdk'),
  },
  {
    name: 'TypeScript typecheck (web)',
    cmd: 'npx',
    args: ['tsc', '--noEmit'],
    cwd: path.resolve('apps/web'),
  },
  { name: 'Vitest tests', cmd: 'npx', args: ['vitest', 'run'], cwd: path.resolve('.') },
  { name: 'i18n check', cmd: 'node', args: ['scripts/check-i18n.mjs'], cwd: path.resolve('.') },
  { name: 'Web build', cmd: 'npx', args: ['vite', 'build'], cwd: path.resolve('apps/web') },
];

console.log('=== Running Seiyaku Full Verification ===\n');

for (const step of steps) {
  console.log(`>>> [STEP] ${step.name}`);
  const result = spawnSync(step.cmd, step.args, {
    cwd: step.cwd,
    stdio: 'inherit',
    shell: true,
  });

  if (result.error) {
    console.error(`\nFAILED to launch command for step "${step.name}":`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\nFAILED step "${step.name}" with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
  console.log(`PASSED: ${step.name}\n`);
}

console.log('=== All verification checks passed successfully ===');
