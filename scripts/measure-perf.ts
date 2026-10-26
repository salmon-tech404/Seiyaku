import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface PerfMetrics {
  fcpMs: number | null;
  lcpMs: number | null;
  domContentLoadedMs: number | null;
  loadMs: number | null;
  totalUncompressedBytes: number;
  totalGzipBytes: number;
  jsBytes: number;
  cssBytes: number;
  htmlBytes: number;
}

export async function measureThrottledMobile(url = 'http://localhost:4173'): Promise<PerfMetrics> {
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

  // Register PerformanceObserver before any document scripts run
  await page.addInitScript(() => {
    (window as unknown as { __recordedFcp?: number; __recordedLcp?: number }).__recordedFcp =
      undefined;
    (window as unknown as { __recordedFcp?: number; __recordedLcp?: number }).__recordedLcp =
      undefined;

    try {
      const paintObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            (window as unknown as { __recordedFcp?: number }).__recordedFcp = entry.startTime;
          }
        }
      });
      paintObserver.observe({ type: 'paint', buffered: true });

      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        if (entries.length > 0) {
          (window as unknown as { __recordedLcp?: number }).__recordedLcp =
            entries[entries.length - 1]?.startTime;
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      // Ignore unsupported observers
    }
  });

  const cdp = await context.newCDPSession(page);

  // Throttling: Regular 4G simulation (150ms RTT, 1.6 Mbps down, 750 Kbps up)
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });

  // 4x CPU slowdown
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  // Extract real paint and navigation timings
  const timing = await page.evaluate(() => {
    const w = window as unknown as { __recordedFcp?: number; __recordedLcp?: number };
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];

    let fcpVal = w.__recordedFcp;
    if (fcpVal === undefined) {
      const paintEntries = performance.getEntriesByType('paint');
      const found = paintEntries.find((p) => p.name === 'first-contentful-paint');
      if (found) fcpVal = found.startTime;
    }

    const dclVal = nav ? nav.domContentLoadedEventEnd : undefined;
    const loadVal = nav ? nav.loadEventEnd : undefined;

    return {
      fcpMs: fcpVal !== undefined && fcpVal > 0 ? Math.round(fcpVal) : null,
      lcpMs:
        w.__recordedLcp !== undefined && w.__recordedLcp > 0 ? Math.round(w.__recordedLcp) : null,
      domContentLoadedMs: dclVal !== undefined && dclVal > 0 ? Math.round(dclVal) : null,
      loadMs: loadVal !== undefined && loadVal > 0 ? Math.round(loadVal) : null,
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
    const fmt = (v: number | null) => (v !== null ? `${v} ms` : 'NOT MEASURED');

    console.log('\n=== Throttled Mobile Performance Report ===');
    console.log(`Profile: Mobile (390x844), 4x CPU Throttling, 1.6 Mbps / 150ms RTT Network`);
    console.log(`First Contentful Paint (FCP):     ${fmt(metrics.fcpMs)}`);
    console.log(`Largest Contentful Paint (LCP):   ${fmt(metrics.lcpMs)}`);
    console.log(`DOMContentLoaded (DCL):          ${fmt(metrics.domContentLoadedMs)}`);
    console.log(`Load Event End:                  ${fmt(metrics.loadMs)}`);
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
