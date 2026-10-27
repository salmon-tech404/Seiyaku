import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadProductionHeaders } from './lib/headers.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const distDir = path.resolve('apps/web/dist');
const port = 4173;
// Same headers as production; only the local fork RPC origins are added for tests.
const securityHeaders = loadProductionHeaders({
  extraConnectSrc: ['http://127.0.0.1:*', 'http://localhost:*'],
});

const server = http.createServer((req, res) => {
  const urlPath = req.url?.split('?')[0] || '/';
  const cleanPath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(distDir, cleanPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ...securityHeaders,
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...securityHeaders,
      });
      fs.createReadStream(indexPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Static server serving ${distDir} on http://127.0.0.1:${port}`);
});
