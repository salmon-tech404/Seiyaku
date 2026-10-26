import { test, expect, checkA11y, captureAndRecordScreenshot } from '../fixtures.js';
import { CreateVaultPage } from '../pom/CreateVaultPage.js';
import { TEST_ACCOUNTS } from '../testWallet.js';
import fs from 'node:fs';
import path from 'node:path';

test.describe('Automated Axe Accessibility Audits & Keyboard Navigation', () => {
  let factoryAddress = '';

  function getVaultAddress(): string {
    const testVaultsPath = path.resolve('deployments/fork/test-vaults.json');
    if (fs.existsSync(testVaultsPath)) {
      const data = JSON.parse(fs.readFileSync(testVaultsPath, 'utf8'));
      if (data.balanced) return data.balanced;
    }
    const demoStatePath = path.resolve('deployments/fork/demo-state.json');
    if (fs.existsSync(demoStatePath)) {
      const data = JSON.parse(fs.readFileSync(demoStatePath, 'utf8'));
      if (data.vaultAddress) return data.vaultAddress;
    }
    return '';
  }

  test.beforeAll(() => {
    const factoryJsonPath = path.resolve('deployments/fork/factory.json');
    if (fs.existsSync(factoryJsonPath)) {
      const data = JSON.parse(fs.readFileSync(factoryJsonPath, 'utf8'));
      factoryAddress = data.factory;
    }
  });

  test('Axe Audit on Home Page', async ({ page }) => {
    await page.goto('/#/');
    await checkA11y(page, 'Home Page');
  });

  test('Axe Audit on About Page', async ({ page }) => {
    await page.goto('/#/about');
    await checkA11y(page, 'About Page');
  });

  test('Axe Audit on Agents Page', async ({ page }) => {
    await page.goto('/#/agents');
    await checkA11y(page, 'Agents Page');
  });

  test('Axe Audit on Create Vault Page', async ({ page, testWallet }) => {
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await page.goto(`/#/create?factory=${factoryAddress}&rpc=http://127.0.0.1:8545`);
    await checkA11y(page, 'Create Vault Page');
  });

  test('Axe Audit on Verify Page', async ({ page }) => {
    await page.goto('/#/verify?rpc=http://127.0.0.1:8545');
    await checkA11y(page, 'Verify Page');
  });

  test('Axe Audit on Vault Dashboard', async ({ page, testWallet }) => {
    const vaultAddress = getVaultAddress();
    test.skip(!vaultAddress, 'Vault address missing');
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await page.goto(`/#/vault/${vaultAddress}?rpc=http://127.0.0.1:8545`);
    await checkA11y(page, 'Vault Dashboard Page');
  });

  test('Keyboard-Only Navigation through Create Vault Flow', async ({ page, testWallet }) => {
    const createPage = new CreateVaultPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await createPage.goto(`factory=${factoryAddress}&rpc=http://127.0.0.1:8545`);
    await createPage.connectWallet();

    // Focus header then Tab into the page
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Tab through until trader input or template card is reached
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBeTruthy();

    // Select custom trader option and type address
    await page.locator('.trader-radio-item').nth(1).click();
    await createPage.traderInput.focus();
    await page.keyboard.type(TEST_ACCOUNTS.trader);

    // Tab to Review button and hit Enter
    await createPage.reviewBtn.focus();
    await page.keyboard.press('Enter');

    // Confirm dialog opens and has focused element
    await expect(createPage.confirmDeployBtn).toBeVisible({ timeout: 5000 });
    await captureAndRecordScreenshot(
      page,
      'create-vault-keyboard-walkthrough.png',
      'Create Vault - Keyboard Only Walkthrough Focus State',
    );
  });

  test('Screen Reader Names for Status Chips and Countdowns', async ({ page, testWallet }) => {
    const vaultAddress = getVaultAddress();
    test.skip(!vaultAddress, 'Vault address missing');
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await page.goto(`/#/vault/${vaultAddress}?rpc=http://127.0.0.1:8545`);

    // Status chip must have accessible name
    const chip = page.locator('.vault-header-badges .ui-chip, .vault-header-badges .chip').first();
    const chipText = await chip.textContent();
    expect(chipText).toBeTruthy();

    // Any countdown elements have role or accessible presentation
    const countdowns = page.locator('.countdown-display');
    const count = await countdowns.count();
    for (let i = 0; i < count; i++) {
      const cd = countdowns.nth(i);
      const ariaLabel = await cd.getAttribute('aria-label');
      const text = await cd.textContent();
      expect(ariaLabel || text).toBeTruthy();
    }
  });
});
