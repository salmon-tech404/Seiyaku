import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export function resetDemoFixture() {
  console.log('=== Resetting Demo Fixture ===');

  // 1. Kill saved Anvil PID if any
  const pidFile = path.resolve('temp/demo-anvil.pid');
  if (fs.existsSync(pidFile)) {
    const pidStr = fs.readFileSync(pidFile, 'utf8').trim();
    if (pidStr) {
      try {
        console.log(`Killing Anvil process (PID ${pidStr})...`);
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${pidStr} /F /T`, { stdio: 'ignore' });
        } else {
          process.kill(Number(pidStr), 'SIGKILL');
        }
      } catch {
        // Ignored if already dead
      }
    }
    fs.unlinkSync(pidFile);
  }

  // 2. Kill anything listening on port 8545 on Windows
  if (process.platform === 'win32') {
    try {
      const netstatOutput = execSync('netstat -ano | findstr :8545', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const lines = netstatOutput.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') {
          console.log(`Killing process on port 8545 (PID ${pid})...`);
          try {
            execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
          } catch {
            // Ignored
          }
        }
      }
    } catch {
      // No process found on 8545
    }
  }

  // 3. Remove demo state artifacts
  const demoStateFile = path.resolve('deployments/fork/demo-state.json');
  if (fs.existsSync(demoStateFile)) {
    fs.unlinkSync(demoStateFile);
    console.log('Removed deployments/fork/demo-state.json');
  }

  const testVaultsFile = path.resolve('deployments/fork/test-vaults.json');
  if (fs.existsSync(testVaultsFile)) {
    fs.unlinkSync(testVaultsFile);
  }

  console.log('Demo fixture state reset cleanly.\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/demo-reset.ts')) {
  resetDemoFixture();
}
