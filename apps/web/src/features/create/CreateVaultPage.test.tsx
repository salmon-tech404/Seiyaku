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
});
