import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { xLayerChain } from '../apps/web/src/chain/config.js';

export function checkHeaders(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const headersPath = path.resolve('apps/web/public/_headers');
  const indexHtmlPath = path.resolve('apps/web/index.html');

  if (!fs.existsSync(headersPath)) {
    return { ok: false, errors: [`_headers file missing at ${headersPath}`] };
  }
  if (!fs.existsSync(indexHtmlPath)) {
    return { ok: false, errors: [`index.html missing at ${indexHtmlPath}`] };
  }

  const headersContent = fs.readFileSync(headersPath, 'utf8');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  // 1. Verify inline script hash
  const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    const inlineHash =
      'sha256-' + crypto.createHash('sha256').update(scriptMatch[1]).digest('base64');
    if (!headersContent.includes(inlineHash)) {
      errors.push(
        `Content-Security-Policy script-src missing current index.html inline script hash: '${inlineHash}'`,
      );
    }
  }

  // 2. Verify all RPC endpoints from xLayerChain are included in connect-src
  const rpcs = [
    ...(xLayerChain.rpcUrls.default.http || []),
    ...(xLayerChain.rpcUrls.public.http || []),
  ];
  for (const rpc of rpcs) {
    if (!headersContent.includes(rpc)) {
      errors.push(
        `Content-Security-Policy connect-src missing configured chain RPC endpoint: ${rpc}`,
      );
    }
  }

  // 3. Verify block explorer url host is included in connect-src
  const explorerUrl = xLayerChain.blockExplorers?.default?.url;
  if (explorerUrl) {
    const host = new URL(explorerUrl).origin;
    if (!headersContent.includes(host)) {
      errors.push(
        `Content-Security-Policy connect-src missing configured explorer origin: ${host}`,
      );
    }
  }

  // 4. Verify required security headers are present
  const requiredDirectives = [
    'Content-Security-Policy:',
    'X-Content-Type-Options: nosniff',
    'X-Frame-Options: DENY',
    'Referrer-Policy: no-referrer',
    'Permissions-Policy:',
    "frame-ancestors 'none'",
    'camera=()',
    'microphone=()',
    'geolocation=()',
  ];

  for (const directive of requiredDirectives) {
    if (!headersContent.includes(directive)) {
      errors.push(`_headers missing required security directive: "${directive}"`);
    }
  }

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/check-headers.ts')) {
  const result = checkHeaders();
  if (!result.ok) {
    console.error('check-headers FAILED with errors:');
    for (const err of result.errors) {
      console.error('  - ' + err);
    }
    process.exit(1);
  }
  console.log('PASSED: Cloudflare Pages _headers matches chain config and security policies.');
}
