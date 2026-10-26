/**
 * scripts/capture-screens.mjs
 * Captures real screenshots of the web app using headless Chrome asynchronously.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIST_DIR = path.resolve('apps/web/dist');
const PORT = 4173;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function startServer() {
  const server = http.createServer((req, res) => {
    let filePath = path.join(DIST_DIR, req.url.split('?')[0]);
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
    server.listen(PORT, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function runChromeAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(CHROME_PATH, args, { windowsHide: true });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Chrome exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function captureScreens() {
  if (!fs.existsSync(CHROME_PATH)) {
    console.error(`Chrome executable not found at ${CHROME_PATH}`);
    process.exit(1);
  }

  const outputDir = path.resolve('docs/screens/p3-t01');
  fs.mkdirSync(outputDir, { recursive: true });

  const server = await startServer();
  console.log(`Preview server running at http://127.0.0.1:${PORT}`);

  const configs = [
    // 390 px mobile
    { name: 'styleguide-390-dark-en.png', width: 390, height: 1600, theme: 'dark', lang: 'en' },
    { name: 'styleguide-390-dark-vi.png', width: 390, height: 1600, theme: 'dark', lang: 'vi' },
    { name: 'styleguide-390-light-en.png', width: 390, height: 1600, theme: 'light', lang: 'en' },
    { name: 'styleguide-390-light-vi.png', width: 390, height: 1600, theme: 'light', lang: 'vi' },
    // 1280 px desktop
    { name: 'styleguide-1280-dark-en.png', width: 1280, height: 1400, theme: 'dark', lang: 'en' },
    { name: 'styleguide-1280-dark-vi.png', width: 1280, height: 1400, theme: 'dark', lang: 'vi' },
    { name: 'styleguide-1280-light-en.png', width: 1280, height: 1400, theme: 'light', lang: 'en' },
    { name: 'styleguide-1280-light-vi.png', width: 1280, height: 1400, theme: 'light', lang: 'vi' },
  ];

  for (const cfg of configs) {
    const outPath = path.join(outputDir, cfg.name);
    const url = `http://127.0.0.1:${PORT}/#/styleguide?theme=${cfg.theme}&lang=${cfg.lang}`;

    console.log(`Capturing ${cfg.name} (${cfg.width}x${cfg.height})...`);
    await runChromeAsync([
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--user-data-dir=C:\\temp\\cshot',
      `--window-size=${cfg.width},${cfg.height}`,
      `--screenshot=${outPath}`,
      url,
    ]);

    const stat = fs.statSync(outPath);
    console.log(`  Saved ${cfg.name} (${(stat.size / 1024).toFixed(1)} KB)`);
  }

  server.close();
  console.log('All screenshots captured successfully.');
}

captureScreens().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
