import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation, type TranslationKey } from '../../shared/i18n/index.js';
import { useRouter } from '../../shared/router/index.js';
import { useWallet } from '../../chain/wallet.js';
import { defaultPublicClient } from '../../chain/clients.js';
import {
  readVaultState,
  readVaultBalances,
  previewVaultTrade,
  readVaultLogs,
  type VaultStateData,
  type VaultLogEvent,
} from '../../chain/vault.js';
import { runTransaction } from '../../chain/tx.js';
import { mandateVaultAbi, erc20Abi } from '../../chain/abi/index.js';
import { DEFAULT_TOKENS } from '../../chain/config.js';
import { decodeAppError } from '../../chain/errors.js';
import { isAddress, getAddress, parseUnits } from 'viem';
import {
  getUserRole,
  isStricterOrEqual,
  getRolledDayStats,
  formatTokenBalance,
  formatTokenOption,
  getNextPendingSummary,
  formatLogEvent,
  type UserRole,
} from './vaultHelpers.js';
import { computeInputBits, explainBlock } from '@seiyaku/circuit-tools';
import { Button } from '../../shared/ui/Button.js';
import { Chip } from '../../shared/ui/Chip.js';
import { Meter } from '../../shared/ui/Meter.js';
import { Countdown } from '../../shared/ui/Countdown.js';
import { Dialog } from '../../shared/ui/Dialog.js';
import { Tooltip } from '../../shared/ui/Tooltip.js';
import { FieldRow } from '../../shared/ui/FieldRow.js';
import { AddressText } from '../../shared/ui/AddressText.js';
import { AmountText } from '../../shared/ui/AmountText.js';
import { Skeleton } from '../../shared/ui/Skeleton.js';
import { ErrorState } from '../../shared/ui/ErrorState.js';
import './vault.css';

const FAIL_CODE_KEYS: Record<string, TranslationKey> = {
  ERR_INSANE_PARAMS: 'dashboard.fail.insane',
  ERR_TOKEN_NOT_ALLOWED: 'dashboard.fail.notAllowed',
  ERR_MANDATE_EXPIRED: 'dashboard.fail.expired',
  ERR_VAULT_FROZEN: 'dashboard.fail.frozen',
  ERR_TRADE_SIZE_EXCEEDED: 'dashboard.fail.size',
  ERR_DAILY_VOLUME_EXCEEDED: 'dashboard.fail.daily',
  ERR_DAILY_TRADES_EXCEEDED: 'dashboard.fail.trades',
  ERR_COOLDOWN_ACTIVE: 'dashboard.fail.cooldown',
};

export function VaultDashboardPage() {
  const { t } = useTranslation();
  const { currentRoute } = useRouter();
  const { account, walletClient } = useWallet();

  const vaultAddressParam = currentRoute.params.address;
  const validVaultAddress = useMemo(() => {
    if (vaultAddressParam && isAddress(vaultAddressParam)) {
      return getAddress(vaultAddressParam);
    }
    return null;
  }, [vaultAddressParam]);

  // State data
  const [loading, setLoading] = useState<boolean>(true);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultState, setVaultState] = useState<VaultStateData | null>(null);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [activityLogs, setActivityLogs] = useState<VaultLogEvent[]>([]);
  const [freshnessBlock, setFreshnessBlock] = useState<bigint>(0n);
  const [chainTimeSec, setChainTimeSec] = useState<bigint>(0n);
  const [lastFetchedSec, setLastFetchedSec] = useState<number>(Math.floor(Date.now() / 1000));
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Trade checker state
  const [checkerType, setCheckerType] = useState<'buy' | 'exit'>('buy');
  const [checkerToken, setCheckerToken] = useState<string>(DEFAULT_TOKENS.wokb.address);
  const [checkerAmount, setCheckerAmount] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search);
      return q.get('checkAmount') || '10';
    }
    return '10';
  });
  const [checkerFeeTier, setCheckerFeeTier] = useState<number>(500);
  const [checkerResult, setCheckerResult] = useState<{
    allowed: boolean;
    inputBits: number;
    failedCodes: string[];
    localAllowed: boolean;
    localBits: number;
    agreement: boolean;
  } | null>(null);
  const [isCheckingTrade, setIsCheckingTrade] = useState<boolean>(false);

  // Action Dialogs
  const [activeDialog, setActiveDialog] = useState<
    'deposit' | 'freeze' | 'tighten' | 'loosen' | 'withdraw' | 'trader' | null
  >(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);

  // Action Form Inputs
  const [depositAmount, setDepositAmount] = useState<string>('50');
  const [tightenMaxTrade, setTightenMaxTrade] = useState<string>('');
  const [tightenMaxDaily, setTightenMaxDaily] = useState<string>('');
  const [tightenTrades, setTightenTrades] = useState<number>(10);
  const [tightenCooldown, setTightenCooldown] = useState<number>(300);
  const [tightenExpiry, setTightenExpiry] = useState<number>(30);
  const [tightenWithdrawDelay, setTightenWithdrawDelay] = useState<number>(86400);

  const [loosenMaxTrade, setLoosenMaxTrade] = useState<string>('');
  const [loosenMaxDaily, setLoosenMaxDaily] = useState<string>('');
  const [loosenTrades, setLoosenTrades] = useState<number>(10);
  const [loosenCooldown, setLoosenCooldown] = useState<number>(300);
  const [loosenExpiry, setLoosenExpiry] = useState<number>(30);
  const [loosenWithdrawDelay, setLoosenWithdrawDelay] = useState<number>(86400);
  const [loosenAddTokens, setLoosenAddTokens] = useState<string>('');
  const [loosenUnfreeze, setLoosenUnfreeze] = useState<boolean>(false);

  const [withdrawToken, setWithdrawToken] = useState<string>(DEFAULT_TOKENS.usdc.address);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('10');
  const [newTraderAddress, setNewTraderAddress] = useState<string>('');

  // Fetch full vault data
  const fetchData = useCallback(
    async (showLoading = false) => {
      if (!validVaultAddress) return;
      if (showLoading) setLoading(true);
      setIsRefreshing(true);

      try {
        const [block, state] = await Promise.all([
          defaultPublicClient.getBlock({ blockTag: 'latest' }),
          readVaultState(defaultPublicClient, validVaultAddress),
        ]);

        setVaultState(state);
        setFreshnessBlock(block.number ?? 0n);
        setChainTimeSec(block.timestamp);
        setLastFetchedSec(Math.floor(Date.now() / 1000));
        setVaultError(null);

        // Fetch balances of baseToken + allowlist
        const tokensToQuery = [state.baseToken, DEFAULT_TOKENS.wokb.address];
        const bals = await readVaultBalances(defaultPublicClient, validVaultAddress, tokensToQuery);
        setBalances(bals);

        // Fetch recent logs (bounded to last 50 blocks for performance and RPC limits)
        const currentBlockNum = block.number ?? 0n;
        const fromBlock = currentBlockNum > 50n ? currentBlockNum - 50n : 0n;
        try {
          const logs = await readVaultLogs(
            defaultPublicClient,
            validVaultAddress,
            fromBlock,
            currentBlockNum,
          );
          setActivityLogs(logs);
        } catch {
          // Non-critical: activity log failure shouldn't crash the vault view
        }
      } catch (err: unknown) {
        const decoded = decodeAppError(err);
        setVaultError(t(decoded.messageKey, decoded.params));
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [validVaultAddress, t],
  );

  // Initial fetch and auto-refresh every 15 seconds
  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchData(false);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // User Role
  const role: UserRole = useMemo(() => {
    if (!vaultState) return 'stranger';
    return getUserRole(account, vaultState.owner, vaultState.trader);
  }, [account, vaultState]);

  // Derived Vault Status
  const statusInfo = useMemo(() => {
    if (!vaultState) return { status: 'active', label: t('dashboard.status.active') };
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (vaultState.frozen) {
      return { status: 'frozen', label: t('dashboard.status.frozen') };
    }
    if (vaultState.limits.expiresAt <= now) {
      return { status: 'expired', label: t('dashboard.status.expired') };
    }
    return { status: 'active', label: t('dashboard.status.active') };
  }, [vaultState, t]);

  // Rolled day stats
  const nowSec = Math.floor(Date.now() / 1000);
  const effectiveNowSec = chainTimeSec > 0n ? chainTimeSec : BigInt(nowSec);
  const isStale = nowSec - lastFetchedSec > 60;
  const dayStats = useMemo(() => {
    if (!vaultState) return null;
    return getRolledDayStats(vaultState, nowSec);
  }, [vaultState, nowSec]);

  // Trade Checker Runner
  const handleCheckTrade = useCallback(async () => {
    if (!vaultState || !validVaultAddress || !isAddress(checkerToken)) return;
    setIsCheckingTrade(true);
    setCheckerResult(null);

    const isExit = checkerType === 'exit';
    const tokenIn = isExit ? getAddress(checkerToken) : vaultState.baseToken;
    const tokenOut = isExit ? vaultState.baseToken : getAddress(checkerToken);
    const amt = parseUnits(checkerAmount || '0', 6);

    try {
      // Use the chain's own clock, not the browser clock, so that both sides see the same time
      const latestBlock = await defaultPublicClient.getBlock();
      const chainNow = latestBlock.timestamp;
      const deadline = chainNow + 300n;
      const heldToken = isExit ? tokenIn : tokenOut;
      const heldTokenAllowed = (await defaultPublicClient.readContract({
        address: validVaultAddress,
        abi: mandateVaultAbi,
        functionName: 'allowedTokens',
        args: [heldToken],
      })) as boolean;

      // 1. Preview on-chain
      const preview = await previewVaultTrade(defaultPublicClient, validVaultAddress, {
        tokenIn,
        tokenOut,
        feeTier: checkerFeeTier,
        amountIn: amt,
        amountOutMin: 1n,
        deadline,
      });

      // 2. Compute locally with @seiyaku/circuit-tools
      const nowBig = chainNow;
      const localBitsRes = computeInputBits(
        {
          baseToken: vaultState.baseToken,
          frozen: vaultState.frozen,
          dayIndex: vaultState.dayIndex,
          tradesToday: vaultState.tradesToday,
          buyVolumeTodayBase: vaultState.buyVolumeTodayBase,
          lastBuyAt: vaultState.lastBuyAt,
          allowedTokens: new Set(heldTokenAllowed ? [heldToken.toLowerCase()] : []),
          balances: new Map([
            [vaultState.baseToken.toLowerCase(), balances[vaultState.baseToken] ?? 0n],
            [heldToken.toLowerCase(), balances[heldToken] ?? balances[getAddress(heldToken)] ?? 0n],
          ]),
          now: nowBig,
        },
        {
          maxTradeBase: vaultState.limits.maxTradeBase,
          maxDailyBase: vaultState.limits.maxDailyBase,
          maxTradesPerDay: vaultState.limits.maxTradesPerDay,
          cooldownSec: BigInt(vaultState.limits.cooldownSec),
          expiresAt: vaultState.limits.expiresAt,
          withdrawDelaySec: BigInt(vaultState.limits.withdrawDelaySec),
        },
        {
          tokenIn,
          tokenOut,
          amountIn: amt,
          amountOutMin: 1n,
          feeTier: checkerFeeTier,
          deadline,
        },
      );

      const localAllowed =
        (localBitsRes.bits & (1 << 8)) !== 0
          ? (localBitsRes.bits & (1 << 0)) !== 0
          : (localBitsRes.bits & 0x1ff) === 0x0ff;

      const failedCodes = explainBlock(preview.inputBits);
      const agreement = preview.allowed === localAllowed && preview.inputBits === localBitsRes.bits;

      setCheckerResult({
        allowed: preview.allowed,
        inputBits: preview.inputBits,
        failedCodes,
        localAllowed,
        localBits: localBitsRes.bits,
        agreement,
      });
    } catch (err: unknown) {
      const decoded = decodeAppError(err);
      setCheckerResult({
        allowed: false,
        inputBits: 0,
        failedCodes: [decoded.messageKey],
        localAllowed: false,
        localBits: 0,
        agreement: false,
      });
    } finally {
      setIsCheckingTrade(false);
    }
  }, [vaultState, validVaultAddress, checkerType, checkerToken, checkerAmount, checkerFeeTier]);

  // Run the trade checker when the vault state is ready, and again whenever fresh data arrives,
  // so that the rules card and the checker never describe an older block than the rest of the page.
  const lastCheckedBlockRef = useRef<bigint | null>(null);
  useEffect(() => {
    if (!vaultState || isCheckingTrade) return;
    if (lastCheckedBlockRef.current === freshnessBlock && checkerResult) return;
    lastCheckedBlockRef.current = freshnessBlock;
    void handleCheckTrade();
  }, [vaultState, freshnessBlock, checkerResult, isCheckingTrade, handleCheckTrade]);

  // Execute on-chain action
  const handleExecuteAction = useCallback(async () => {
    if (!walletClient || !account || !validVaultAddress || !vaultState) return;
    setIsSubmittingAction(true);
    setDialogError(null);

    try {
      if (activeDialog === 'freeze') {
        await runTransaction({
          stepName: 'Emergency Freeze',
          publicClient: defaultPublicClient,
          walletClient,
          simulate: () =>
            defaultPublicClient.simulateContract({
              address: validVaultAddress,
              abi: mandateVaultAbi,
              functionName: 'freeze',
              account: walletClient.account,
            }),
          send: (sim) => walletClient.writeContract(sim.request),
        });
      } else if (activeDialog === 'deposit') {
        const amt = parseUnits(depositAmount, 6);
        // 1. Approve USDC first
        await runTransaction({
          stepName: 'Approve USDC',
          publicClient: defaultPublicClient,
          walletClient,
          simulate: () =>
            defaultPublicClient.simulateContract({
              address: vaultState.baseToken,
              abi: erc20Abi,
              functionName: 'approve',
              args: [validVaultAddress, amt],
              account: walletClient.account,
            }),
          send: (sim) => walletClient.writeContract(sim.request),
        });

        // 2. Deposit
        await runTransaction({
          stepName: 'Deposit',
          publicClient: defaultPublicClient,
          walletClient,
          simulate: () =>
            defaultPublicClient.simulateContract({
              address: validVaultAddress,
              abi: mandateVaultAbi,
              functionName: 'deposit',
              args: [amt],
              account: walletClient.account,
            }),
          send: (sim) => walletClient.writeContract(sim.request),
        });
      } else if (activeDialog === 'tighten') {
        const nextLimits = {
          maxTradeBase: parseUnits(tightenMaxTrade || '0', 6),
          maxDailyBase: parseUnits(tightenMaxDaily || '0', 6),
          maxTradesPerDay: tightenTrades,
          cooldownSec: tightenCooldown,
          expiresAt: vaultState.limits.expiresAt,
          withdrawDelaySec: tightenWithdrawDelay,
        };

        if (!isStricterOrEqual(nextLimits, vaultState.limits)) {
          setDialogError(t('error.NotStricter'));
          setIsSubmittingAction(false);
          return;
        }

        await runTransaction({
          stepName: 'Tighten Limits',
          publicClient: defaultPublicClient,
          walletClient,
          simulate: () =>
            defaultPublicClient.simulateContract({
              address: validVaultAddress,
              abi: mandateVaultAbi,
              functionName: 'tighten',
              args: [nextLimits, []],
              account: walletClient.account,
            }),
          send: (sim) => walletClient.writeContract(sim.request),
        });
      } else if (activeDialog === 'loosen') {
        const nextLimits = {
          maxTradeBase: parseUnits(loosenMaxTrade || '0', 6),
          maxDailyBase: parseUnits(loosenMaxDaily || '0', 6),
          maxTradesPerDay: loosenTrades,
          cooldownSec: loosenCooldown,
          expiresAt: BigInt(Math.floor(Date.now() / 1000) + loosenExpiry * 86400),
          withdrawDelaySec: loosenWithdrawDelay,
        };

        const tokensToAdd = loosenAddTokens
          .split(',')
          .map((s) => s.trim())
          .filter((s) => isAddress(s))
          .map((s) => getAddress(s));

        await runTransaction({
          stepName: 'Queue Loosening',
          publicClient: defaultPublicClient,
          walletClient,
          simulate: () =>
            defaultPublicClient.simulateContract({
              address: validVaultAddress,
              abi: mandateVaultAbi,
              functionName: 'queueLoosen',
              args: [nextLimits, tokensToAdd, loosenUnfreeze],
              account: walletClient.account,
            }),
          send: (sim) => walletClient.writeContract(sim.request),
        });
      } else if (activeDialog === 'withdraw') {
        const amt = parseUnits(withdrawAmount, 6);
        await runTransaction({
          stepName: 'Request Withdrawal',
          publicClient: defaultPublicClient,
          walletClient,
          simulate: () =>
            defaultPublicClient.simulateContract({
              address: validVaultAddress,
              abi: mandateVaultAbi,
              functionName: 'requestWithdraw',
              args: [getAddress(withdrawToken), amt],
              account: walletClient.account,
            }),
          send: (sim) => walletClient.writeContract(sim.request),
        });
      } else if (activeDialog === 'trader') {
        if (!isAddress(newTraderAddress)) {
          setDialogError(t('create.error.invalidTraderAddress'));
          setIsSubmittingAction(false);
          return;
        }

        await runTransaction({
          stepName: 'Set Trader',
          publicClient: defaultPublicClient,
          walletClient,
          simulate: () =>
            defaultPublicClient.simulateContract({
              address: validVaultAddress,
              abi: mandateVaultAbi,
              functionName: 'setTrader',
              args: [getAddress(newTraderAddress)],
              account: walletClient.account,
            }),
          send: (sim) => walletClient.writeContract(sim.request),
        });
      }

      setActiveDialog(null);
      await fetchData(false);
    } catch (err: unknown) {
      const decoded = decodeAppError(err);
      setDialogError(t(decoded.messageKey, decoded.params));
    } finally {
      setIsSubmittingAction(false);
    }
  }, [
    activeDialog,
    walletClient,
    account,
    validVaultAddress,
    vaultState,
    depositAmount,
    tightenMaxTrade,
    tightenMaxDaily,
    tightenTrades,
    tightenCooldown,
    tightenExpiry,
    tightenWithdrawDelay,
    loosenMaxTrade,
    loosenMaxDaily,
    loosenTrades,
    loosenCooldown,
    loosenExpiry,
    loosenWithdrawDelay,
    loosenAddTokens,
    loosenUnfreeze,
    withdrawToken,
    withdrawAmount,
    newTraderAddress,
    fetchData,
    t,
  ]);

  if (!validVaultAddress) {
    return (
      <div className="vault-dashboard-page">
        <ErrorState
          title={t('dashboard.error.notFound')}
          description={t('dashboard.error.notMandateVault')}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="vault-dashboard-page">
        <Skeleton height="140px" />
        <div className="vault-grid-two-col">
          <Skeleton height="260px" />
          <Skeleton height="260px" />
        </div>
      </div>
    );
  }

  if (vaultError || !vaultState) {
    return (
      <div className="vault-dashboard-page">
        <ErrorState
          title={t('styleguide.errorTitle')}
          description={vaultError ?? t('dashboard.error.notFound')}
          onRetry={() => fetchData(true)}
        />
      </div>
    );
  }

  const roleTooltip =
    role === 'owner'
      ? t('dashboard.roleTooltip.owner')
      : role === 'trader'
        ? t('dashboard.roleTooltip.trader')
        : t('dashboard.roleTooltip.stranger');

  const ruleNames = [
    'sane',
    'tokenAllowed',
    'notExpired',
    'notFrozen',
    'sizeOk',
    'dailyOk',
    'tradesOk',
    'cooldownOk',
    'isExit',
  ] as const;

  return (
    <div className="vault-dashboard-page">
      {/* 1. Header Card */}
      <header className="vault-header-card">
        <div className="vault-header-main">
          <h1>{t('dashboard.title')}</h1>
          <div className="vault-meta-row">
            <div className="vault-meta-item">
              <span>{t('create.success.address')}:</span>
              <AddressText address={validVaultAddress} />
            </div>
            <div className="vault-meta-item">
              <span>{t('dashboard.role.owner')}:</span>
              <AddressText address={vaultState.owner} />
            </div>
            <div className="vault-meta-item">
              <span>{t('dashboard.role.trader')}:</span>
              <AddressText address={vaultState.trader} />
            </div>
          </div>
        </div>

        <div className="vault-header-badges">
          <div className="vault-chips-row">
            <Chip
              variant={
                statusInfo.status === 'active'
                  ? 'active'
                  : statusInfo.status === 'frozen'
                    ? 'frozen'
                    : 'expired'
              }
            >
              {statusInfo.label}
            </Chip>
            <Tooltip content={roleTooltip}>
              <Chip variant="info">{t(`dashboard.role.${role}`)}</Chip>
            </Tooltip>
          </div>
          <div className="vault-freshness-box">
            <span>
              {t('dashboard.freshness.refreshed', { block: Number(freshnessBlock) })}
              {isStale ? <span> ({t('dashboard.freshness.stale')})</span> : null}
            </span>
            <Button
              variant="quiet"
              loading={isRefreshing}
              onClick={() => fetchData(false)}
              aria-label={t('dashboard.freshness.refresh')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isRefreshing ? 'spin-icon' : ''}
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              <span>{t('dashboard.freshness.refresh')}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* 2. Grid: Today & Rules */}
      <div className="vault-grid-two-col">
        {/* Today Card */}
        <section className="dashboard-card">
          <div className="dashboard-card-header">
            <h2>{t('dashboard.card.today')}</h2>
          </div>
          <div className="dashboard-card-body">
            {dayStats && (
              <>
                {/* Cooldown */}
                <FieldRow label={t('dashboard.today.cooldown')}>
                  {(() => {
                    const cooldownEndSec =
                      Number(vaultState.lastBuyAt) + vaultState.limits.cooldownSec;
                    const isCooldownActive =
                      vaultState.lastBuyAt > 0n && cooldownEndSec > Number(effectiveNowSec);
                    return isCooldownActive ? (
                      <Countdown targetTimestampSec={cooldownEndSec} />
                    ) : (
                      <span className="today-ready-pill">{t('dashboard.today.ready')}</span>
                    );
                  })()}
                </FieldRow>

                {/* Trades left today */}
                <div>
                  <Meter
                    label={t('dashboard.today.trades')}
                    value={dayStats.tradesToday}
                    max={vaultState.limits.maxTradesPerDay}
                  />
                  <div className="today-stat-subtext">
                    {t('dashboard.today.tradesRemaining', {
                      remaining: Math.max(
                        0,
                        vaultState.limits.maxTradesPerDay - dayStats.tradesToday,
                      ),
                      total: vaultState.limits.maxTradesPerDay,
                    })}
                  </div>
                </div>

                {/* Volume left today */}
                <div>
                  <Meter
                    label={t('dashboard.today.volume')}
                    value={Number(dayStats.buyVolumeTodayBase) / 1e6}
                    max={Number(vaultState.limits.maxDailyBase) / 1e6}
                    unit="USDC"
                  />
                  <div className="today-stat-subtext">
                    {(() => {
                      const maxDailyUsdc = Number(vaultState.limits.maxDailyBase) / 1e6;
                      const spentDailyUsdc = Number(dayStats.buyVolumeTodayBase) / 1e6;
                      const remainingUsdc = Math.max(0, maxDailyUsdc - spentDailyUsdc);
                      return t('dashboard.today.volumeRemaining', {
                        remaining: remainingUsdc.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        }),
                        total: maxDailyUsdc.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        }),
                      });
                    })()}
                  </div>
                </div>

                {/* UTC day rollover countdown */}
                <FieldRow label={t('dashboard.today.rollover')}>
                  <Countdown
                    targetTimestampSec={Number(effectiveNowSec) + dayStats.secondsUntilMidnight}
                  />
                </FieldRow>

                {/* Next pending event summary */}
                <FieldRow label={t('dashboard.today.nextPending')}>
                  {(() => {
                    const summary = getNextPendingSummary(
                      vaultState.pending.eta,
                      vaultState.withdrawal.eta,
                      Number(effectiveNowSec),
                    );
                    if (summary.type === 'none') {
                      return (
                        <span style={{ color: 'var(--color-muted)' }}>
                          {t('dashboard.today.noPendingEvents')}
                        </span>
                      );
                    }
                    const label =
                      summary.type === 'loosen'
                        ? t('dashboard.today.pendingLoosenSummary')
                        : t('dashboard.today.pendingWithdrawSummary');

                    if (summary.isReady) {
                      return (
                        <span className="today-ready-pill">
                          {label} ({t('dashboard.today.ready')})
                        </span>
                      );
                    }
                    return (
                      <div className="pending-event-countdown">
                        <span>{label} in </span>
                        <Countdown targetTimestampSec={summary.eta} />
                      </div>
                    );
                  })()}
                </FieldRow>
              </>
            )}
          </div>
        </section>

        {/* Rules Card */}
        <section className="dashboard-card">
          <div className="dashboard-card-header">
            <h2>{t('dashboard.card.rules')}</h2>
          </div>
          <div className="dashboard-card-body">
            <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
              {t('dashboard.rules.desc')}
            </p>
            <div className="rules-list">
              {ruleNames.map((rName, idx) => {
                const bitVal = checkerResult
                  ? (checkerResult.inputBits & (1 << idx)) !== 0
                  : idx !== 3 || !vaultState.frozen;

                return (
                  <div key={rName} className="rule-row-item">
                    <div className="rule-name-group">
                      <span
                        className={`rule-status-dot ${rName === 'isExit' ? 'neutral' : bitVal ? 'pass' : 'fail'}`}
                      />
                      <span>{t(`dashboard.rule.${rName}`)}</span>
                      <Tooltip content={t(`dashboard.rule.${rName}Tooltip`)} />
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                      {t('dashboard.rule.bit', { n: idx })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* 3. Grid: Balances & Pending */}
      <div className="vault-grid-two-col">
        {/* Balances Card */}
        <section className="dashboard-card">
          <div className="dashboard-card-header">
            <h2>{t('dashboard.card.balances')}</h2>
            {role === 'owner' && (
              <Button
                variant="secondary"
                onClick={() => {
                  setDepositAmount('50');
                  setActiveDialog('deposit');
                }}
              >
                {t('dashboard.balances.deposit')}
              </Button>
            )}
          </div>
          <div className="dashboard-card-body">
            {(() => {
              const baseBal =
                balances[vaultState.baseToken] ??
                balances[vaultState.baseToken.toLowerCase()] ??
                0n;
              const wokbBal =
                balances[DEFAULT_TOKENS.wokb.address] ??
                balances[DEFAULT_TOKENS.wokb.address.toLowerCase()] ??
                0n;
              const baseFormatted = formatTokenBalance(baseBal, 6, 'USDC');
              const wokbFormatted = formatTokenBalance(wokbBal, 18, 'WOKB');
              return (
                <>
                  <div className="rule-row-item">
                    <span style={{ fontWeight: 600 }}>{t('dashboard.balances.baseToken')}</span>
                    <span className="token-balance-value" title={baseFormatted.full} tabIndex={0}>
                      {baseFormatted.formatted}
                    </span>
                  </div>
                  <div className="rule-row-item">
                    <span style={{ fontWeight: 600 }}>{t('dashboard.balances.wokb')}</span>
                    <span className="token-balance-value" title={wokbFormatted.full} tabIndex={0}>
                      {wokbFormatted.formatted}
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </section>

        {/* Pending Card */}
        <section className="dashboard-card">
          <div className="dashboard-card-header">
            <h2>{t('dashboard.card.pending')}</h2>
          </div>
          <div className="dashboard-card-body">
            {vaultState.pending.eta === 0n && vaultState.withdrawal.eta === 0n ? (
              <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
                {t('dashboard.pending.none')}
              </p>
            ) : null}

            {/* Pending Loosening */}
            {vaultState.pending.eta > 0n && (
              <div className="pending-proposal-box">
                <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                  {t('dashboard.pending.loosenTitle')}
                </div>
                <FieldRow label={t('dashboard.pending.loosenEta')}>
                  <Countdown targetTimestampSec={vaultState.pending.eta} />
                </FieldRow>
                {role === 'owner' && (
                  <div className="pending-actions-row">
                    <Button
                      variant="primary"
                      disabled={effectiveNowSec < vaultState.pending.eta}
                      onClick={async () => {
                        if (!walletClient) return;
                        await runTransaction({
                          stepName: 'Execute Loosen',
                          publicClient: defaultPublicClient,
                          walletClient,
                          simulate: () =>
                            defaultPublicClient.simulateContract({
                              address: validVaultAddress,
                              abi: mandateVaultAbi,
                              functionName: 'executeLoosen',
                              account: walletClient.account,
                            }),
                          send: (sim) => walletClient.writeContract(sim.request),
                        });
                        fetchData(false);
                      }}
                    >
                      {t('dashboard.pending.executeLoosen')}
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={async () => {
                        if (!walletClient) return;
                        await runTransaction({
                          stepName: 'Cancel Loosen',
                          publicClient: defaultPublicClient,
                          walletClient,
                          simulate: () =>
                            defaultPublicClient.simulateContract({
                              address: validVaultAddress,
                              abi: mandateVaultAbi,
                              functionName: 'cancelLoosen',
                              account: walletClient.account,
                            }),
                          send: (sim) => walletClient.writeContract(sim.request),
                        });
                        fetchData(false);
                      }}
                    >
                      {t('dashboard.pending.cancelLoosen')}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Pending Withdrawal */}
            {vaultState.withdrawal.eta > 0n && (
              <div className="pending-proposal-box">
                <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                  {t('dashboard.pending.withdrawTitle')}
                </div>
                <div style={{ fontSize: '12px' }}>
                  Amount:{' '}
                  <AmountText amount={vaultState.withdrawal.amount} decimals={6} unit="USDC" />
                </div>
                <FieldRow label={t('dashboard.pending.withdrawEta')}>
                  <Countdown targetTimestampSec={vaultState.withdrawal.eta} />
                </FieldRow>
                {role === 'owner' && (
                  <div className="pending-actions-row">
                    <Button
                      variant="primary"
                      disabled={effectiveNowSec < vaultState.withdrawal.eta}
                      onClick={async () => {
                        if (!walletClient) return;
                        await runTransaction({
                          stepName: 'Execute Withdrawal',
                          publicClient: defaultPublicClient,
                          walletClient,
                          simulate: () =>
                            defaultPublicClient.simulateContract({
                              address: validVaultAddress,
                              abi: mandateVaultAbi,
                              functionName: 'executeWithdraw',
                              account: walletClient.account,
                            }),
                          send: (sim) => walletClient.writeContract(sim.request),
                        });
                        fetchData(false);
                      }}
                    >
                      {t('dashboard.pending.executeWithdraw')}
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={async () => {
                        if (!walletClient) return;
                        await runTransaction({
                          stepName: 'Cancel Withdrawal',
                          publicClient: defaultPublicClient,
                          walletClient,
                          simulate: () =>
                            defaultPublicClient.simulateContract({
                              address: validVaultAddress,
                              abi: mandateVaultAbi,
                              functionName: 'cancelWithdraw',
                              account: walletClient.account,
                            }),
                          send: (sim) => walletClient.writeContract(sim.request),
                        });
                        fetchData(false);
                      }}
                    >
                      {t('dashboard.pending.cancelWithdraw')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 4. Actions Card */}
      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <h2>{t('dashboard.card.actions')}</h2>
        </div>
        <div className="dashboard-card-body">
          <div className="actions-buttons-grid">
            {/* Freeze Button: owner or trader */}
            <Button
              variant="danger"
              disabled={role === 'stranger' || vaultState.frozen}
              onClick={() => setActiveDialog('freeze')}
            >
              {t('dashboard.action.freeze')}
            </Button>

            {/* Tighten Button: owner or trader */}
            <Button
              variant="secondary"
              disabled={role === 'stranger'}
              onClick={() => {
                setTightenMaxTrade((Number(vaultState.limits.maxTradeBase) / 1e6).toString());
                setTightenMaxDaily((Number(vaultState.limits.maxDailyBase) / 1e6).toString());
                setTightenTrades(vaultState.limits.maxTradesPerDay);
                setTightenCooldown(vaultState.limits.cooldownSec);
                setTightenExpiry(30);
                setTightenWithdrawDelay(vaultState.limits.withdrawDelaySec);
                setActiveDialog('tighten');
              }}
            >
              {t('dashboard.action.tighten')}
            </Button>

            {/* Queue Loosen Button: owner only */}
            <Button
              variant="secondary"
              disabled={role !== 'owner'}
              onClick={() => {
                setLoosenMaxTrade((Number(vaultState.limits.maxTradeBase) / 1e6).toString());
                setLoosenMaxDaily((Number(vaultState.limits.maxDailyBase) / 1e6).toString());
                setLoosenTrades(vaultState.limits.maxTradesPerDay);
                setLoosenCooldown(vaultState.limits.cooldownSec);
                setLoosenExpiry(30);
                setLoosenWithdrawDelay(vaultState.limits.withdrawDelaySec);
                setLoosenAddTokens('');
                setLoosenUnfreeze(false);
                setActiveDialog('loosen');
              }}
            >
              {t('dashboard.action.queueLoosen')}
            </Button>

            {/* Request Withdraw Button: owner only */}
            <Button
              variant="secondary"
              disabled={role !== 'owner'}
              onClick={() => {
                setWithdrawToken(vaultState.baseToken);
                setWithdrawAmount('10');
                setActiveDialog('withdraw');
              }}
            >
              {t('dashboard.action.requestWithdraw')}
            </Button>

            {/* Change Trader Button: owner only */}
            <Button
              variant="secondary"
              disabled={role !== 'owner'}
              onClick={() => {
                setNewTraderAddress('');
                setActiveDialog('trader');
              }}
            >
              {t('dashboard.action.changeTrader')}
            </Button>
          </div>
        </div>
      </section>

      {/* 5. Trade Checker Card */}
      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <h2>{t('dashboard.card.checker')}</h2>
        </div>
        <div className="dashboard-card-body">
          <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
            {t('dashboard.checker.desc')}
          </p>

          <div className="trade-checker-grid">
            <div className="checker-field">
              <label htmlFor="checker-trade-type">{t('dashboard.checker.tradeType')}</label>
              <select
                id="checker-trade-type"
                className="input-control"
                value={checkerType}
                onChange={(e) => setCheckerType(e.target.value as 'buy' | 'exit')}
              >
                <option value="buy">{t('dashboard.checker.buy')}</option>
                <option value="exit">{t('dashboard.checker.exit')}</option>
              </select>
            </div>

            <div className="checker-field">
              <label htmlFor="checker-token-select">{t('dashboard.checker.token')}</label>
              <select
                id="checker-token-select"
                className="input-control"
                value={
                  checkerToken.toLowerCase() === DEFAULT_TOKENS.wokb.address.toLowerCase()
                    ? DEFAULT_TOKENS.wokb.address
                    : checkerToken.toLowerCase() === DEFAULT_TOKENS.usdc.address.toLowerCase()
                      ? DEFAULT_TOKENS.usdc.address
                      : 'custom'
                }
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    setCheckerToken(e.target.value);
                  }
                }}
              >
                <option value={DEFAULT_TOKENS.wokb.address}>
                  {formatTokenOption(DEFAULT_TOKENS.wokb.address)}
                </option>
                <option value={DEFAULT_TOKENS.usdc.address}>
                  {formatTokenOption(DEFAULT_TOKENS.usdc.address)}
                </option>
                <option value="custom">{t('dashboard.checker.customToken')}</option>
              </select>
              {checkerToken.toLowerCase() !== DEFAULT_TOKENS.wokb.address.toLowerCase() &&
                checkerToken.toLowerCase() !== DEFAULT_TOKENS.usdc.address.toLowerCase() && (
                  <input
                    type="text"
                    className="input-control"
                    placeholder={t('dashboard.checker.tokenPlaceholder')}
                    value={checkerToken}
                    onChange={(e) => setCheckerToken(e.target.value)}
                  />
                )}
            </div>

            <div className="checker-field">
              <label htmlFor="checker-amount-input">{t('dashboard.checker.amount')}</label>
              <input
                id="checker-amount-input"
                type="text"
                data-testid="checker-amount-input"
                className="input-control"
                value={checkerAmount}
                onChange={(e) => setCheckerAmount(e.target.value)}
              />
            </div>

            <div className="checker-field">
              <label htmlFor="checker-fee-tier">{t('dashboard.checker.feeTier')}</label>
              <select
                id="checker-fee-tier"
                className="input-control"
                value={checkerFeeTier}
                onChange={(e) => setCheckerFeeTier(Number(e.target.value))}
              >
                <option value={500}>{t('dashboard.feeTier.500')}</option>
                <option value={3000}>{t('dashboard.feeTier.3000')}</option>
                <option value={10000}>{t('dashboard.feeTier.10000')}</option>
              </select>
            </div>
          </div>

          <Button variant="primary" loading={isCheckingTrade} onClick={handleCheckTrade}>
            {t('dashboard.checker.run')}
          </Button>

          {checkerResult && (
            <div className={`checker-result-box ${checkerResult.allowed ? 'allowed' : 'blocked'}`}>
              <div className="checker-result-header">
                {checkerResult.allowed ? (
                  <svg
                    className="checker-status-icon"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ) : (
                  <svg
                    className="checker-status-icon"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
                <span>
                  {checkerResult.allowed
                    ? t('dashboard.checker.allowed')
                    : t('dashboard.checker.blocked')}
                </span>
              </div>
              <div className="checker-result-agreement">
                {checkerResult.agreement
                  ? t('dashboard.checker.agreement')
                  : t('dashboard.checker.disagreement')}
              </div>
              {checkerResult.failedCodes.length > 0 && (
                <div className="checker-failed-rules">
                  <div className="checker-failed-title">
                    {t('dashboard.checker.failedRulesTitle')}:
                  </div>
                  <ul className="checker-failed-list">
                    {checkerResult.failedCodes.map((code, idx) => (
                      <li key={`${code}-${idx}`}>
                        {t(FAIL_CODE_KEYS[code] ?? 'dashboard.fail.other')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 6. Activity Timeline Card */}
      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <h2>{t('dashboard.card.activity')}</h2>
        </div>
        <div className="dashboard-card-body">
          {activityLogs.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
              {t('dashboard.activity.none')}
            </p>
          ) : (
            <div className="timeline-list">
              {activityLogs.map((log, index) => {
                const eventInfo = formatLogEvent(log, freshnessBlock, Number(effectiveNowSec), t);
                return (
                  <div key={`${log.transactionHash}-${index}`} className="timeline-event-item">
                    <div className="timeline-event-main">
                      <div className="timeline-event-primary-row">
                        <span className="timeline-event-title">{log.eventName}</span>
                        {eventInfo.detail && (
                          <span className={`timeline-detail-badge ${log.eventName.toLowerCase()}`}>
                            {eventInfo.detail}
                          </span>
                        )}
                      </div>
                      <div className="timeline-event-meta">
                        <span className="timeline-event-time">{eventInfo.localTime}</span>
                        <span className="timeline-relative-pill">{eventInfo.relative}</span>
                        <span>Block #{Number(log.blockNumber)}</span>
                      </div>
                    </div>
                    <div className="timeline-event-tx">
                      <AddressText address={log.transactionHash} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Action Dialogs */}
      {/* Freeze Dialog */}
      <Dialog
        open={activeDialog === 'freeze'}
        onClose={() => setActiveDialog(null)}
        title={t('dashboard.dialog.freezeTitle')}
      >
        <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
          {t('dashboard.action.freezeWarn')}
        </p>
        {dialogError && <div className="field-error-text">{dialogError}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setActiveDialog(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" loading={isSubmittingAction} onClick={handleExecuteAction}>
            {t('dashboard.dialog.freezeButton')}
          </Button>
        </div>
      </Dialog>

      {/* Deposit Dialog */}
      <Dialog
        open={activeDialog === 'deposit'}
        onClose={() => setActiveDialog(null)}
        title={t('dashboard.dialog.depositTitle')}
      >
        <FieldRow label={t('dashboard.dialog.depositCurrent')}>
          <AmountText amount={balances[vaultState.baseToken] ?? 0n} decimals={6} unit="USDC" />
        </FieldRow>
        <FieldRow label={t('dashboard.dialog.depositCap')}>
          <strong>{t('dashboard.cap500Usdc')}</strong>
        </FieldRow>
        <FieldRow label={t('dashboard.checker.amount')}>
          <input
            type="text"
            className="input-control"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
          />
        </FieldRow>
        {dialogError && <div className="field-error-text">{dialogError}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setActiveDialog(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={isSubmittingAction} onClick={handleExecuteAction}>
            {t('dashboard.dialog.depositButton')}
          </Button>
        </div>
      </Dialog>

      {/* Tighten Dialog */}
      <Dialog
        open={activeDialog === 'tighten'}
        onClose={() => setActiveDialog(null)}
        title={t('dashboard.dialog.tightenTitle')}
      >
        <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '12px' }}>
          {t('dashboard.dialog.tightenNotice')}
        </p>
        <FieldRow label={t('create.field.maxTrade')}>
          <input
            type="text"
            className="input-control"
            value={tightenMaxTrade}
            onChange={(e) => setTightenMaxTrade(e.target.value)}
          />
        </FieldRow>
        <FieldRow label={t('create.field.maxDaily')}>
          <input
            type="text"
            className="input-control"
            value={tightenMaxDaily}
            onChange={(e) => setTightenMaxDaily(e.target.value)}
          />
        </FieldRow>
        {dialogError && <div className="field-error-text">{dialogError}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setActiveDialog(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={isSubmittingAction} onClick={handleExecuteAction}>
            {t('dashboard.dialog.tightenButton')}
          </Button>
        </div>
      </Dialog>

      {/* Loosen Dialog */}
      <Dialog
        open={activeDialog === 'loosen'}
        onClose={() => setActiveDialog(null)}
        title={t('dashboard.dialog.loosenTitle')}
      >
        <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '12px' }}>
          {t('dashboard.dialog.loosenNotice', { delay: vaultState.loosenDelay })}
        </p>
        <FieldRow label={t('create.field.maxTrade')}>
          <input
            type="text"
            className="input-control"
            value={loosenMaxTrade}
            onChange={(e) => setLoosenMaxTrade(e.target.value)}
          />
        </FieldRow>
        <FieldRow label={t('create.field.maxDaily')}>
          <input
            type="text"
            className="input-control"
            value={loosenMaxDaily}
            onChange={(e) => setLoosenMaxDaily(e.target.value)}
          />
        </FieldRow>
        {dialogError && <div className="field-error-text">{dialogError}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setActiveDialog(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={isSubmittingAction} onClick={handleExecuteAction}>
            {t('dashboard.dialog.loosenButton')}
          </Button>
        </div>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog
        open={activeDialog === 'withdraw'}
        onClose={() => setActiveDialog(null)}
        title={t('dashboard.dialog.withdrawTitle')}
      >
        <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '12px' }}>
          {t('dashboard.dialog.withdrawNotice', { delay: vaultState.minWithdrawDelay })}
        </p>
        <FieldRow label={t('dashboard.checker.amount')}>
          <input
            type="text"
            className="input-control"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
          />
        </FieldRow>
        {dialogError && <div className="field-error-text">{dialogError}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setActiveDialog(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={isSubmittingAction} onClick={handleExecuteAction}>
            {t('dashboard.dialog.withdrawButton')}
          </Button>
        </div>
      </Dialog>

      {/* Trader Dialog */}
      <Dialog
        open={activeDialog === 'trader'}
        onClose={() => setActiveDialog(null)}
        title={t('dashboard.dialog.traderTitle')}
      >
        <FieldRow label={t('create.trader.customAddress')}>
          <input
            type="text"
            className="input-control full-width"
            value={newTraderAddress}
            placeholder={t('create.trader.addressPlaceholder')}
            onChange={(e) => setNewTraderAddress(e.target.value)}
          />
        </FieldRow>
        {dialogError && <div className="field-error-text">{dialogError}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setActiveDialog(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={isSubmittingAction} onClick={handleExecuteAction}>
            {t('dashboard.dialog.traderButton')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
