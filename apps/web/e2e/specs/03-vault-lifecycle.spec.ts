import { test, expect, captureAndRecordScreenshot, warpTimeOnAnvil } from '../fixtures.js';
import { VaultDashboardPage } from '../pom/VaultDashboardPage.js';
import { TEST_ACCOUNTS } from '../testWallet.js';
import fs from 'node:fs';
import path from 'node:path';

test.describe('Vault Lifecycle: Freeze, Tighten, Loosen, and Withdraw', () => {
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

  test('Freeze and Tighten Limits', async ({ page, testWallet }) => {
    const vaultAddress = getVaultAddress();
    test.skip(!vaultAddress, 'Vault address missing');
    const dashboard = new VaultDashboardPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await dashboard.goto(vaultAddress, 'rpc=http://127.0.0.1:8545');
    await dashboard.connectWallet();

    // 1. Freeze
    await dashboard.freeze();
    await expect(dashboard.statusChip).toContainText(/Frozen|Đã đóng băng/i, { timeout: 15000 });
    await captureAndRecordScreenshot(
      page,
      'vault-frozen-status.png',
      'Vault Dashboard in Frozen State',
    );

    // 2. Tighten
    await dashboard.tighten('20');
    // Verify toast or confirmation
    await captureAndRecordScreenshot(
      page,
      'vault-limits-tightened.png',
      'Vault Limits Immediately Tightened',
    );
  });

  test('Queue Loosening, Warp Time, and Execute Loosen', async ({ page, testWallet }) => {
    const vaultAddress = getVaultAddress();
    test.skip(!vaultAddress, 'Vault address missing');
    const dashboard = new VaultDashboardPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await dashboard.goto(vaultAddress, 'rpc=http://127.0.0.1:8545');
    await dashboard.connectWallet();

    // 1. Queue Loosening
    await dashboard.queueLoosen('35');
    await expect(page.locator('.pending-proposal-box').first()).toBeVisible({ timeout: 15000 });
    await captureAndRecordScreenshot(
      page,
      'vault-loosen-queued.png',
      'Loosening Queued with Timelock Countdown',
    );

    // 2. Warp time on fork past the withdrawal delay (86400s)
    await warpTimeOnAnvil(86500);

    // Refresh page / state to recognize block time passage
    await page
      .getByRole('button', { name: /Retry|Thử lại|refresh/i })
      .first()
      .click();

    // 3. Execute Loosening
    await expect(dashboard.executeLoosenBtn).toBeEnabled({ timeout: 10000 });
    await dashboard.executeLoosenBtn.click();

    // Wait for pending proposal to disappear
    await expect(
      page.locator('.pending-proposal-box').filter({ hasText: /Loosening|Nới lỏng/i }),
    ).not.toBeVisible({
      timeout: 15000,
    });

    await captureAndRecordScreenshot(
      page,
      'vault-loosen-executed.png',
      'Loosening Executed After Timelock',
    );
  });

  test('Request Withdrawal, Warp Time, and Execute Withdrawal', async ({ page, testWallet }) => {
    const vaultAddress = getVaultAddress();
    test.skip(!vaultAddress, 'Vault address missing');
    const dashboard = new VaultDashboardPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await dashboard.goto(vaultAddress, 'rpc=http://127.0.0.1:8545');
    await dashboard.connectWallet();

    // 1. Request Withdrawal
    await dashboard.requestWithdraw('10');
    await expect(page.locator('.pending-proposal-box').first()).toBeVisible({ timeout: 15000 });
    await captureAndRecordScreenshot(
      page,
      'vault-withdraw-queued.png',
      'Withdrawal Queued with Timelock Countdown',
    );

    // 2. Warp time on fork past the withdrawal delay (86400s)
    await warpTimeOnAnvil(86500);

    // Refresh dashboard
    await page
      .getByRole('button', { name: /Retry|Thử lại|refresh/i })
      .first()
      .click();

    // 3. Execute Withdrawal
    await expect(dashboard.executeWithdrawBtn).toBeEnabled({ timeout: 10000 });
    await dashboard.executeWithdrawBtn.click();

    // Wait for pending withdrawal to disappear
    await expect(
      page.locator('.pending-proposal-box').filter({ hasText: /Withdrawal|Rút tiền/i }),
    ).not.toBeVisible({
      timeout: 15000,
    });

    // Verify USDC balance decreased
    await expect(
      page.locator('.rule-row-item').filter({ hasText: 'USDC (Base Token)' }),
    ).toContainText('80.00', {
      timeout: 10000,
    });

    await captureAndRecordScreenshot(
      page,
      'vault-withdraw-executed.png',
      'Withdrawal Executed and Transferred to Owner',
    );
  });
});
