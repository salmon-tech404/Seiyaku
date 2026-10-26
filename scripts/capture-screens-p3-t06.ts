/**
 * scripts/capture-screens-p3-t06.ts
 * Captures real screenshots for Home, About, and Agents pages using runChromeAsync.
 * Widths: 390px (mobile) and 1280px (desktop)
 * Themes: dark and light
 * Locales: en and vi
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const WEB_PORT = 4178;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIST_DIR = path.resolve('apps/web/dist');
const OUT_DIR = path.resolve('docs/screens/p3-t06');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function startWebServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    let filePath = path.join(DIST_DIR, (req.url || '').split('?')[0] || '');
    if (filePath.endsWith(path.sep) || !path.extname(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(WEB_PORT, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function runChromeAsync(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(CHROME_PATH, args, { windowsHide: true });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Chrome exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log('[1/3] Building static web app...');
  const { execSync } = await import('node:child_process');
  execSync('npm run build:web', { stdio: 'inherit' });

  console.log(`[2/3] Starting web server on http://127.0.0.1:${WEB_PORT}...`);
  const server = await startWebServer();

  const baseUrl = `http://127.0.0.1:${WEB_PORT}/`;

  const targets = [
    // Home
    {
      route: '#/',
      width: 1280,
      height: 1600,
      theme: 'dark',
      lang: 'en',
      out: 'home-1280-dark-en.png',
    },
    {
      route: '#/',
      width: 1280,
      height: 1600,
      theme: 'light',
      lang: 'vi',
      out: 'home-1280-light-vi.png',
    },
    {
      route: '#/',
      width: 390,
      height: 2000,
      theme: 'dark',
      lang: 'en',
      out: 'home-390-dark-en.png',
    },
    {
      route: '#/',
      width: 390,
      height: 2000,
      theme: 'light',
      lang: 'vi',
      out: 'home-390-light-vi.png',
    },
    // About
    {
      route: '#/about',
      width: 1280,
      height: 1800,
      theme: 'dark',
      lang: 'en',
      out: 'about-1280-dark-en.png',
    },
    {
      route: '#/about',
      width: 1280,
      height: 1800,
      theme: 'light',
      lang: 'vi',
      out: 'about-1280-light-vi.png',
    },
    {
      route: '#/about',
      width: 390,
      height: 2600,
      theme: 'dark',
      lang: 'en',
      out: 'about-390-dark-en.png',
    },
    {
      route: '#/about',
      width: 390,
      height: 2600,
      theme: 'light',
      lang: 'vi',
      out: 'about-390-light-vi.png',
    },
    // Agents
    {
      route: '#/agents',
      width: 1280,
      height: 1600,
      theme: 'dark',
      lang: 'en',
      out: 'agents-1280-dark-en.png',
    },
    {
      route: '#/agents',
      width: 1280,
      height: 1600,
      theme: 'light',
      lang: 'vi',
      out: 'agents-1280-light-vi.png',
    },
    {
      route: '#/agents',
      width: 390,
      height: 2200,
      theme: 'dark',
      lang: 'en',
      out: 'agents-390-dark-en.png',
    },
    {
      route: '#/agents',
      width: 390,
      height: 2200,
      theme: 'light',
      lang: 'vi',
      out: 'agents-390-light-vi.png',
    },
  ];

  console.log(`[3/3] Capturing ${targets.length} screenshots via Chrome headless...`);

  for (const t of targets) {
    const outFile = path.join(OUT_DIR, t.out);
    const targetUrl = `${baseUrl}?theme=${t.theme}&lang=${t.lang}${t.route}`;
    await runChromeAsync([
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--virtual-time-budget=2000',
      '--user-data-dir=C:\\temp\\cshot-p3-t06',
      `--window-size=${t.width},${t.height}`,
      `--screenshot=${outFile}`,
      targetUrl,
    ]);
    const stat = fs.statSync(outFile);
    console.log(`  Captured ${t.out} (${(stat.size / 1024).toFixed(1)} KB)`);
  }

  server.close();
  console.log('All P3-T06 screenshots captured successfully!');
}

main().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
