/**
 * scripts/check-abi.ts
 * Validates that committed ABI files in apps/web/src/chain/abi are fresh and in sync with Foundry artifacts.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateAbis } from './generate-abi.js';

async function checkAbis(): Promise<void> {
  const committedDir = path.resolve('apps/web/src/chain/abi');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seiyaku-abi-check-'));

  try {
    await generateAbis(tempDir);

    const committedFiles = fs.readdirSync(committedDir).sort();
    const generatedFiles = fs.readdirSync(tempDir).sort();

    if (JSON.stringify(committedFiles) !== JSON.stringify(generatedFiles)) {
      console.error(
        `ABI file list mismatch! Committed: ${committedFiles.join(', ')} vs Generated: ${generatedFiles.join(', ')}`,
      );
      process.exit(1);
    }

    for (const file of committedFiles) {
      const committedContent = fs.readFileSync(path.join(committedDir, file), 'utf8');
      const generatedContent = fs.readFileSync(path.join(tempDir, file), 'utf8');

      if (committedContent !== generatedContent) {
        console.error(`ABI file "${file}" is stale! Run "npm run abi:generate" to update.`);
        process.exit(1);
      }
    }

    console.log('PASSED: All committed ABI files are fresh and match Foundry artifacts.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

checkAbis();
