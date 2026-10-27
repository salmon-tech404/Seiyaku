import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { loadProductionHeaders } from './lib/headers.mjs';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Exactly the production headers (read from the `_headers` file); only the local origins are added for the test.
const SECURITY_HEADERS: Record<string, string> = loadProductionHeaders({
  extraConnectSrc: ['http://127.0.0.1:*', 'http://localhost:*'],
});

function createSubpathServer(distDir: string, subpathPrefix: string) {
  // e.g. subpathPrefix = '/some/sub/path/' or '/'
  const normalizedPrefix = subpathPrefix.endsWith('/') ? subpathPrefix : subpathPrefix + '/';

  return http.createServer((req, res) => {
    let reqUrl = req.url || '/';
    // Strip hash or query
    const qIndex = reqUrl.indexOf('?');
    if (qIndex !== -1) reqUrl = reqUrl.slice(0, qIndex);

    // Apply security headers
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(k, v);
    }

    if (!reqUrl.startsWith(normalizedPrefix)) {
      // Redirect or 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: outside prefix ${normalizedPrefix}`);
      return;
    }

    const rel = reqUrl.slice(normalizedPrefix.length);
    let filePath = path.join(distDir, rel);

    if (rel === '' || rel.endsWith('/')) {
      filePath = path.join(distDir, 'index.html');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // SPA Fallback
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server error');
    }
  });
}

export async function runBasePathTest(): Promise<{ ok: boolean; errors: string[] }> {
  const distDir = path.resolve('apps/web/dist');
  if (!fs.existsSync(distDir)) {
    return { ok: false, errors: ['apps/web/dist does not exist. Run build first.'] };
  }

  const errors: string[] = [];
  const routes = ['#/', '#/create', '#/verify', '#/agents', '#/about', '#/styleguide'];

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });

    // Test both Root ("/") and Subpath ("/some/sub/path/")
    const testCases = [
      { name: 'Root Base Path', port: 5181, prefix: '/' },
      { name: 'Subpath Base Path', port: 5182, prefix: '/some/sub/path/' },
    ];

    for (const tc of testCases) {
      const server = createSubpathServer(distDir, tc.prefix);
      await new Promise<void>((resolve) => server.listen(tc.port, '127.0.0.1', () => resolve()));

      const page = await browser.newPage();
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          pageErrors.push(`[Console Error] ${msg.text()}`);
        }
      });

      page.on('requestfailed', (req) => {
        failedRequests.push(`[Request Failed] ${req.url()} (${req.failure()?.errorText})`);
      });

      page.on('response', (res) => {
        if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
          failedRequests.push(`[HTTP ${res.status()}] ${res.url()}`);
        }
      });

      for (const r of routes) {
        const fullUrl = `http://127.0.0.1:${tc.port}${tc.prefix}${r}`;
        try {
          await page.goto(fullUrl, { waitUntil: 'load', timeout: 5000 });
          // Wait for lazy chunk or react hydration
          await page.waitForTimeout(300);
        } catch (e) {
          pageErrors.push(`Navigation failed for ${fullUrl}: ${String(e)}`);
        }
      }

      await page.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));

      if (pageErrors.length > 0) {
        errors.push(`${tc.name} encountered console/page errors:\n  ${pageErrors.join('\n  ')}`);
      }
      if (failedRequests.length > 0) {
        errors.push(
          `${tc.name} encountered failed requests / 404s:\n  ${failedRequests.join('\n  ')}`,
        );
      }
    }
  } catch (err) {
    errors.push(`Base path test exception: ${String(err)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return { ok: errors.length === 0, errors };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve('scripts/test-base-path.ts')
) {
  runBasePathTest().then((res) => {
    if (!res.ok) {
      console.error('test-base-path FAILED:');
      for (const e of res.errors) console.error(e);
      process.exit(1);
    }
    console.log(
      'PASSED: Base path test verified on both root ("/") and subpath ("/some/sub/path/") without 404s or console errors.',
    );
  });
}
