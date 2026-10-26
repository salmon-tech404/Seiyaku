// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CreateVaultPage } from './CreateVaultPage.js';
import { I18nProvider } from '../../shared/i18n/index.js';
import { RouterProvider } from '../../shared/router/index.js';
import { WalletProvider } from '../../chain/wallet.js';

describe('CreateVaultPage Component', () => {
  beforeEach(() => {
    cleanup();
    window.location.hash = '#/create?factory=0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB';
  });

  afterEach(() => {
    cleanup();
  });

  const renderComponent = (lang: 'en' | 'vi' = 'en') => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('seiyaku_lang', lang);
    }
    return render(
      <I18nProvider>
        <RouterProvider>
          <WalletProvider>
            <CreateVaultPage />
          </WalletProvider>
        </RouterProvider>
      </I18nProvider>,
    );
  };

  it('renders English headings and default Balanced template', () => {
    renderComponent('en');
    expect(screen.getByRole('heading', { level: 1 })).not.toBeNull();
    expect(screen.getByText('Create a vault')).not.toBeNull();
    expect(screen.getByText('1. Limits template')).not.toBeNull();
    expect(screen.getByText('2. Who trades')).not.toBeNull();
    expect(screen.getByText('3. Allowed tokens')).not.toBeNull();

    // Default Balanced template has 100 USDC per trade and 500 USDC daily
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const tradeInput = inputs.find((input) => input.value === '100');
    const dailyInput = inputs.find((input) => input.value === '500');
    expect(tradeInput).toBeDefined();
    expect(dailyInput).toBeDefined();
  });

  it('renders Vietnamese natural text properly when lang is vi', () => {
    renderComponent('vi');
    expect(screen.getByText('Tạo kho ủy thác')).not.toBeNull();
    expect(screen.getByText('1. Mẫu hạn mức')).not.toBeNull();
    expect(screen.getByText('2. Người giao dịch')).not.toBeNull();
    expect(screen.getByText('3. Token được phép mua')).not.toBeNull();
  });

  it('updates form fields when template cards are clicked', () => {
    renderComponent('en');
    const carefulCard = screen.getByText('Careful');
    fireEvent.click(carefulCard);

    // Careful has 25 USDC max trade and 100 USDC daily
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const tradeInput = inputs.find((input) => input.value === '25');
    const dailyInput = inputs.find((input) => input.value === '100');
    expect(tradeInput).toBeDefined();
    expect(dailyInput).toBeDefined();
  });

  it('shows custom trader input when custom option selected', () => {
    renderComponent('en');
    const customRadio = screen.getByLabelText('Separate trader or agent key');
    fireEvent.click(customRadio);

    expect(screen.getByText('Trader address')).not.toBeNull();
  });

  it('displays friendly units next to input fields and friendly values for time inputs', () => {
    const { container } = renderComponent('en');

    // Units rendered next to inputs
    const units = container.querySelectorAll('.input-unit');
    const unitTexts = Array.from(units).map((u) => u.textContent);
    expect(unitTexts).toContain('USDC');
    expect(unitTexts).toContain('trades/day');
    expect(unitTexts).toContain('minutes');
    expect(unitTexts).toContain('days');
    expect(unitTexts).toContain('hours');

    // For Balanced template: cooldown is 5 (minutes), expiry is 30 (days), withdraw delay is 24 (hours)
    const cooldownInput = screen.getByLabelText('Cooldown between trades') as HTMLInputElement;
    const expiryInput = screen.getByLabelText('Mandate expiry') as HTMLInputElement;
    const withdrawInput = screen.getByLabelText('Withdrawal delay') as HTMLInputElement;

    expect(cooldownInput.value).toBe('5');
    expect(expiryInput.value).toBe('30');
    expect(withdrawInput.value).toBe('24');
  });

  it('renders natural summary sentence in English', () => {
    renderComponent('en');
    const summaryCard = screen.getByText('Mandate summary').closest('.create-summary-card');
    expect(summaryCard).not.toBeNull();

    // Default Balanced template summary
    expect(summaryCard?.textContent).toContain(
      'This vault allows you (connected wallet) to spend up to 100 USDC per trade and 500 USDC per day (up to 10 trades per day), with a 5 minutes cooldown. Limits expire in 30 days, and withdrawal requests require a 24 hours timelock.',
    );
  });

  it('renders natural, respectful, and fluent summary sentence in Vietnamese', () => {
    renderComponent('vi');
    const summaryCard = screen.getByText('Tóm tắt ủy thác').closest('.create-summary-card');
    expect(summaryCard).not.toBeNull();

    // Vietnamese summary sentence
    expect(summaryCard?.textContent).toContain(
      'Kho này cho phép bạn (ví đang kết nối) chi tối đa 100 USDC mỗi lệnh và 500 USDC mỗi ngày (tối đa 10 lệnh mỗi ngày), với khoảng chờ 5 phút. Hạn mức hết hiệu lực sau 30 ngày, và các yêu cầu rút vốn cần thời gian khóa 24 giờ.',
    );
  });

  it('updates friendly input values when template changes', () => {
    renderComponent('en');
    const agentSafeCard = screen.getByText('Agent safe');
    fireEvent.click(agentSafeCard);

    // Agent safe has 1m cooldown, 7d expiry, 48h withdraw delay
    const cooldownInput = screen.getByLabelText('Cooldown between trades') as HTMLInputElement;
    const expiryInput = screen.getByLabelText('Mandate expiry') as HTMLInputElement;
    const withdrawInput = screen.getByLabelText('Withdrawal delay') as HTMLInputElement;

    expect(cooldownInput.value).toBe('1');
    expect(expiryInput.value).toBe('7');
    expect(withdrawInput.value).toBe('48');
  });
});
