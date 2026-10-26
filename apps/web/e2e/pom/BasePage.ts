import { type Page, type Locator, expect } from '@playwright/test';

export class BasePage {
  readonly page: Page;
  readonly header: Locator;
  readonly footer: Locator;
  readonly connectWalletBtn: Locator;
  readonly accountPill: Locator;
  readonly demoBanner: Locator;
  readonly langToggle: Locator;
  readonly themeToggle: Locator;
  readonly wrongNetworkBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.locator('.site-header, .app-header');
    this.footer = page.locator('.site-footer, .app-footer');
    this.connectWalletBtn = this.header.getByRole('button', { name: /Connect Wallet|Kết nối Ví/i });
    this.accountPill = page.locator('.wallet-connected, .account-pill, button.wallet-pill');
    this.demoBanner = page.locator('.demo-banner');
    this.langToggle = this.header.locator('.lang-toggle');
    this.themeToggle = this.header.locator('.theme-toggle');
    this.wrongNetworkBanner = page.locator('.network-warning, .network-banner');
  }

  async connectWallet() {
    if (await this.connectWalletBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.connectWalletBtn.click();
      const testWalletOption = this.page.getByRole('button', {
        name: /Seiyaku Test Wallet|Browser Wallet/i,
      });
      if (await testWalletOption.isVisible({ timeout: 1500 }).catch(() => false)) {
        await testWalletOption.click();
      }
    }
    await expect(this.header).toContainText(/0x/i, { timeout: 10000 });
  }

  async setLanguage(lang: 'en' | 'vi') {
    const current = (await this.langToggle.getAttribute('data-lang')) || 'en';
    if (current.toLowerCase() !== lang.toLowerCase()) {
      await this.langToggle.click();
      await expect(this.langToggle).toHaveAttribute('data-lang', lang, { timeout: 5000 });
    }
  }

  async toggleTheme() {
    await this.themeToggle.click();
  }

  async navigateTo(hash: string) {
    await this.page.goto(`/#${hash}`);
    await this.page.waitForLoadState('domcontentloaded');
  }
}
