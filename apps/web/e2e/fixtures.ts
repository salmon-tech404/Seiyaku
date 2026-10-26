import { test as base, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getTestWalletInitScript } from './testWallet.js';

export interface ScreenshotEntry {
  filename: string;
  scenario: string;
  viewport: string;
  sha256: string;
}

const screenshotRecords: ScreenshotEntry[] = [];
const SCREENS_DIR = path.resolve('docs/screens/e2e');

export async function captureAndRecordScreenshot(
  page: Page,
  filename: string,
  scenario: string,
): Promise<string> {
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
  const filePath = path.join(SCREENS_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true });

  const buf = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const viewport = page.viewportSize();
  const vpStr = viewport ? `${viewport.width}x${viewport.height}` : 'unknown';

  screenshotRecords.push({
    filename,
    scenario,
    viewport: vpStr,
    sha256: hash,
  });

  return hash;
}

export function saveScreenshotManifest() {
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
  const manifestPath = path.join(SCREENS_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(screenshotRecords, null, 2));
  console.log(`Saved screenshot manifest (${screenshotRecords.length} images) to ${manifestPath}`);
}

export async function warpTimeOnAnvil(seconds: number, rpcUrl = 'http://127.0.0.1:8545') {
  await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'evm_increaseTime',
      params: [seconds],
    }),
  });
  await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'evm_mine',
      params: [],
    }),
  });
}

export async function checkA11y(page: Page, contextName: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  if (seriousOrCritical.length > 0) {
    console.error(`A11y Violations in ${contextName}:`, JSON.stringify(seriousOrCritical, null, 2));
  }

  expect(seriousOrCritical, `Zero serious or critical a11y violations in ${contextName}`).toEqual(
    [],
  );
  return results.violations;
}

export const test = base.extend<{
  testWallet: {
    setAccount: (addr: string) => Promise<void>;
    setChainId: (chainId: number) => Promise<void>;
    setRejectNext: (reject: boolean) => Promise<void>;
  };
}>({
  page: async ({ page }, use) => {
    // Inject test wallet provider script
    await page.addInitScript({ content: getTestWalletInitScript() });
    await use(page);
  },

  testWallet: async ({ page }, use) => {
    await use({
      setAccount: async (addr: string) => {
        if (page.url() === 'about:blank') {
          await page.addInitScript({ content: getTestWalletInitScript({ initialAccount: addr }) });
        } else {
          await page.evaluate((a) => {
            const tw = (window as unknown as { __testWallet?: { setAccount: (x: string) => void } })
              .__testWallet;
            if (tw) tw.setAccount(a);
          }, addr);
        }
      },
      setChainId: async (chainId: number) => {
        if (page.url() === 'about:blank') {
          await page.addInitScript({
            content: getTestWalletInitScript({ initialChainId: chainId }),
          });
        } else {
          await page.evaluate((cid) => {
            const tw = (window as unknown as { __testWallet?: { setChainId: (x: number) => void } })
              .__testWallet;
            if (tw) tw.setChainId(cid);
          }, chainId);
        }
      },
      setRejectNext: async (reject: boolean) => {
        await page.evaluate((r) => {
          const tw = (
            window as unknown as { __testWallet?: { setRejectNext: (x: boolean) => void } }
          ).__testWallet;
          if (tw) tw.setRejectNext(r);
        }, reject);
      },
    });
  },
});

export { expect };
