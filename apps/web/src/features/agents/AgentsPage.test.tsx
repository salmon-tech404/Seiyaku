// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentsPage, SAMPLE_TRADE_PARAMS_JSON } from './AgentsPage.js';
import { I18nProvider } from '../../shared/i18n/index.js';
import { RouterProvider } from '../../shared/router/index.js';
import { RULE_FAILURE_CODES } from '@seiyaku/circuit-tools';

describe('AgentsPage', () => {
  it('renders English agents guide with permissions, typed TradeParams JSON, and error codes', () => {
    window.location.hash = '#/agents';
    render(
      <I18nProvider initialLocale="en">
        <RouterProvider>
          <AgentsPage />
        </RouterProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('Autonomous Agents Guide')).toBeDefined();
    expect(screen.getByText('Upcoming Release')).toBeDefined();
    expect(screen.getByText('Agent permissions & capabilities')).toBeDefined();
    expect(screen.getByText('Trade request format (TradeParams)')).toBeDefined();

    // Verify concrete JSON contains valid keys from TradeParams
    const parsed = JSON.parse(SAMPLE_TRADE_PARAMS_JSON);
    expect(parsed.tokenIn).toBeDefined();
    expect(parsed.tokenOut).toBeDefined();
    expect(parsed.feeTier).toBe(500);
    expect(parsed.amountIn).toBe('25000000');
    expect(parsed.amountOutMin).toBeDefined();
    expect(parsed.deadline).toBeGreaterThan(0);

    // Verify block reason codes match @seiyaku/circuit-tools
    expect(screen.getByText(RULE_FAILURE_CODES.sane)).toBeDefined();
    expect(screen.getByText(RULE_FAILURE_CODES.tokenAllowed)).toBeDefined();
    expect(screen.getByText(RULE_FAILURE_CODES.sizeOk)).toBeDefined();
  });

  it('renders Vietnamese agents guide', () => {
    window.location.hash = '#/agents';
    render(
      <I18nProvider initialLocale="vi">
        <RouterProvider>
          <AgentsPage />
        </RouterProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('Hướng dẫn dành cho Agent tự hành')).toBeDefined();
    expect(screen.getByText('Phiên bản sắp ra mắt')).toBeDefined();
    expect(screen.getByText('Quyền hạn & Khả năng của Agent')).toBeDefined();
  });
});
