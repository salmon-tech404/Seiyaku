import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads the production security headers from the Cloudflare Pages `_headers` file so that test servers
 * apply exactly what production applies. `extraConnectSrc` is added to `connect-src` for tests that
 * talk to a local fork; the production file itself never contains local addresses.
 */
export function loadProductionHeaders({ extraConnectSrc = [] } = {}) {
  const file = path.resolve('apps/web/public/_headers');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const headers = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('/') || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const csp = headers['Content-Security-Policy'];
  if (csp && extraConnectSrc.length > 0) {
    headers['Content-Security-Policy'] = csp.replace(
      /connect-src ([^;]*);/,
      (_m, sources) => `connect-src ${sources} ${extraConnectSrc.join(' ')};`,
    );
  }
  return headers;
}
