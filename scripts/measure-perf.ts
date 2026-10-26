import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface PerfMetrics {
  fcpMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  totalUncompressedBytes: number;
  totalGzipBytes: number;
  jsBytes: number;
  cssBytes: number;
  htmlBytes: number;
}

export async function measureThrottledMobile(url = 'http://127.0.0.1:4173'): Promise<PerfMetrics> {
  // 1. Calculate static bundle sizes
  const distDir = path.resolve('apps/web/dist');
  let totalUncompressedBytes = 0;
  let totalGzipBytes = 0;
  let jsBytes = 0;
  let cssBytes = 0;
  let htmlBytes = 0;

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(fullPath);
      } else if (ent.isFile()) {
        const buf = fs.readFileSync(fullPath);
        const gzipped = zlib.gzipSync(buf);
        totalUncompressedBytes += buf.length;
        totalGzipBytes += gzipped.length;
        if (ent.name.endsWith('.js')) jsBytes += buf.length;
        if (ent.name.endsWith('.css')) cssBytes += buf.length;
        if (ent.name.endsWith('.html')) htmlBytes += buf.length;
      }
    }
  }

  if (fs.existsSync(distDir)) {
    walk(distDir);
  }

  // 2. Launch browser with throttled mobile profile
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  // Throttling: Regular 4G / 3G simulation (150ms RTT, 1.6 Mbps down, 750 Kbps up)
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });

  // 4x CPU slowdown
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto(url, { waitUntil: 'load' });

  // Extract real paint and navigation timings
  const timing = await page.evaluate(() => {
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const paintEntries = performance.getEntriesByType('paint');
    const fcp = paintEntries.find((p) => p.name === 'first-contentful-paint');

    return {
      fcpMs: fcp ? Math.round(fcp.startTime) : 0,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      loadMs: nav ? Math.round(nav.loadEventEnd) : 0,
    };
  });

  await browser.close();

  return {
    ...timing,
    totalUncompressedBytes,
    totalGzipBytes,
    jsBytes,
    cssBytes,
    htmlBytes,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/measure-perf.ts')) {
  measureThrottledMobile().then((metrics) => {
    console.log('\n=== Throttled Mobile Performance Report ===');
    console.log(`Profile: Mobile (390x844), 4x CPU Throttling, 1.6 Mbps / 150ms RTT Network`);
    console.log(`First Contentful Paint (FCP):     ${metrics.fcpMs} ms`);
    console.log(`DOMContentLoaded (DCL):          ${metrics.domContentLoadedMs} ms`);
    console.log(`Load Event End:                  ${metrics.loadMs} ms`);
    console.log('----------------------------------------------------');
    console.log(
      `Total Uncompressed Bundle:       ${(metrics.totalUncompressedBytes / 1024).toFixed(2)} KB (budget: 800.00 KB)`,
    );
    console.log(
      `Total Gzip Transferred:          ${(metrics.totalGzipBytes / 1024).toFixed(2)} KB`,
    );
    console.log(`  - JavaScript:                  ${(metrics.jsBytes / 1024).toFixed(2)} KB`);
    console.log(`  - CSS:                         ${(metrics.cssBytes / 1024).toFixed(2)} KB`);
    console.log(`  - HTML:                        ${(metrics.htmlBytes / 1024).toFixed(2)} KB\n`);
  });
}
