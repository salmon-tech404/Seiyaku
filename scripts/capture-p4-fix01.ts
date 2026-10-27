/**
 * Captures the screenshots for P4-FIX01 (Agents page and gate diagram) with the production headers.
 * Needs `npm run build:static` first. No wallet and no fork: pages are shown as a visitor sees them.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { loadProductionHeaders } from './lib/headers.mjs';

const OUT = path.resolve('docs/screens/p4-fix01');
const DIST = path.resolve('apps/web/dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const headers = loadProductionHeaders();
const server = http.createServer((req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
  const file = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);
  const target =
    fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, 'index.html');
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(target)] ?? 'application/octet-stream',
    ...headers,
  });
  fs.createReadStream(target).pipe(res);
});

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise<void>((r) => server.listen(4190, '127.0.0.1', () => r()));
  const browser = await chromium.launch();
  const manifest: {
    filename: string;
    scenario: string;
    viewport: string;
    theme: string;
    sha256: string;
  }[] = [];
  const shots: {
    scenario: string;
    hash: string;
    viewport: [number, number];
    vp: string;
    theme: 'dark' | 'light';
    action?: 'fit';
  }[] = [];
  for (const theme of ['dark', 'light'] as const) {
    shots.push({
      scenario: 'agents',
      hash: '#/agents',
      viewport: [1280, 900],
      vp: 'desktop',
      theme,
    });
    shots.push({ scenario: 'agents', hash: '#/agents', viewport: [390, 844], vp: 'mobile', theme });
  }
  shots.push({
    scenario: 'verify-default',
    hash: '#/verify',
    viewport: [1280, 900],
    vp: 'desktop',
    theme: 'dark',
  });
  shots.push({
    scenario: 'verify-fit',
    hash: '#/verify',
    viewport: [1280, 900],
    vp: 'desktop',
    theme: 'dark',
    action: 'fit',
  });

  for (const s of shots) {
    const context = await browser.newContext({
      viewport: { width: s.viewport[0], height: s.viewport[1] },
      colorScheme: s.theme,
    });
    const page = await context.newPage();
    await page.addInitScript((theme) => {
      try {
        localStorage.setItem('seiyaku_theme', theme);
      } catch {
        /* storage may be blocked */
      }
    }, s.theme);
    await page.goto(`http://127.0.0.1:4190/${s.hash}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    if (s.action === 'fit') {
      await page.getByRole('button', { name: /^Fit$/ }).click();
      await page.waitForTimeout(300);
    }
    const filename = `${s.scenario}-${s.vp}-${s.theme}.png`;
    await page.screenshot({ path: path.join(OUT, filename), fullPage: true });
    const sha256 = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(OUT, filename)))
      .digest('hex');
    manifest.push({
      filename,
      scenario: s.scenario,
      viewport: `${s.viewport[0]}x${s.viewport[1]}`,
      theme: s.theme,
      sha256,
    });
    console.log(`[Captured] ${filename} ${sha256.slice(0, 12)}`);
    await context.close();
  }
  await browser.close();
  server.close();
  const hashes = new Set(manifest.map((m) => m.sha256));
  if (hashes.size !== manifest.length) throw new Error('Two screenshots have the same hash');
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  server.close();
  process.exit(1);
});
