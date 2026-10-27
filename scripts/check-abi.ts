/**
 * scripts/check-abi.ts
 * Validates that committed ABI files in apps/web/src/chain/abi and packages/agent-sdk/src/abi
 * are fresh and in sync with Foundry artifacts.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateAbis } from './generate-abi.js';

async function checkAbis(): Promise<void> {
  const targetDirs = [
    path.resolve('apps/web/src/chain/abi'),
    path.resolve('packages/agent-sdk/src/abi'),
  ];
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seiyaku-abi-check-'));

  try {
    const tempSubDirs = targetDirs.map((_, i) => path.join(tempDir, `dir-${i}`));
    await generateAbis(tempSubDirs);

    for (let i = 0; i < targetDirs.length; i++) {
      const committedDir = targetDirs[i];
      const generatedDir = tempSubDirs[i];
      if (committedDir === undefined || generatedDir === undefined) continue;

      if (!fs.existsSync(committedDir)) {
        console.error(`Committed ABI directory does not exist: ${committedDir}`);
        process.exit(1);
      }

      const committedFiles = fs.readdirSync(committedDir).sort();
      const generatedFiles = fs.readdirSync(generatedDir).sort();

      if (JSON.stringify(committedFiles) !== JSON.stringify(generatedFiles)) {
        console.error(
          `ABI file list mismatch in ${committedDir}! Committed: ${committedFiles.join(', ')} vs Generated: ${generatedFiles.join(', ')}`,
        );
        process.exit(1);
      }

      for (const file of committedFiles) {
        const committedContent = fs.readFileSync(path.join(committedDir, file), 'utf8');
        const generatedContent = fs.readFileSync(path.join(generatedDir, file), 'utf8');

        if (committedContent !== generatedContent) {
          console.error(
            `ABI file "${file}" in ${committedDir} is stale! Run "npm run abi:generate" to update.`,
          );
          process.exit(1);
        }
      }
    }

    console.log('PASSED: All committed ABI files are fresh and match Foundry artifacts.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

checkAbis();
