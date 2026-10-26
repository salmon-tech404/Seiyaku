import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class AgentsPage extends BasePage {
  readonly pageTitle: Locator;
  readonly permissionsTable: Locator;
  readonly copyJsonBtn: Locator;
  readonly tradeJsonBlock: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('h1');
    this.permissionsTable = page.locator('.agents-permissions-table');
    this.copyJsonBtn = page.getByRole('button', { name: /Copy Example JSON|Sao chép JSON Mẫu/i });
    this.tradeJsonBlock = page.locator('.agents-code-block');
  }

  async goto() {
    await this.navigateTo('/agents');
    await expect(this.pageTitle).toBeVisible();
  }
}
