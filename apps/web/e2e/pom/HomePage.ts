import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class HomePage extends BasePage {
  readonly createVaultCta: Locator;
  readonly verifyNetlistCta: Locator;
  readonly watermark: Locator;
  readonly limitsBox: Locator;

  constructor(page: Page) {
    super(page);
    this.createVaultCta = page.getByRole('link', {
      name: /Create Mandate Vault|Tạo Mandate Vault/i,
    });
    this.verifyNetlistCta = page.getByRole('link', { name: /Verify Netlist|Kiểm tra Netlist/i });
    this.watermark = page.locator('.home-seal-watermark');
    this.limitsBox = page.locator('.home-limits-box');
  }

  async goto() {
    await this.navigateTo('/');
  }
}
