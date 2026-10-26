import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class CreateVaultPage extends BasePage {
  readonly pageTitle: Locator;
  readonly balancedCard: Locator;
  readonly carefulCard: Locator;
  readonly agentSafeCard: Locator;
  readonly customCard: Locator;
  readonly traderInput: Locator;
  readonly reviewBtn: Locator;
  readonly confirmDeployBtn: Locator;
  readonly goToVaultBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('h1');
    this.balancedCard = page.locator('.template-card').filter({ hasText: /Balanced|Cân bằng/i });
    this.carefulCard = page.locator('.template-card').filter({ hasText: /Careful|Cẩn trọng/i });
    this.agentSafeCard = page
      .locator('.template-card')
      .filter({ hasText: /Agent Safe|An toàn Agent/i });
    this.customCard = page.locator('.template-card').filter({ hasText: /Custom|Tùy chỉnh/i });
    this.traderInput = page.locator('.custom-trader-input, input[placeholder*="0x"]').first();
    this.reviewBtn = page.getByRole('button', {
      name: /Review and deploy vault|Kiểm tra và triển khai/i,
    });
    this.confirmDeployBtn = page.getByRole('button', { name: /Sign & deploy|Ký & triển khai/i });
    this.goToVaultBtn = page.getByRole('button', {
      name: /Open vault dashboard|bảng điều khiển|Mở dashboard/i,
    });
  }

  async goto(params?: string) {
    await this.navigateTo(`/create${params ? `?${params}` : ''}`);
  }

  async selectTemplate(name: 'balanced' | 'careful' | 'agent_safe') {
    if (name === 'balanced') await this.balancedCard.click();
    else if (name === 'careful') await this.carefulCard.click();
    else if (name === 'agent_safe') await this.agentSafeCard.click();
  }

  async createVault(options?: {
    template?: 'balanced' | 'careful' | 'agent_safe';
    trader?: string;
  }): Promise<string> {
    if (options?.template) {
      await this.selectTemplate(options.template);
    }
    if (options?.trader) {
      await this.page.locator('.trader-radio-item').nth(1).click();
      await this.traderInput.fill(options.trader);
    }
    await this.reviewBtn.click();
    await expect(this.confirmDeployBtn).toBeVisible({ timeout: 10000 });
    await this.confirmDeployBtn.click();
    await expect(this.goToVaultBtn).toBeVisible({ timeout: 20000 });

    const addrEl = this.page
      .locator('.dialog-summary-list .ui-address-text, .dialog-summary-list code')
      .first();
    const fullAddr = (await addrEl.getAttribute('title')) || (await addrEl.textContent()) || '';
    const vaultAddress = fullAddr.trim();

    await this.goToVaultBtn.click();
    return vaultAddress;
  }
}
