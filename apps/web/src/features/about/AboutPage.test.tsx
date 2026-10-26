// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AboutPage } from './AboutPage.js';
import { I18nProvider } from '../../shared/i18n/index.js';
import { RouterProvider } from '../../shared/router/index.js';
import { PROTOCOL_CONSTANTS } from '../../chain/config.js';

describe('AboutPage', () => {
  it('renders English about page with 9 rules, asymmetry explainer, and config-backed constants', () => {
    window.location.hash = '#/about';
    render(
      <I18nProvider initialLocale="en">
        <RouterProvider>
          <AboutPage />
        </RouterProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('How Seiyaku Works')).toBeDefined();
    expect(screen.getByText('The nine rules in plain language')).toBeDefined();
    expect(screen.getByText('Asymmetry of control: Tighten vs Loosen')).toBeDefined();
    expect(screen.getByText('Why exits are always open')).toBeDefined();
    expect(screen.getByText('Trust model & scope of power')).toBeDefined();

    // Verify config-backed numbers are rendered accurately (not hardcoded strings)
    const expectedCapText = `${PROTOCOL_CONSTANTS.depositCapUsdc} USDC base balance per vault`;
    expect(screen.getByText(expectedCapText)).toBeDefined();

    const expectedHours = Math.floor(PROTOCOL_CONSTANTS.minWithdrawDelaySec / 3600);
    expect(
      screen.getAllByText(`${expectedHours} hours on public factory (120s on demo)`).length,
    ).toBe(2);

    // Links check
    const ghLink = screen.getByText('View GitHub Repository').closest('a');
    expect(ghLink?.getAttribute('href')).toBe(PROTOCOL_CONSTANTS.githubUrl);
  });

  it('renders Vietnamese about page', () => {
    window.location.hash = '#/about';
    render(
      <I18nProvider initialLocale="vi">
        <RouterProvider>
          <AboutPage />
        </RouterProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('Cách thức Seiyaku vận hành')).toBeDefined();
    expect(screen.getByText('Giải thích 9 quy tắc bằng ngôn ngữ tự nhiên')).toBeDefined();
    expect(screen.getByText('Kiểm soát bất đối xứng: Thắt chặt vs Nới lỏng')).toBeDefined();
    expect(screen.getByText('Tại sao lối thoát thanh lý luôn mở')).toBeDefined();
  });
});
