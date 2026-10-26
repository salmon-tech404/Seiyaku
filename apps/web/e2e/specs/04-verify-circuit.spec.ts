import { test, expect, captureAndRecordScreenshot } from '../fixtures.js';
import { VerifyPage } from '../pom/VerifyPage.js';
import { TEST_ACCOUNTS } from '../testWallet.js';
import fs from 'node:fs';
import path from 'node:path';

function getActiveFactory(): string {
  for (const p of [
    path.resolve('deployments/fork/factory.json'),
    path.resolve('deployments/fork/demo-factory.json'),
  ]) {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data.factory) return data.factory;
      if (data.factoryAddress) return data.factoryAddress;
    }
  }
  return '0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB';
}

test.describe('Verify Page and Netlist Circuit', () => {
  test('Fresh Deployment Shows PASS and 17 NAND Gate Diagram', async ({ page, testWallet }) => {
    const verifyPage = new VerifyPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    const factory = getActiveFactory();
    await verifyPage.goto(`address=${factory}&rpc=http://127.0.0.1:8545`);

    // Verify overall status
    await expect(verifyPage.overallBadge).toContainText(/MATCH|KHỚP|PASS|HỢP LỆ/i, {
      timeout: 15000,
    });

    // Verify 7 security pins are checked
    await expect(verifyPage.pinItems).toHaveCount(7);

    // Verify pure SVG gate diagram exists and contains 17 NAND gates
    await expect(verifyPage.gateDiagramSvg).toBeVisible();
    const gateCount = await page.locator('.node-gate-high, .node-gate-low').count();
    expect(gateCount).toBe(17);

    await captureAndRecordScreenshot(
      page,
      'verify-page-pass-dag.png',
      'Verify Page - PASS Status and 17 NAND Gates (Desktop)',
    );

    // Capture mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await captureAndRecordScreenshot(
      page,
      'verify-page-mobile.png',
      'Verify Page Mobile Viewport (390x844)',
    );
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('Execute 512-Case Truth Table Runner', async ({ page, testWallet }) => {
    const verifyPage = new VerifyPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await verifyPage.goto(`address=${getActiveFactory()}&rpc=http://127.0.0.1:8545`);

    // Run 512 cases
    await verifyPage.run512Cases();

    await captureAndRecordScreenshot(
      page,
      'verify-page-512-cases.png',
      'Verify Page - 512 Case Truth Table Runner Complete',
    );
  });
});
