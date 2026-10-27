// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { VerifyPage } from './VerifyPage.js';
import { I18nProvider } from '../../shared/i18n/index.js';
import { RouterProvider } from '../../shared/router/index.js';
import * as verifyHelpers from './verifyHelpers.js';
import { getAddress } from 'viem';

describe('VerifyPage', () => {
  beforeEach(() => {
    window.location.hash = '#/verify';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders verify header, address input and gate diagram', () => {
    render(
      <I18nProvider initialLocale="en">
        <RouterProvider>
          <VerifyPage />
        </RouterProvider>
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    expect(screen.getByPlaceholderText('0x...')).toBeDefined();
    expect(screen.getByText('Rule circuit (17 NAND gates)')).toBeDefined();
    expect(screen.getByText('Live Circuit Evaluation')).toBeDefined();
  });

  it('provides zoom in, zoom out, fit, and 100% controls for the gate diagram', () => {
    render(
      <I18nProvider initialLocale="en">
        <RouterProvider>
          <VerifyPage />
        </RouterProvider>
      </I18nProvider>,
    );

    const zoomInBtn = screen.getByRole('button', { name: 'Zoom In (+)' });
    const zoomOutBtn = screen.getByRole('button', { name: 'Zoom Out (-)' });
    const fitBtn = screen.getByRole('button', { name: 'Fit' });
    const percentBtn = screen.getByRole('button', { name: '100%' });

    expect(zoomInBtn).toBeDefined();
    expect(zoomOutBtn).toBeDefined();
    expect(fitBtn).toBeDefined();
    expect(percentBtn).toBeDefined();

    // Default state: 100 percent is active so that labels are readable
    expect(percentBtn.className).toContain('active');
    expect(fitBtn.className).not.toContain('active');

    // Click Fit
    fireEvent.click(fitBtn);
    expect(fitBtn.className).toContain('active');
    expect(percentBtn.className).not.toContain('active');

    // Click 100%
    fireEvent.click(percentBtn);
    expect(percentBtn.className).toContain('active');

    // Click Zoom In
    fireEvent.click(zoomInBtn);
    expect(percentBtn.className).not.toContain('active');

    // Click Fit: resets to Fit
    fireEvent.click(fitBtn);
    expect(fitBtn.className).toContain('active');
  });

  it('updates local evaluation when toggling exit bit', () => {
    render(
      <I18nProvider initialLocale="en">
        <RouterProvider>
          <VerifyPage />
        </RouterProvider>
      </I18nProvider>,
    );

    // Initial state: buy trade (all 1s, isExit = 0) -> ALLOW (1)
    expect(screen.getAllByText('ALLOW (1)').length).toBeGreaterThanOrEqual(1);

    // Toggle sane off (index 0)
    const saneToggle = document.getElementById('toggle-0') as HTMLInputElement;
    expect(saneToggle).toBeDefined();
    fireEvent.click(saneToggle);

    // Now should be BLOCK (0)
    expect(screen.getAllByText('BLOCK (0)').length).toBeGreaterThanOrEqual(1);
  });

  it('renders security pins, MATCH badges with check icon, and PASS status when report resolves', async () => {
    const mockAddr = getAddress('0x212fdfCfCC22db97DeB3AC3260414909282BB4EE');
    vi.spyOn(verifyHelpers, 'resolveContractType').mockResolvedValue('vault');
    vi.spyOn(verifyHelpers, 'fetchVerificationReport').mockResolvedValue({
      contractAddress: mockAddr,
      contractType: 'vault',
      processor: getAddress('0x603661EF64F685006335c20B239904864a3C1E6e'),
      circuitId: 1n,
      netlistHashMatch: true,
      beaconImplMatch: true,
      codehashMatch: true,
      beaconOwnerZero: true,
      allMatch: true,
      pins: [
        {
          nameKey: 'verify.pins.processor',
          expected: '0x603661EF64F685006335c20B239904864a3C1E6e',
          live: '0x603661EF64F685006335c20B239904864a3C1E6e',
          match: true,
        },
      ],
    });

    render(
      <I18nProvider initialLocale="en">
        <RouterProvider>
          <VerifyPage />
        </RouterProvider>
      </I18nProvider>,
    );

    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: mockAddr } });
    const inspectBtn = screen.getByText('Inspect contract');
    fireEvent.click(inspectBtn);

    await waitFor(() => {
      expect(screen.getByText('PASS — All Security Pins Verified')).toBeDefined();
      expect(screen.getByText('TapeOut Circuit & Security Pins')).toBeDefined();
      const matchBadges = screen.getAllByText('MATCH');
      expect(matchBadges.length).toBeGreaterThanOrEqual(1);
    });
  });
});
