/**
 * scripts/check-static.mjs
 * Validates the static build output in apps/web/dist against Phase 3 DeWEB requirements:
 * 1. Base './' - no absolute asset URLs (/assets/...) in HTML or CSS
 * 2. File names: ASCII only, lowercase, no spaces
 * 3. Size limits: no file > 30 KB unless it is JS or CSS
 * 4. Total uncompressed size <= 800 KB (budget, decision D25)
 * 5. No external runtime assets (external CDNs, fonts, third-party analytics scripts)
 */

import fs from 'node:fs';
import path from 'node:path';

export function checkStaticBuild(distDir = path.resolve('apps/web/dist')) {
  if (!fs.existsSync(distDir)) {
    return {
      ok: false,
      errors: [`dist directory does not exist at ${distDir}. Run build first.`],
      files: [],
      totalBytes: 0,
    };
  }

  const errors = [];
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = path.relative(distDir, fullPath).replace(/\\/g, '/');
        const stat = fs.statSync(fullPath);
        files.push({
          relPath,
          fullPath,
          name: entry.name,
          bytes: stat.size,
        });
      }
    }
  }

  walk(distDir);

  let totalBytes = 0;
  const BUDGET_TOTAL_BYTES = 800 * 1024; // 800 KB (decision D25)
  const MAX_NON_JS_CSS_FILE_BYTES = 30 * 1024; // 30 KB

  for (const f of files) {
    totalBytes += f.bytes;

    // 1. File name rules: ASCII only, lowercase, no spaces
    const baseName = f.name;
    if (/[^a-z0-9_.-]/.test(baseName)) {
      errors.push(
        `File name "${f.relPath}" contains invalid characters. Must be lowercase ASCII, no spaces (matches [a-z0-9_.-]).`,
      );
    }

    // 2. Size limit per file
    const ext = path.extname(f.name).toLowerCase();
    if (ext !== '.js' && ext !== '.css' && f.bytes > MAX_NON_JS_CSS_FILE_BYTES) {
      errors.push(
        `Non-code asset "${f.relPath}" is ${(f.bytes / 1024).toFixed(1)} KB (exceeds 30 KB limit).`,
      );
    }

    // 3. Content checks for HTML and CSS
    if (ext === '.html' || ext === '.css') {
      const content = fs.readFileSync(f.fullPath, 'utf8');

      // Check for absolute asset paths like href="/..." or src="/..." or url('/...')
      const absAssetMatches = content.match(
        /(?:src|href|url)\s*=\s*["']\/(?!\/)[^"']*["']|url\(\s*["']?\/(?!\/)[^"')]+["']?\s*\)/gi,
      );
      if (absAssetMatches) {
        for (const m of absAssetMatches) {
          errors.push(
            `Absolute asset path detected in ${f.relPath}: ${m}. Assets must be relative (base: './').`,
          );
        }
      }

      // Check for external font/script/style CDN imports (e.g. fonts.googleapis, cdnjs, etc.)
      const externalResourceMatches = content.match(
        /<link[^>]+(?:href)=["']https?:\/\/(?:fonts\.googleapis|cdnjs|cdn\.)[^"']+["']/gi,
      );
      if (externalResourceMatches) {
        for (const m of externalResourceMatches) {
          errors.push(`External resource link detected in ${f.relPath}: ${m}`);
        }
      }
    }
  }

  // 4. Total size budget check
  if (totalBytes > BUDGET_TOTAL_BYTES) {
    errors.push(
      `Total static build size ${(totalBytes / 1024).toFixed(1)} KB exceeds the 800.0 KB budget!`,
    );
  }

  // 5. Leak and security check on build assets
  const TEST_WALLET_MARKER = '__SEIYAKU_E2E_TEST_WALLET__';
  // Check for test private keys from hardhat/anvil/test files
  const KNOWN_TEST_KEYS = [
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    '0x5de4111afa1a4b94908f83103eb2f954b0a473774953a3ed85c2b0056900a2db',
    '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  ];

  for (const f of files) {
    if (f.name.endsWith('.js') || f.name.endsWith('.html') || f.name.endsWith('.css')) {
      const content = fs.readFileSync(f.fullPath, 'utf8');

      if (content.includes(TEST_WALLET_MARKER)) {
        errors.push(
          `Test wallet marker "${TEST_WALLET_MARKER}" detected in production asset ${f.relPath}!`,
        );
      }

      // Check for absolute local repository paths (e.g. D:\18-hackathon or tapeOut or C:\Users\...)
      const localRepoPathMatches = content.match(
        /(?:[a-zA-Z]:\\(?:18-hackathon|Users\\[^\\]+\\AppData)|[\\/]18-hackathon[\\/]tapeOut)/gi,
      );
      if (localRepoPathMatches) {
        for (const lp of localRepoPathMatches) {
          errors.push(`Local repository filesystem path leaked in ${f.relPath}: ${lp}`);
        }
      }

      // Check for known test private keys
      for (const tk of KNOWN_TEST_KEYS) {
        if (content.toLowerCase().includes(tk.toLowerCase())) {
          errors.push(`Test private key leaked in ${f.relPath}: ${tk}`);
        }
      }

      // Check for RPC keys or API key query params
      const apiKeyMatches = content.match(
        /(?:alchemy\.com\/v2\/[a-zA-Z0-9_-]{20,}|infura\.io\/v3\/[a-zA-Z0-9]{20,})/gi,
      );
      if (apiKeyMatches) {
        for (const ak of apiKeyMatches) {
          errors.push(`RPC provider API key leaked in ${f.relPath}: ${ak}`);
        }
      }
    }
  }

  // 6. Check LICENSE file for valid year and owner placeholder
  const licensePath = path.resolve('LICENSE');
  if (!fs.existsSync(licensePath)) {
    errors.push('LICENSE file is missing at repository root.');
  } else {
    const lic = fs.readFileSync(licensePath, 'utf8');
    if (!lic.includes('2026')) {
      errors.push('LICENSE does not contain required copyright year 2026.');
    }
    if (!lic.includes('<OWNER NAME>') && !lic.includes('Seiyaku')) {
      errors.push('LICENSE missing valid copyright owner or <OWNER NAME> placeholder.');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    files,
    totalBytes,
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const result = checkStaticBuild();

  console.log('=== Static Build Output Report ===\n');
  for (const f of result.files) {
    console.log(`  ${f.relPath.padEnd(40)} ${(f.bytes / 1024).toFixed(2).padStart(8)} KB`);
  }
  console.log('----------------------------------------------------');
  console.log(
    `  TOTAL UNCOMPRESSED:                      ${(result.totalBytes / 1024).toFixed(2).padStart(8)} KB (budget: 800.00 KB)\n`,
  );

  if (!result.ok) {
    console.error('check:static FAILED with errors:');
    for (const err of result.errors) {
      console.error('  - ' + err);
    }
    process.exit(1);
  }

  console.log('PASSED: check:static verified successfully.');
}
