import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class VerifyPage extends BasePage {
  readonly pageTitle: Locator;
  readonly overallBadge: Locator;
  readonly pinItems: Locator;
  readonly gateDiagramSvg: Locator;
  readonly run512Btn: Locator;
  readonly matchBanner: Locator;
  readonly runnerStatusText: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('h1');
    this.overallBadge = page
      .locator('.verify-overall-banner .banner-title, .pins-card-header .ui-chip')
      .first();
    this.pinItems = page.locator('.pin-row, .pin-item');
    this.gateDiagramSvg = page.locator('svg.circuit-svg, svg.gate-diagram-svg');
    this.run512Btn = page.getByRole('button', { name: /512/i });
    this.matchBanner = page.locator('.eval-match-banner');
    this.runnerStatusText = page.locator('.eval-runner-box span').first();
  }

  async goto(params?: string) {
    await this.navigateTo(`/verify${params ? `?${params}` : ''}`);
    await expect(
      this.page.locator('.verify-overall-banner, .pins-card, .eval-runner-box').first(),
    ).toBeVisible({ timeout: 15000 });
  }

  async run512Cases() {
    await this.run512Btn.click();
    await expect(this.runnerStatusText).toContainText(/512/i, { timeout: 15000 });
  }
}
