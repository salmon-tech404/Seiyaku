/**
 * scripts/capture-screens-p3-t03.mjs
 * Captures real screenshots of the Create Vault flow using headless Chrome.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIST_DIR = path.resolve('apps/web/dist');
const PORT = 4174;

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

  const outputDir = path.resolve('docs/screens/p3-t03');
  fs.mkdirSync(outputDir, { recursive: true });

  const server = await startServer();
  console.log(`Preview server running at http://127.0.0.1:${PORT}`);

  const mockFactory = '0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB';

  const configs = [
    // 1. Empty / default form (Balanced selected)
    {
      name: 'create-390-dark-en.png',
      width: 390,
      height: 1400,
      url: `http://127.0.0.1:${PORT}/#/create?factory=${mockFactory}&theme=dark&lang=en`,
    },
    {
      name: 'create-390-light-vi.png',
      width: 390,
      height: 1400,
      url: `http://127.0.0.1:${PORT}/#/create?factory=${mockFactory}&theme=light&lang=vi`,
    },
    {
      name: 'create-1280-dark-en.png',
      width: 1280,
      height: 1000,
      url: `http://127.0.0.1:${PORT}/#/create?factory=${mockFactory}&theme=dark&lang=en`,
    },
    {
      name: 'create-1280-light-vi.png',
      width: 1280,
      height: 1000,
      url: `http://127.0.0.1:${PORT}/#/create?factory=${mockFactory}&theme=light&lang=vi`,
    },

    // 2. Not deployed state (when factory is missing)
    {
      name: 'create-not-deployed-1280.png',
      width: 1280,
      height: 800,
      url: `http://127.0.0.1:${PORT}/#/create?theme=dark&lang=en`,
    },

    // 3. Demo mode banner active
    {
      name: 'create-demo-mode-1280.png',
      width: 1280,
      height: 1000,
      url: `http://127.0.0.1:${PORT}/#/create?factory=${mockFactory}&demo=1&theme=dark&lang=en`,
    },
  ];

  for (const cfg of configs) {
    const outPath = path.join(outputDir, cfg.name);

    console.log(`Capturing ${cfg.name} (${cfg.width}x${cfg.height})...`);
    await runChromeAsync([
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--user-data-dir=C:\\temp\\cshot-p3-t03',
      `--window-size=${cfg.width},${cfg.height}`,
      `--screenshot=${outPath}`,
      cfg.url,
    ]);

    const stat = fs.statSync(outPath);
    console.log(`  Saved ${cfg.name} (${(stat.size / 1024).toFixed(1)} KB)`);
  }

  server.close();
  console.log('All P3-T03 screenshots captured successfully.');
}

captureScreens().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
