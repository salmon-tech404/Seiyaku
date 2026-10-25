import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runCheck, checkDictionaryParity, checkTsxFile } from './check-i18n.mjs';

function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-test-'));

  try {
    // 1. Passing fixture
    const passEn = path.join(tmpDir, 'en.json');
    const passVi = path.join(tmpDir, 'vi.json');
    fs.writeFileSync(passEn, JSON.stringify({ 'hello.world': 'Hello', 'app.title': 'App' }));
    fs.writeFileSync(
      passVi,
      JSON.stringify({ 'hello.world': 'Xin chao', 'app.title': 'Ung dung' }),
    );

    const passSrc = path.join(tmpDir, 'src-pass');
    fs.mkdirSync(passSrc, { recursive: true });
    const passTsx = path.join(passSrc, 'Component.tsx');
    fs.writeFileSync(
      passTsx,
      `export function Component() {
  return (
    <div aria-label={t('label')}>
      <h1>{t('app.title')}</h1>
    </div>
  );
}`,
    );

    const passResult = runCheck(passSrc, passEn, passVi);
    if (!passResult.ok) {
      throw new Error(`Expected passResult to be ok, got errors: ${passResult.errors.join(', ')}`);
    }

    // 2. Failing fixture - key mismatch
    const failVi = path.join(tmpDir, 'vi-fail.json');
    fs.writeFileSync(failVi, JSON.stringify({ 'hello.world': 'Xin chao' })); // missing app.title
    const parityFail = checkDictionaryParity(passEn, failVi);
    if (parityFail.ok || parityFail.errors.length === 0) {
      throw new Error('Expected dictionary parity check to fail on missing key');
    }

    // 3. Failing fixture - hardcoded JSX text literal
    const failSrcText = path.join(tmpDir, 'src-fail-text');
    fs.mkdirSync(failSrcText, { recursive: true });
    const failTsx1 = path.join(failSrcText, 'BadText.tsx');
    fs.writeFileSync(
      failTsx1,
      `export function BadText() {
  return <div>Hardcoded text</div>;
}`,
    );
    const failTextRes = checkTsxFile(failTsx1);
    if (failTextRes.ok || failTextRes.errors.length === 0) {
      throw new Error('Expected checkTsxFile to fail on hardcoded JSX text');
    }

    // 4. Failing fixture - hardcoded attribute literal
    const failSrcAttr = path.join(tmpDir, 'src-fail-attr');
    fs.mkdirSync(failSrcAttr, { recursive: true });
    const failTsx2 = path.join(failSrcAttr, 'BadAttr.tsx');
    fs.writeFileSync(
      failTsx2,
      `export function BadAttr() {
  return <input placeholder="Enter name" />;
}`,
    );
    const failAttrRes = checkTsxFile(failTsx2);
    if (failAttrRes.ok || failAttrRes.errors.length === 0) {
      throw new Error('Expected checkTsxFile to fail on hardcoded attribute literal');
    }

    console.log('All check-i18n fixture tests passed successfully.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests();
