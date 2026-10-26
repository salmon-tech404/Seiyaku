import { test, expect, captureAndRecordScreenshot } from '../fixtures.js';
import { VaultDashboardPage } from '../pom/VaultDashboardPage.js';
import { TEST_ACCOUNTS } from '../testWallet.js';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mandateVaultAbi } from '../../src/chain/abi/index.js';
import { XLAYER_ADDRESSES } from '../../../../scripts/config/xlayer.js';
import fs from 'node:fs';
import path from 'node:path';

// Throwaway Anvil trader key (Account #2)
const TRADER_KEY = '0x5de4111afa1a4b94908f83103eb2f954b0a473774953a3ed85c2b0056900a2db' as const;

test.describe('Deposit and Trade Scenarios', () => {
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

  test('Deposit 100 USDC and Check Balances', async ({ page, testWallet }) => {
    const vaultAddress = getVaultAddress();
    test.skip(!vaultAddress, 'Vault address missing');
    const dashboard = new VaultDashboardPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await dashboard.goto(vaultAddress, 'rpc=http://127.0.0.1:8545');
    await dashboard.connectWallet();

    await captureAndRecordScreenshot(
      page,
      'vault-before-deposit.png',
      'Vault Dashboard before Deposit',
    );

    // Deposit 100 USDC
    await dashboard.deposit('100');

    // Wait for balance to show 100 USDC
    await expect(
      page.locator('.rule-row-item').filter({ hasText: 'USDC (Base Token)' }),
    ).toContainText('100.00', {
      timeout: 15000,
    });

    await captureAndRecordScreenshot(
      page,
      'vault-after-deposit-100usdc.png',
      'Vault Dashboard after 100 USDC Deposit (Desktop)',
    );

    // Capture mobile viewport dashboard
    await page.setViewportSize({ width: 390, height: 844 });
    await captureAndRecordScreenshot(
      page,
      'vault-dashboard-mobile.png',
      'Vault Dashboard Mobile Viewport (390x844)',
    );
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('Check Trade: Allowed vs Blocked Mandate Verification', async ({ page, testWallet }) => {
    const vaultAddress = getVaultAddress();
    test.skip(!vaultAddress, 'Vault address missing');
    const dashboard = new VaultDashboardPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await dashboard.goto(vaultAddress, 'rpc=http://127.0.0.1:8545');
    await dashboard.connectWallet();

    // 1. Allowed trade (10 USDC is within 50 USDC maxTrade)
    await dashboard.checkTrade('10');
    await expect(dashboard.checkerResultBox).toHaveClass(/allowed/);
    await captureAndRecordScreenshot(
      page,
      'trade-checker-allowed.png',
      'Trade Checker - Mandate Permitted (10 USDC)',
    );

    // 2. Blocked trade (500 USDC exceeds 50 USDC maxTrade limit)
    await dashboard.checkTrade('500');
    await expect(dashboard.checkerResultBox).toHaveClass(/blocked/);
    await expect(dashboard.checkerResultBox).toContainText(/larger than the per trade limit/i);
    await captureAndRecordScreenshot(
      page,
      'trade-checker-blocked.png',
      'Trade Checker - Mandate Blocked (500 USDC exceeds limit)',
    );
  });

  test('Trader Executes Buy on Fork and Dashboard Updates', async ({ page, testWallet }) => {
    const vaultAddress = getVaultAddress();
    test.skip(!vaultAddress, 'Vault address missing');
    const dashboard = new VaultDashboardPage(page);
    await testWallet.setAccount(TEST_ACCOUNTS.owner);
    await dashboard.goto(vaultAddress, 'rpc=http://127.0.0.1:8545');
    await dashboard.connectWallet();

    // Trader performs swap on fork using viem directly
    const rpcUrl = 'http://127.0.0.1:8545';
    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const traderAccount = privateKeyToAccount(TRADER_KEY);
    const xlayerChain = {
      id: 196,
      name: 'X Layer',
      nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    } as const;
    const traderWallet = createWalletClient({
      chain: xlayerChain,
      account: traderAccount,
      transport: http(rpcUrl),
    });

    await publicClient.request({
      method: 'anvil_setBalance',
      params: [traderAccount.address, '0x21e19e0c9bab2400000'],
    } as unknown as Parameters<typeof publicClient.request>[0]);

    const block = await publicClient.getBlock({ blockTag: 'latest' });
    const buyParams = {
      tokenIn: XLAYER_ADDRESSES.usdc,
      tokenOut: XLAYER_ADDRESSES.wokb,
      feeTier: 500,
      amountIn: 10_000_000n, // 10 USDC
      amountOutMin: 1n,
      deadline: block.timestamp + 600n,
    };

    const tradeTx = await traderWallet.writeContract({
      address: vaultAddress as `0x${string}`,
      abi: mandateVaultAbi,
      functionName: 'trade',
      args: [buyParams],
    });
    await publicClient.waitForTransactionReceipt({ hash: tradeTx });

    // Refresh dashboard in browser
    await page
      .getByRole('button', { name: /Retry|Thử lại|refresh/i })
      .first()
      .click();

    // Verify USDC balance decreased (to 90.00 USDC)
    await expect(
      page.locator('.rule-row-item').filter({ hasText: 'USDC (Base Token)' }),
    ).toContainText('90.00', {
      timeout: 10000,
    });

    // Verify timeline contains Traded event
    await expect(page.locator('.timeline-event-title').filter({ hasText: /Traded/i })).toBeVisible({
      timeout: 10000,
    });

    await captureAndRecordScreenshot(
      page,
      'vault-after-trader-swap.png',
      'Vault Dashboard after Trader Executed Swap',
    );
  });
});
