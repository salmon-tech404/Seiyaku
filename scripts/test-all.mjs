import { spawnSync } from 'node:child_process';
import path from 'node:path';

console.log('Running vitest unit tests...');
const vitestRes = spawnSync('npx', ['vitest', 'run'], { stdio: 'inherit', shell: true });
if (vitestRes.status !== 0) process.exit(vitestRes.status ?? 1);

console.log('Running forge tests...');
const forgeRes = spawnSync('forge', ['test'], {
  cwd: path.resolve('contracts'),
  stdio: 'inherit',
  shell: true,
});
if (forgeRes.status !== 0) process.exit(forgeRes.status ?? 1);
