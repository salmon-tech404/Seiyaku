// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomePage } from './HomePage.js';
import { I18nProvider } from '../../shared/i18n/index.js';
import { RouterProvider } from '../../shared/router/index.js';

describe('HomePage', () => {
  it('renders English home page content with hero, value cards, and CTAs', () => {
    window.location.hash = '#/';
    render(
      <I18nProvider initialLocale="en">
        <RouterProvider>
          <HomePage />
        </RouterProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('Autonomous Trading Bounded by On-Chain Hardware Logic')).toBeDefined();
    expect(screen.getByText('Instant tightening')).toBeDefined();
    expect(screen.getByText('Delayed loosening')).toBeDefined();
    expect(screen.getByText('Exits always open')).toBeDefined();
    expect(screen.getByText('How it works')).toBeDefined();
    expect(screen.getByText('Honest limitations by design')).toBeDefined();
    expect(screen.getAllByText('Create a vault').length).toBeGreaterThan(0);
  });

  it('renders Vietnamese home page content', () => {
    window.location.hash = '#/';
    render(
      <I18nProvider initialLocale="vi">
        <RouterProvider>
          <HomePage />
        </RouterProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('Giao dịch tự động ràng buộc bởi mạch logic phần cứng')).toBeDefined();
    expect(screen.getByText('Thắt chặt tức thì')).toBeDefined();
    expect(screen.getByText('Nới lỏng có độ trễ')).toBeDefined();
    expect(screen.getByText('Lối thoát luôn mở')).toBeDefined();
    expect(screen.getByText('Quy trình hoạt động')).toBeDefined();
  });
});
