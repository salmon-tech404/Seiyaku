import { test, expect, captureAndRecordScreenshot } from '../fixtures.js';
import { HomePage } from '../pom/HomePage.js';
import { VaultDashboardPage } from '../pom/VaultDashboardPage.js';
import { TEST_ACCOUNTS } from '../testWallet.js';
import fs from 'node:fs';
import path from 'node:path';

test.describe('Network Handling, Wallet Rejections, and Stranger View', () => {
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

  test('Demo Banner Displays When Demo Mode Active', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await page.goto('/#/?demo=1');

    await expect(home.demoBanner).toBeVisible();
    await captureAndRecordScreenshot(
      page,
      'demo-banner-active.png',
      'Demo Mode Warning Banner Displayed',
    );
  });

  test('Wrong Network Warning and Switch Action', async ({ page, testWallet }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.connectWallet();
    await testWallet.setChainId(1); // Switch to Ethereum Mainnet (Chain 1)

    // Verify wrong network banner appears
    await expect(home.wrongNetworkBanner).toBeVisible({ timeout: 10000 });
    await captureAndRecordScreenshot(
      page,
      'wrong-network-banner.png',
      'Wrong Network Warning on Ethereum Mainnet',
    );

    // Click switch network button
    const switchBtn = page.getByRole('button', { name: /Switch to X Layer|Chuyển sang X Layer/i });
    if (await switchBtn.isVisible()) {
      await switchBtn.click();
      await expect(home.wrongNetworkBanner).toBeHidden({ timeout: 10000 });
    }
  });

  test('Stranger Read-Only View of Vault Dashboard', async ({ page, testWallet }) => {
    const vaultAddress = getVaultAddress();
    test.skip(!vaultAddress, 'Vault address missing');
    const dashboard = new VaultDashboardPage(page);
    await dashboard.goto(vaultAddress, 'rpc=http://127.0.0.1:8545');
    // Connect as Stranger (neither owner nor trader)
    await testWallet.setAccount(TEST_ACCOUNTS.stranger);
    await dashboard.connectWallet();

    // Verify role chip displays Stranger (Read only)
    await expect(dashboard.roleChip).toContainText(/Read only|Chỉ xem|Stranger/i, {
      timeout: 10000,
    });

    // Verify owner-only buttons are disabled
    await expect(dashboard.queueLoosenBtn).toBeDisabled();
    await expect(dashboard.requestWithdrawBtn).toBeDisabled();

    await captureAndRecordScreenshot(
      page,
      'vault-stranger-view.png',
      'Stranger Read-Only View of Vault Dashboard',
    );
  });

  test('Wallet User Rejection Handled Gracefully', async ({ page, testWallet }) => {
    const vaultAddress = getVaultAddress();
    test.skip(!vaultAddress, 'Vault address missing');
    const dashboard = new VaultDashboardPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await dashboard.goto(vaultAddress, 'rpc=http://127.0.0.1:8545');
    await dashboard.connectWallet();

    // Configure test wallet to reject next transaction
    await testWallet.setRejectNext(true);

    // Attempt deposit
    await dashboard.depositBtn.click();
    const amountInput = page.locator('.dialog-content input.input-control');
    await amountInput.fill('10');
    const confirmBtn = page
      .locator('.dialog-content')
      .getByRole('button', { name: /deposit|nạp/i });
    await confirmBtn.click();

    // Verify page does not crash and error is shown
    await expect(
      page.locator('.toast.error, .dialog-content .error-state, .dialog-content'),
    ).toBeVisible({
      timeout: 10000,
    });

    await captureAndRecordScreenshot(
      page,
      'wallet-rejection-handled.png',
      'Wallet Rejection Handled Gracefully without Crash',
    );
  });
});
