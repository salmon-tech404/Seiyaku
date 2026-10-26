import { test, expect, captureAndRecordScreenshot } from '../fixtures.js';
import { CreateVaultPage } from '../pom/CreateVaultPage.js';
import { TEST_ACCOUNTS } from '../testWallet.js';
import fs from 'node:fs';
import path from 'node:path';

test.describe('Create Vault Scenarios across Templates', () => {
  let factoryAddress = '';

  test.beforeAll(() => {
    const factoryJsonPath = path.resolve('deployments/fork/factory.json');
    if (fs.existsSync(factoryJsonPath)) {
      const data = JSON.parse(fs.readFileSync(factoryJsonPath, 'utf8'));
      factoryAddress = data.factory;
    }
  });

  test('Create Balanced Vault in Vietnamese (Mobile Viewport)', async ({ page, testWallet }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const createPage = new CreateVaultPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await createPage.goto(`factory=${factoryAddress}&rpc=http://127.0.0.1:8545`);
    await createPage.connectWallet();
    await createPage.setLanguage('vi');

    await captureAndRecordScreenshot(
      page,
      'create-balanced-mobile-vi.png',
      'Create Vault - Balanced Template (Vietnamese Mobile 390x844)',
    );

    const vaultAddr = await createPage.createVault({
      template: 'balanced',
      trader: TEST_ACCOUNTS.trader,
    });
    expect(vaultAddr).toMatch(/^0x[a-fA-F0-9]{40}$/);

    // Save for subsequent tests
    const testVaultsPath = path.resolve('deployments/fork/test-vaults.json');
    const existing = fs.existsSync(testVaultsPath)
      ? JSON.parse(fs.readFileSync(testVaultsPath, 'utf8'))
      : {};
    existing.balanced = vaultAddr;
    fs.writeFileSync(testVaultsPath, JSON.stringify(existing, null, 2));

    await captureAndRecordScreenshot(
      page,
      'create-balanced-mobile-vi-created.png',
      'Balanced Vault Created in Vietnamese (Mobile 390x844)',
    );
  });

  test('Create Balanced Vault in English (Desktop Viewport)', async ({ page, testWallet }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const createPage = new CreateVaultPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await createPage.goto(`factory=${factoryAddress}&rpc=http://127.0.0.1:8545`);
    await createPage.connectWallet();
    await createPage.setLanguage('en');

    await captureAndRecordScreenshot(
      page,
      'create-balanced-en.png',
      'Create Vault - Balanced Template (English)',
    );

    const vaultAddr = await createPage.createVault({
      template: 'balanced',
      trader: TEST_ACCOUNTS.trader,
    });
    expect(vaultAddr).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  test('Create Careful Vault', async ({ page, testWallet }) => {
    const createPage = new CreateVaultPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await createPage.goto(`factory=${factoryAddress}&rpc=http://127.0.0.1:8545`);
    await createPage.connectWallet();

    await createPage.selectTemplate('careful');
    await captureAndRecordScreenshot(page, 'create-careful.png', 'Create Vault - Careful Template');

    const vaultAddr = await createPage.createVault({
      template: 'careful',
      trader: TEST_ACCOUNTS.trader,
    });
    expect(vaultAddr).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  test('Create Agent Safe Vault', async ({ page, testWallet }) => {
    const createPage = new CreateVaultPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await createPage.goto(`factory=${factoryAddress}&rpc=http://127.0.0.1:8545`);
    await createPage.connectWallet();

    await createPage.selectTemplate('agent_safe');
    await captureAndRecordScreenshot(
      page,
      'create-agent-safe.png',
      'Create Vault - Agent Safe Template',
    );

    const vaultAddr = await createPage.createVault({
      template: 'agent_safe',
      trader: TEST_ACCOUNTS.trader,
    });
    expect(vaultAddr).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});
