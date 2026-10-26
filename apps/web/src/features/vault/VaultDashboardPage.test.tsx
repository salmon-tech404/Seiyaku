// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { VaultDashboardPage } from './VaultDashboardPage.js';
import { I18nProvider } from '../../shared/i18n/index.js';
import { RouterProvider } from '../../shared/router/index.js';
import { WalletProvider } from '../../chain/wallet.js';
import * as vaultModule from '../../chain/vault.js';

import * as clientsModule from '../../chain/clients.js';

describe('VaultDashboardPage Component', () => {
  const mockVaultAddress = '0x212fdfCfCC22db97DeB3AC3260414909282BB4EE';
  const mockOwner = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const mockTrader = '0xB869F594F35603f71AA7B9D3689B4ab1DE9cde83';

  beforeEach(() => {
    cleanup();
    window.location.hash = `#/vault/${mockVaultAddress}`;

    // Mock getBlockNumber
    vi.spyOn(clientsModule.defaultPublicClient, 'getBlockNumber').mockResolvedValue(123456n);

    // Mock readVaultState
    vi.spyOn(vaultModule, 'readVaultState').mockResolvedValue({
      owner: mockOwner,
      trader: mockTrader,
      limits: {
        maxTradeBase: 25_000_000n, // 25 USDC
        maxDailyBase: 100_000_000n, // 100 USDC
        maxTradesPerDay: 4,
        cooldownSec: 1800,
        expiresAt: BigInt(Math.floor(Date.now() / 1000) + 14 * 86400),
        withdrawDelaySec: 86400,
      },
      frozen: false,
      dayIndex: 100n,
      tradesToday: 1,
      buyVolumeTodayBase: 25_000_000n,
      lastBuyAt: BigInt(Math.floor(Date.now() / 1000) - 300),
      pending: {
        eta: 0n,
        limits: {
          maxTradeBase: 0n,
          maxDailyBase: 0n,
          maxTradesPerDay: 0,
          cooldownSec: 0,
          expiresAt: 0n,
          withdrawDelaySec: 0,
        },
        addTokens: [],
        unfreeze: false,
      },
      withdrawal: {
        eta: 0n,
        token: '0x0000000000000000000000000000000000000000',
        amount: 0n,
      },
      baseToken: '0xB6CEceAB302E2E4948951eE7843FC24E92933061',
      swapRouter: '0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA',
      processor: '0x603661EF64F685006335c20B239904864a3C1E6e',
      circuitId: 1n,
      loosenDelay: 86400,
      minWithdrawDelay: 86400,
      maxDepositBase: 500_000_000n,
      beacon: '0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C',
      beaconImplementation: '0x977f217887E085D298Cb3819cDAD5A0ee35F29B2',
      beaconImplementationCodehash:
        '0x7a15c353205e5245f40f5f5524542a982a4bb3b9a28476e4f10845163f941b30',
    });

    vi.spyOn(vaultModule, 'readVaultBalances').mockResolvedValue({
      '0xB6CEceAB302E2E4948951eE7843FC24E92933061': 100_000_000n,
      '0xe538905cf8410324e03a5a23c1c177a474d59b2b': 5_000_000_000_000_000_000n,
    });

    vi.spyOn(vaultModule, 'readVaultLogs').mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderComponent = (lang: 'en' | 'vi' = 'en') => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('seiyaku_lang', lang);
    }
    return render(
      <I18nProvider>
        <RouterProvider>
          <WalletProvider>
            <VaultDashboardPage />
          </WalletProvider>
        </RouterProvider>
      </I18nProvider>,
    );
  };

  it('renders all 6 dashboard cards in English', async () => {
    renderComponent('en');

    expect(await screen.findByText('Vault dashboard')).not.toBeNull();
    expect(screen.getByText("Today's activity & limits")).not.toBeNull();
    expect(screen.getByText('Silicon mandate rules')).not.toBeNull();
    expect(screen.getByText('Vault balances')).not.toBeNull();
    expect(screen.getByText('Pending proposals & withdrawals')).not.toBeNull();
    expect(screen.getByText('Vault management actions')).not.toBeNull();
    expect(screen.getByText('Trade checker simulation')).not.toBeNull();
    expect(screen.getByText('Vault activity timeline')).not.toBeNull();
  });

  it('renders natural Vietnamese headings when lang is vi', async () => {
    renderComponent('vi');

    expect(await screen.findByText('Bảng điều khiển kho ủy thác')).not.toBeNull();
    expect(screen.getByText('Hoạt động & hạn mức hôm nay')).not.toBeNull();
    expect(screen.getByText('Bộ quy tắc phần cứng')).not.toBeNull();
    expect(screen.getByText('Số dư tài sản')).not.toBeNull();
    expect(screen.getByText('Đề xuất & yêu cầu rút đang chờ')).not.toBeNull();
    expect(screen.getByText('Thao tác quản trị kho')).not.toBeNull();
    expect(screen.getByText('Mô phỏng kiểm tra lệnh')).not.toBeNull();
    expect(screen.getByText('Dòng thời gian hoạt động')).not.toBeNull();
  });

  it('shows read-only badge and disables owner buttons for strangers', async () => {
    renderComponent('en');
    expect(await screen.findByText('Read only')).not.toBeNull();

    // Emergency freeze and tighten should be disabled for stranger
    const freezeBtn = screen.getByText('Emergency freeze').closest('button');
    const tightenBtn = screen.getByText('Tighten limits').closest('button');
    expect(freezeBtn?.disabled).toBe(true);
    expect(tightenBtn?.disabled).toBe(true);
  });
});
