import fs from 'node:fs';
import path from 'node:path';

/**
 * Checks that two json dictionaries have identical key sets.
 * @param {string} enPath
 * @param {string} viPath
 * @returns {{ ok: boolean; errors: string[] }}
 */
export function checkDictionaryParity(enPath, viPath) {
  const errors = [];
  if (!fs.existsSync(enPath)) {
    return { ok: false, errors: [`Missing English dictionary at ${enPath}`] };
  }
  if (!fs.existsSync(viPath)) {
    return { ok: false, errors: [`Missing Vietnamese dictionary at ${viPath}`] };
  }

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  const enKeys = new Set(Object.keys(en));
  const viKeys = new Set(Object.keys(vi));

  for (const k of enKeys) {
    if (!viKeys.has(k)) {
      errors.push(`Key "${k}" present in en.json but missing in vi.json`);
    }
  }
  for (const k of viKeys) {
    if (!enKeys.has(k)) {
      errors.push(`Key "${k}" present in vi.json but missing in en.json`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Recursively gets all .tsx files in a directory.
 * @param {string} dir
 * @returns {string[]}
 */
export function getTsxFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Checks a tsx file for forbidden literals:
 * 1. Text node literals: > some text < (where text is not whitespace and outside of { ... })
 * 2. aria-label="...", title="...", placeholder="..." attribute literals
 * @param {string} filePath
 * @returns {{ ok: boolean; errors: string[] }}
 */
export function checkTsxFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const errors = [];

  // Check forbidden attribute literals
  const attrRegex = /\b(aria-label|title|placeholder)\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = attrRegex.exec(content)) !== null) {
    const attr = match[1];
    const val = match[2];
    errors.push(`${filePath}: Literal in attribute ${attr}="${val}". Must use translation hook.`);
  }

  // Check JSX text nodes: text between > and < that is not just whitespace and not inside {}
  // Simple regex for text node between tags: >([^<{}\n\r]*[^<>{}\s][^<{}\n\r]*)<
  const textNodeRegex = />([^<>{}\n\r]*[^<>{}\s][^<>{}\n\r]*)</g;
  while ((match = textNodeRegex.exec(content)) !== null) {
    const text = match[1].trim();
    // Exclude special characters or pure punctuation if any, but standard is no text literals
    errors.push(`${filePath}: Forbidden hardcoded JSX text literal "${text}". Use {t(...)}.`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Runs the full check on the app.
 * @param {string} [webSrcDir]
 * @param {string} [enFile]
 * @param {string} [viFile]
 */
export function runCheck(
  webSrcDir = path.resolve('apps/web/src'),
  enFile = path.resolve('apps/web/src/i18n/en.json'),
  viFile = path.resolve('apps/web/src/i18n/vi.json'),
) {
  const allErrors = [];

  const parity = checkDictionaryParity(enFile, viFile);
  if (!parity.ok) {
    allErrors.push(...parity.errors);
  }

  const files = getTsxFiles(webSrcDir);
  for (const file of files) {
    const res = checkTsxFile(file);
    if (!res.ok) {
      allErrors.push(...res.errors);
    }
  }

  return { ok: allErrors.length === 0, errors: allErrors };
}

// If executed directly
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const result = runCheck();
  if (!result.ok) {
    console.error('i18n check failed:');
    for (const err of result.errors) {
      console.error('  - ' + err);
    }
    process.exit(1);
  } else {
    console.log('i18n check passed: dictionaries in parity, no hardcoded JSX literals.');
    process.exit(0);
  }
}
