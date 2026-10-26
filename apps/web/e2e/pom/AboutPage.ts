import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class AboutPage extends BasePage {
  readonly pageTitle: Locator;
  readonly rulesCards: Locator;
  readonly asymmetrySection: Locator;
  readonly limitsTable: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('h1');
    this.rulesCards = page.locator('.about-rule-card');
    this.asymmetrySection = page.locator('.about-asymmetry-box');
    this.limitsTable = page.locator('.about-limits-table');
  }

  async goto() {
    await this.navigateTo('/about');
    await expect(this.pageTitle).toBeVisible();
  }
}
