import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class VaultDashboardPage extends BasePage {
  readonly addressText: Locator;
  readonly statusChip: Locator;
  readonly roleChip: Locator;
  readonly depositBtn: Locator;
  readonly freezeBtn: Locator;
  readonly tightenBtn: Locator;
  readonly queueLoosenBtn: Locator;
  readonly requestWithdrawBtn: Locator;
  readonly executeLoosenBtn: Locator;
  readonly executeWithdrawBtn: Locator;
  readonly tradeCheckerRunBtn: Locator;
  readonly checkerResultBox: Locator;
  readonly checkerAmountInput: Locator;
  readonly countdownDisplay: Locator;

  constructor(page: Page) {
    super(page);
    this.addressText = page
      .locator('.vault-meta-item .ui-address-text, .vault-meta-item .address-text')
      .first();
    this.statusChip = page
      .locator('.vault-header-badges .ui-chip, .vault-header-badges .chip')
      .first();
    this.roleChip = page
      .locator('.vault-header-badges .ui-chip, .vault-header-badges .chip')
      .nth(1);
    this.depositBtn = page
      .getByRole('button', { name: /deposit usdc|deposit base token|nạp usdc|nạp tiền gốc/i })
      .first();
    this.freezeBtn = page.getByRole('button', { name: /emergency freeze|đóng băng khẩn cấp/i });
    this.tightenBtn = page.getByRole('button', { name: /tighten limits|thắt chặt hạn mức/i });
    this.queueLoosenBtn = page.getByRole('button', { name: /queue loosening|xếp hàng nới lỏng/i });
    this.requestWithdrawBtn = page.getByRole('button', {
      name: /request withdrawal|yêu cầu rút tiền/i,
    });
    this.executeLoosenBtn = page.getByRole('button', {
      name: /execute loosening|thực thi nới lỏng/i,
    });
    this.executeWithdrawBtn = page.getByRole('button', {
      name: /execute withdrawal|thực thi rút tiền/i,
    });
    this.tradeCheckerRunBtn = page.getByRole('button', {
      name: /simulate & check rules|mô phỏng & kiểm tra/i,
    });
    this.checkerResultBox = page.locator('.checker-result-box');
    this.checkerAmountInput = page
      .locator('[data-testid="checker-amount-input"], .dashboard-card input[type="text"]')
      .last();
    this.countdownDisplay = page.locator('.countdown-display');
  }

  async goto(vaultAddress: string, params?: string) {
    await this.navigateTo(`/vault/${vaultAddress}${params ? `?${params}` : ''}`);
    await expect(this.page.locator('.vault-header-card')).toBeVisible({ timeout: 15000 });
  }

  async deposit(amount: string) {
    await this.depositBtn.click();
    const dialog = this.page.locator('.ui-dialog, .dialog-content');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const amountInput = dialog.locator('input.input-control');
    await amountInput.fill(amount);
    const confirmBtn = dialog.getByRole('button', { name: /deposit|nạp/i });
    await confirmBtn.click();
    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 20000 });
  }

  async freeze() {
    await this.freezeBtn.click();
    const dialog = this.page.locator('.ui-dialog, .dialog-content');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const confirmBtn = dialog.getByRole('button', { name: /freeze|đóng băng/i });
    await confirmBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 20000 });
  }

  async tighten(maxTrade: string) {
    await this.tightenBtn.click();
    const dialog = this.page.locator('.ui-dialog, .dialog-content');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const tradeInput = dialog.locator('input.input-control').first();
    await tradeInput.fill(maxTrade);
    const confirmBtn = dialog.getByRole('button', { name: /tighten|thắt chặt/i });
    await confirmBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 20000 });
  }

  async queueLoosen(maxTrade: string) {
    await this.queueLoosenBtn.click();
    const dialog = this.page.locator('.ui-dialog, .dialog-content');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const tradeInput = dialog.locator('input.input-control').first();
    await tradeInput.fill(maxTrade);
    const confirmBtn = dialog.getByRole('button', { name: /loosen|nới lỏng/i });
    await confirmBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 20000 });
  }

  async requestWithdraw(amount: string) {
    await this.requestWithdrawBtn.click();
    const dialog = this.page.locator('.ui-dialog, .dialog-content');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const amountInput = dialog.locator('input.input-control').first();
    await amountInput.fill(amount);
    const confirmBtn = dialog.getByRole('button', { name: /withdraw|rút tiền/i });
    await confirmBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 20000 });
  }

  async checkTrade(amount: string) {
    await this.checkerAmountInput.fill(amount);
    await this.tradeCheckerRunBtn.click();
    await expect(this.checkerResultBox).toBeVisible({ timeout: 10000 });
  }
}
