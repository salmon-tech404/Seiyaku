import fs from 'node:fs';
import path from 'node:path';

// Banned words per specification and user rules
const BANNED_PATTERNS = [
  /\bsilicon\b/i,
  /\bhardware logic\b/i,
  /\bbattle-tested\b/i,
  /(?<!un)audited\b/i, // "audited" without "un" prefix
  /\bguaranteed\b/i,
  /\brisk[- ]free\b/i,
  /\bprofit\b/i,
];

// Disallowed unsubstantiated marketing claims
const CLAIM_PATTERNS = [
  /\b(thousands|millions|hundreds) of users\b/i,
  /\b\$[0-9]+[kKmMbB]?\s*(revenue|volume|tvl|raised)\b/i,
  /\bmarket[- ]leading\b/i,
  /\bworld[- ]class\b/i,
  /\bunbeatable\b/i,
];

function checkFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  for (const pat of BANNED_PATTERNS) {
    const match = content.match(pat);
    if (match) {
      errors.push(`${filePath}: Forbidden word/phrase matched: "${match[0]}" (pattern: ${pat})`);
    }
  }

  for (const pat of CLAIM_PATTERNS) {
    const match = content.match(pat);
    if (match) {
      errors.push(`${filePath}: Unsubstantiated marketing claim matched: "${match[0]}"`);
    }
  }

  return errors;
}

export function runDocsCheck(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const rootsToScan = ['docs', 'apps/web/src/i18n'];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && (ent.name.endsWith('.md') || ent.name.endsWith('.json'))) {
        errors.push(...checkFile(full));
      }
    }
  }

  for (const r of rootsToScan) {
    walk(path.resolve(r));
  }

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/check-docs.ts')) {
  const result = runDocsCheck();
  if (!result.ok) {
    console.error('docs:check FAILED with violations:');
    for (const err of result.errors) {
      console.error('  - ' + err);
    }
    process.exit(1);
  }
  console.log(
    'PASSED: Documentation honesty check verified (no banned words or unsubstantiated claims).',
  );
}
