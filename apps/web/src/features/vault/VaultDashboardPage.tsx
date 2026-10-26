import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '../../shared/i18n/index.js';
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
import { CopyButton } from '../../shared/ui/CopyButton.js';
import { AmountText } from '../../shared/ui/AmountText.js';
import { TimeText } from '../../shared/ui/TimeText.js';
import { Skeleton } from '../../shared/ui/Skeleton.js';
import { ErrorState } from '../../shared/ui/ErrorState.js';
import './vault.css';

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
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    try {
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
      const nowBig = BigInt(Math.floor(Date.now() / 1000));
      const localBitsRes = computeInputBits(
        {
          baseToken: vaultState.baseToken,
          frozen: vaultState.frozen,
          dayIndex: vaultState.dayIndex,
          tradesToday: vaultState.tradesToday,
          buyVolumeTodayBase: vaultState.buyVolumeTodayBase,
          lastBuyAt: vaultState.lastBuyAt,
          allowedTokens: new Set([DEFAULT_TOKENS.wokb.address.toLowerCase()]),
          balances: new Map([
            [vaultState.baseToken.toLowerCase(), balances[vaultState.baseToken] ?? 0n],
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

  // Auto-run trade checker when vaultState is ready and checker hasn't run yet
  useEffect(() => {
    if (vaultState && !checkerResult && !isCheckingTrade) {
      void handleCheckTrade();
    }
  }, [vaultState, checkerResult, isCheckingTrade, handleCheckTrade]);

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
              <CopyButton textToCopy={validVaultAddress} />
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
            <Button variant="quiet" loading={isRefreshing} onClick={() => fetchData(false)}>
              <span>{t('common.retry')}</span>
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
                <Meter
                  label={t('dashboard.today.volume')}
                  value={Number(dayStats.buyVolumeTodayBase) / 1e6}
                  max={Number(vaultState.limits.maxDailyBase) / 1e6}
                  unit="USDC"
                />
                <Meter
                  label={t('dashboard.today.trades')}
                  value={dayStats.tradesToday}
                  max={vaultState.limits.maxTradesPerDay}
                />
                <FieldRow label={t('dashboard.today.rollover')}>
                  <TimeText timestampSec={nowSec + dayStats.secondsUntilMidnight} />
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
                      <span className={`rule-status-dot ${bitVal ? 'pass' : 'fail'}`} />
                      <span>{t(`dashboard.rule.${rName}`)}</span>
                      <Tooltip content={t(`dashboard.rule.${rName}Tooltip`)} />
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Bit {idx}</span>
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
            <div className="rule-row-item">
              <span style={{ fontWeight: 600 }}>{t('dashboard.balances.baseToken')}</span>
              <AmountText amount={balances[vaultState.baseToken] ?? 0n} decimals={6} unit="USDC" />
            </div>
            <div className="rule-row-item">
              <span style={{ fontWeight: 600 }}>{t('dashboard.balances.wokb')}</span>
              <AmountText
                amount={balances[DEFAULT_TOKENS.wokb.address] ?? 0n}
                decimals={18}
                unit="WOKB"
              />
            </div>
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

          <div className="actions-buttons-grid" style={{ marginBottom: '8px' }}>
            <FieldRow label={t('dashboard.checker.tradeType')}>
              <select
                className="input-control"
                value={checkerType}
                onChange={(e) => setCheckerType(e.target.value as 'buy' | 'exit')}
              >
                <option value="buy">{t('dashboard.checker.buy')}</option>
                <option value="exit">{t('dashboard.checker.exit')}</option>
              </select>
            </FieldRow>

            <FieldRow label={t('dashboard.checker.token')}>
              <input
                type="text"
                className="input-control"
                value={checkerToken}
                onChange={(e) => setCheckerToken(e.target.value)}
              />
            </FieldRow>

            <FieldRow label={t('dashboard.checker.amount')}>
              <input
                type="text"
                data-testid="checker-amount-input"
                className="input-control"
                value={checkerAmount}
                onChange={(e) => setCheckerAmount(e.target.value)}
              />
            </FieldRow>

            <FieldRow label={t('dashboard.checker.feeTier')}>
              <select
                className="input-control"
                value={checkerFeeTier}
                onChange={(e) => setCheckerFeeTier(Number(e.target.value))}
              >
                <option value={500}>{t('dashboard.feeTier.500')}</option>
                <option value={3000}>{t('dashboard.feeTier.3000')}</option>
                <option value={10000}>{t('dashboard.feeTier.10000')}</option>
              </select>
            </FieldRow>
          </div>

          <Button variant="primary" loading={isCheckingTrade} onClick={handleCheckTrade}>
            {t('dashboard.checker.run')}
          </Button>

          {checkerResult && (
            <div className={`checker-result-box ${checkerResult.allowed ? 'allowed' : 'blocked'}`}>
              <div style={{ fontWeight: 600 }}>
                {checkerResult.allowed
                  ? t('dashboard.checker.allowed')
                  : t('dashboard.checker.blocked')}
              </div>
              <div>
                {checkerResult.agreement
                  ? t('dashboard.checker.agreement')
                  : t('dashboard.checker.disagreement')}
              </div>
              {checkerResult.failedCodes.length > 0 && (
                <div>
                  {t('dashboard.checker.failedRules', {
                    codes: checkerResult.failedCodes.join(', '),
                  })}
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
              {activityLogs.map((log, index) => (
                <div key={`${log.transactionHash}-${index}`} className="timeline-event-item">
                  <div>
                    <span className="timeline-event-title">{log.eventName}</span>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                      Block #{Number(log.blockNumber)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AddressText address={log.transactionHash} />
                  </div>
                </div>
              ))}
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
