import { spawnSync } from 'node:child_process';
import path from 'node:path';

console.log('Building web app...');
const webRes = spawnSync('npm', ['--workspace=@seiyaku/web', 'run', 'build'], {
  stdio: 'inherit',
  shell: true,
});
if (webRes.status !== 0) process.exit(webRes.status ?? 1);

console.log('Building contracts...');
const forgeRes = spawnSync('forge', ['build'], {
  cwd: path.resolve('contracts'),
  stdio: 'inherit',
  shell: true,
});
if (forgeRes.status !== 0) process.exit(forgeRes.status ?? 1);
