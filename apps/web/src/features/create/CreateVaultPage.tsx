import React, { useReducer, useState, useCallback, useMemo } from 'react';
import { useTranslation } from '../../shared/i18n/index.js';
import { useRouter } from '../../shared/router/index.js';
import { useWallet } from '../../chain/wallet.js';
import { defaultPublicClient } from '../../chain/clients.js';
import { sendCreateVault } from '../../chain/factory.js';
import { getActiveFactoryAddress, DEFAULT_TOKENS } from '../../chain/config.js';
import { erc20Abi, mandateVaultFactoryAbi } from '../../chain/abi/index.js';
import { decodeAppError } from '../../chain/errors.js';
import { isAddress, getAddress, parseUnits } from 'viem';
import { VAULT_TEMPLATES } from './templates.js';
import {
  getInitialCreateVaultState,
  createVaultReducer,
  createVaultFormSchema,
} from './createVaultState.js';
import { Button } from '../../shared/ui/Button.js';
import { FieldRow } from '../../shared/ui/FieldRow.js';
import { Dialog } from '../../shared/ui/Dialog.js';
import { CopyButton } from '../../shared/ui/CopyButton.js';
import { AddressText } from '../../shared/ui/AddressText.js';
import { ErrorState } from '../../shared/ui/ErrorState.js';
import './create.css';

export function CreateVaultPage() {
  const { t } = useTranslation();
  const { currentRoute, navigate } = useRouter();
  const { account, status: walletStatus, walletClient, switchToXLayer } = useWallet();

  const [state, dispatch] = useReducer(createVaultReducer, undefined, getInitialCreateVaultState);

  // Dialog & Flow states
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [createdVaultAddress, setCreatedVaultAddress] = useState<string | null>(null);
  const [createdTxHash, setCreatedTxHash] = useState<string | null>(null);

  const factoryAddress = useMemo(() => {
    return getActiveFactoryAddress(currentRoute.isDemo);
  }, [currentRoute.isDemo]);

  const baseToken = DEFAULT_TOKENS.usdc.address;

  // Derived effective trader address
  const effectiveTrader: string = useMemo(() => {
    if (state.traderOption === 'wallet') {
      return account || '0x0000000000000000000000000000000000000000';
    }
    return state.customTrader;
  }, [state.traderOption, account, state.customTrader]);

  // Check if trader equals owner
  const isTraderSameAsOwner = useMemo(() => {
    if (!account) return false;
    return effectiveTrader.toLowerCase() === account.toLowerCase();
  }, [account, effectiveTrader]);

  // Add ERC20 Token handler with live on-chain check
  const handleAddToken = useCallback(async () => {
    const raw = state.newTokenInput.trim();
    if (!isAddress(raw)) {
      dispatch({ type: 'TOKEN_CHECK_ERROR', error: 'create.token.error.notContract' });
      return;
    }

    const tokenAddr = getAddress(raw);

    // Cannot be base token (USDC)
    if (tokenAddr.toLowerCase() === baseToken.toLowerCase()) {
      dispatch({ type: 'TOKEN_CHECK_ERROR', error: 'create.token.error.isBaseToken' });
      return;
    }

    // Check duplicate
    if (state.allowedTokens.some((t) => t.address.toLowerCase() === tokenAddr.toLowerCase())) {
      dispatch({ type: 'TOKEN_CHECK_ERROR', error: 'create.token.error.duplicate' });
      return;
    }

    dispatch({ type: 'TOKEN_CHECK_START' });

    try {
      // 1. Check bytecode
      const code = await defaultPublicClient.getBytecode({ address: tokenAddr });
      if (!code || code === '0x') {
        dispatch({ type: 'TOKEN_CHECK_ERROR', error: 'create.token.error.notContract' });
        return;
      }

      // 2. Read symbol and decimals
      const [symbol, decimals] = await Promise.all([
        defaultPublicClient.readContract({
          address: tokenAddr,
          abi: erc20Abi,
          functionName: 'symbol',
        }),
        defaultPublicClient.readContract({
          address: tokenAddr,
          abi: erc20Abi,
          functionName: 'decimals',
        }),
      ]);

      dispatch({
        type: 'TOKEN_CHECK_SUCCESS',
        token: {
          address: tokenAddr,
          symbol: String(symbol),
          decimals: Number(decimals),
        },
      });
    } catch {
      dispatch({ type: 'TOKEN_CHECK_ERROR', error: 'create.token.error.readFailed' });
    }
  }, [state.newTokenInput, state.allowedTokens, baseToken]);

  // Handle Review & Open Dialog
  const handleReview = useCallback(async () => {
    // 1. Validate Form
    const validationResult = createVaultFormSchema.safeParse({
      templateId: state.templateId,
      maxTradeBase: state.maxTradeBase,
      maxDailyBase: state.maxDailyBase,
      maxTradesPerDay: state.maxTradesPerDay,
      cooldownSec: state.cooldownSec,
      expiryDays: state.expiryDays,
      withdrawDelaySec: state.withdrawDelaySec,
      traderOption: state.traderOption,
      customTrader: effectiveTrader,
      allowedTokens: state.allowedTokens,
    });

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validationResult.error.issues) {
        const field = issue.path[0];
        if (field) {
          fieldErrors[String(field)] = issue.message;
        }
      }
      dispatch({ type: 'SET_FORM_ERRORS', errors: fieldErrors });
      return;
    }

    dispatch({ type: 'SET_FORM_ERRORS', errors: {} });
    setIsConfirmOpen(true);
    setIsSimulating(true);
    setSimulationError(null);

    // 2. Run simulation if wallet is connected
    if (!walletClient || !account || !factoryAddress) {
      setIsSimulating(false);
      return;
    }

    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const limits = {
        maxTradeBase: parseUnits(state.maxTradeBase, 6),
        maxDailyBase: parseUnits(state.maxDailyBase, 6),
        maxTradesPerDay: state.maxTradesPerDay,
        cooldownSec: state.cooldownSec,
        expiresAt: BigInt(nowSec + state.expiryDays * 86400),
        withdrawDelaySec: state.withdrawDelaySec,
      };

      await defaultPublicClient.simulateContract({
        address: factoryAddress,
        abi: mandateVaultFactoryAbi,
        functionName: 'createVault',
        args: [
          getAddress(effectiveTrader),
          limits,
          state.allowedTokens.map((t) => getAddress(t.address)),
        ],
        account: getAddress(account),
      });

      setIsSimulating(false);
    } catch (err: unknown) {
      setIsSimulating(false);
      const decoded = decodeAppError(err);
      setSimulationError(t(decoded.messageKey, decoded.params));
    }
  }, [state, effectiveTrader, walletClient, account, factoryAddress, t]);

  // Handle Send Transaction
  const handleDeploy = useCallback(async () => {
    if (!walletClient || !account || !factoryAddress) return;

    dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });

    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const limits = {
        maxTradeBase: parseUnits(state.maxTradeBase, 6),
        maxDailyBase: parseUnits(state.maxDailyBase, 6),
        maxTradesPerDay: state.maxTradesPerDay,
        cooldownSec: state.cooldownSec,
        expiresAt: BigInt(nowSec + state.expiryDays * 86400),
        withdrawDelaySec: state.withdrawDelaySec,
      };

      const result = await sendCreateVault({
        walletClient,
        publicClient: defaultPublicClient,
        factoryAddress,
        trader: getAddress(effectiveTrader),
        limits,
        allowedTokens: state.allowedTokens.map((t) => getAddress(t.address)),
      });

      setCreatedVaultAddress(result.vaultAddress);
      setCreatedTxHash(result.txHash);
      setIsConfirmOpen(false);
    } catch (err: unknown) {
      const decoded = decodeAppError(err);
      setSimulationError(t(decoded.messageKey, decoded.params));
    } finally {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  }, [
    walletClient,
    account,
    factoryAddress,
    state.maxTradeBase,
    state.maxDailyBase,
    state.maxTradesPerDay,
    state.cooldownSec,
    state.expiryDays,
    state.withdrawDelaySec,
    state.allowedTokens,
    effectiveTrader,
    t,
  ]);

  if (!factoryAddress) {
    return (
      <div className="create-page">
        <ErrorState title={t('common.notDeployed')} description={t('create.error.notDeployed')} />
      </div>
    );
  }

  const tokenListString = state.allowedTokens.map((t) => t.symbol).join(', ') || 'none';

  return (
    <div className="create-page">
      <div className="create-header">
        <h1 tabIndex={-1}>{t('create.title')}</h1>
        <p>{t('create.subtitle')}</p>
      </div>

      <div className="create-grid">
        <div className="create-sections">
          {/* Section 1: Templates & Limits */}
          <section className="create-section">
            <div className="create-section-header">
              <h2>{t('create.section1.title')}</h2>
              <p>{t('create.section1.desc')}</p>
            </div>

            <div className="template-cards-grid">
              {(['careful', 'balanced', 'agent_safe'] as const).map((id) => (
                <div
                  key={id}
                  className={`template-card ${state.templateId === id ? 'selected' : ''}`}
                  onClick={() => dispatch({ type: 'SELECT_TEMPLATE', templateId: id })}
                  role="button"
                  tabIndex={0}
                >
                  <h3>{t(VAULT_TEMPLATES[id].nameKey)}</h3>
                  <p>{t(VAULT_TEMPLATES[id].descKey)}</p>
                </div>
              ))}
              <div
                className={`template-card ${state.templateId === 'custom' ? 'selected' : ''}`}
                onClick={() => dispatch({ type: 'SELECT_TEMPLATE', templateId: 'custom' })}
                role="button"
                tabIndex={0}
              >
                <h3>{t('create.templates.custom.name')}</h3>
                <p>{t('create.templates.custom.desc')}</p>
              </div>
            </div>

            <div className="form-rows">
              <FieldRow
                label={t('create.field.maxTrade')}
                tooltip={t('create.field.maxTradeTooltip')}
              >
                <input
                  type="text"
                  className="input-control"
                  aria-label={t('create.field.maxTrade')}
                  value={state.maxTradeBase}
                  onChange={(e) =>
                    dispatch({ type: 'SET_FIELD', field: 'maxTradeBase', value: e.target.value })
                  }
                />
              </FieldRow>
              {state.formErrors.maxTradeBase && (
                <div className="field-error-text">{t(state.formErrors.maxTradeBase)}</div>
              )}

              <FieldRow
                label={t('create.field.maxDaily')}
                tooltip={t('create.field.maxDailyTooltip')}
              >
                <input
                  type="text"
                  className="input-control"
                  aria-label={t('create.field.maxDaily')}
                  value={state.maxDailyBase}
                  onChange={(e) =>
                    dispatch({ type: 'SET_FIELD', field: 'maxDailyBase', value: e.target.value })
                  }
                />
              </FieldRow>
              {state.formErrors.maxDailyBase && (
                <div className="field-error-text">{t(state.formErrors.maxDailyBase)}</div>
              )}

              <FieldRow
                label={t('create.field.maxTradesPerDay')}
                tooltip={t('create.field.maxTradesPerDayTooltip')}
              >
                <input
                  type="number"
                  className="input-control"
                  aria-label={t('create.field.maxTradesPerDay')}
                  value={state.maxTradesPerDay}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_FIELD',
                      field: 'maxTradesPerDay',
                      value: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </FieldRow>

              <FieldRow
                label={t('create.field.cooldown')}
                tooltip={t('create.field.cooldownTooltip')}
              >
                <input
                  type="number"
                  className="input-control"
                  aria-label={t('create.field.cooldown')}
                  value={state.cooldownSec}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_FIELD',
                      field: 'cooldownSec',
                      value: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </FieldRow>

              <FieldRow label={t('create.field.expiry')} tooltip={t('create.field.expiryTooltip')}>
                <input
                  type="number"
                  className="input-control"
                  aria-label={t('create.field.expiry')}
                  value={state.expiryDays}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_FIELD',
                      field: 'expiryDays',
                      value: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </FieldRow>

              <FieldRow
                label={t('create.field.withdrawDelay')}
                tooltip={t('create.field.withdrawDelayTooltip')}
              >
                <input
                  type="number"
                  className="input-control"
                  aria-label={t('create.field.withdrawDelay')}
                  value={state.withdrawDelaySec}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_FIELD',
                      field: 'withdrawDelaySec',
                      value: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </FieldRow>
            </div>
          </section>

          {/* Section 2: Who Trades */}
          <section className="create-section">
            <div className="create-section-header">
              <h2>{t('create.section2.title')}</h2>
              <p>{t('create.section2.desc')}</p>
            </div>

            <div className="trader-choice-group">
              <label className="trader-radio-item">
                <input
                  type="radio"
                  name="traderOption"
                  checked={state.traderOption === 'wallet'}
                  onChange={() => dispatch({ type: 'SET_TRADER_OPTION', option: 'wallet' })}
                />
                <span>{t('create.trader.wallet')}</span>
              </label>

              <label className="trader-radio-item">
                <input
                  type="radio"
                  name="traderOption"
                  checked={state.traderOption === 'custom'}
                  onChange={() => dispatch({ type: 'SET_TRADER_OPTION', option: 'custom' })}
                />
                <span>{t('create.trader.custom')}</span>
              </label>

              {state.traderOption === 'custom' && (
                <div style={{ marginTop: '8px' }}>
                  <FieldRow
                    label={t('create.trader.customAddress')}
                    tooltip={t('create.trader.tooltip')}
                  >
                    <input
                      type="text"
                      className="input-control full-width custom-trader-input"
                      placeholder={t('create.trader.addressPlaceholder')}
                      value={state.customTrader}
                      onChange={(e) =>
                        dispatch({ type: 'SET_CUSTOM_TRADER', address: e.target.value })
                      }
                    />
                  </FieldRow>
                  {state.formErrors.customTrader && (
                    <div className="field-error-text">{t(state.formErrors.customTrader)}</div>
                  )}
                </div>
              )}

              {isTraderSameAsOwner && (
                <div className="notice-box">{t('create.trader.warningSame')}</div>
              )}
            </div>
          </section>

          {/* Section 3: Allowed Tokens */}
          <section className="create-section">
            <div className="create-section-header">
              <h2>{t('create.section3.title')}</h2>
              <p>{t('create.section3.desc')}</p>
            </div>

            <div className="tokens-list">
              {state.allowedTokens.length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
                  {t('create.token.none')}
                </p>
              )}
              {state.allowedTokens.map((tok) => (
                <div key={tok.address} className="token-row">
                  <div className="token-info">
                    <span className="token-symbol">{tok.symbol}</span>
                    <AddressText address={tok.address} />
                  </div>
                  <Button
                    variant="quiet"
                    onClick={() => dispatch({ type: 'REMOVE_TOKEN', address: tok.address })}
                  >
                    {t('create.token.remove')}
                  </Button>
                </div>
              ))}
            </div>

            <div className="token-add-box">
              <input
                type="text"
                className="input-control full-width"
                placeholder={t('create.token.addressPlaceholder')}
                value={state.newTokenInput}
                onChange={(e) => dispatch({ type: 'SET_NEW_TOKEN_INPUT', input: e.target.value })}
              />
              <Button
                variant="secondary"
                loading={state.tokenValidationState === 'checking'}
                disabled={!state.newTokenInput.trim() || state.allowedTokens.length >= 20}
                onClick={handleAddToken}
              >
                {t('create.token.add')}
              </Button>
            </div>
            {state.tokenValidationError && (
              <div className="token-error-text">{t(state.tokenValidationError)}</div>
            )}
          </section>
        </div>

        {/* Live Summary Sidebar */}
        <aside className="create-summary-sticky">
          <div className="create-summary-card">
            <h2>{t('create.summary.title')}</h2>
            <div className="create-summary-body">
              {t('create.summary.text', {
                trader: isTraderSameAsOwner ? t('create.trader.wallet') : effectiveTrader,
                tokens: tokenListString,
                maxTrade: state.maxTradeBase,
                maxDaily: state.maxDailyBase,
                trades: state.maxTradesPerDay,
                cooldown: `${state.cooldownSec}s`,
                expiry: state.expiryDays,
                withdrawDelay: `${state.withdrawDelaySec}s`,
              })}
            </div>

            <div className="notice-box">
              <p>{t('app.depositCapNotice')}</p>
              <p style={{ marginTop: '4px' }}>{t('app.unauditedNotice')}</p>
            </div>

            {walletStatus !== 'connected' ? (
              <Button
                variant="primary"
                onClick={() => {
                  if (walletStatus === 'wrong_network') {
                    switchToXLayer();
                  }
                }}
              >
                {walletStatus === 'wrong_network' ? t('nav.switchNetwork') : t('nav.connectWallet')}
              </Button>
            ) : (
              <Button variant="primary" onClick={handleReview}>
                {t('create.button.review')}
              </Button>
            )}
          </div>
        </aside>
      </div>

      {/* Confirmation & Simulation Dialog */}
      <Dialog
        open={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title={t('create.dialog.title')}
      >
        <p style={{ fontSize: '14px', color: 'var(--color-muted)', marginBottom: '16px' }}>
          {t('create.dialog.summary')}
        </p>

        <div className="dialog-summary-list">
          <div className="dialog-summary-row">
            <span>{t('create.dialog.factoryAddress')}</span>
            <AddressText address={factoryAddress} />
          </div>
          <div className="dialog-summary-row">
            <span>{t('create.field.maxTrade')}</span>
            <strong>{state.maxTradeBase} USDC</strong>
          </div>
          <div className="dialog-summary-row">
            <span>{t('create.field.maxDaily')}</span>
            <strong>{state.maxDailyBase} USDC</strong>
          </div>
          <div className="dialog-summary-row">
            <span>{t('create.field.withdrawDelay')}</span>
            <strong>{state.withdrawDelaySec}s</strong>
          </div>
        </div>

        {isSimulating && (
          <div style={{ color: 'var(--color-info)', fontSize: '13px', margin: '12px 0' }}>
            {t('create.dialog.simulating')}
          </div>
        )}

        {simulationError ? (
          <div className="field-error-text" style={{ margin: '12px 0' }}>
            {simulationError}
          </div>
        ) : (
          !isSimulating && (
            <div style={{ color: 'var(--color-success)', fontSize: '13px', margin: '12px 0' }}>
              {t('create.dialog.simulationSuccess')}
            </div>
          )
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setIsConfirmOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={state.isSubmitting}
            disabled={isSimulating || Boolean(simulationError)}
            onClick={handleDeploy}
          >
            {t('create.dialog.confirmButton')}
          </Button>
        </div>
      </Dialog>

      {/* Success Dialog */}
      <Dialog
        open={Boolean(createdVaultAddress)}
        onClose={() => setCreatedVaultAddress(null)}
        title={t('create.success.title')}
      >
        <p style={{ fontSize: '14px', color: 'var(--color-muted)', marginBottom: '16px' }}>
          {t('create.success.desc')}
        </p>

        {createdVaultAddress && (
          <div className="dialog-summary-list">
            <div className="dialog-summary-row">
              <span>{t('create.success.address')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AddressText address={createdVaultAddress} />
                <CopyButton textToCopy={createdVaultAddress} />
              </div>
            </div>
            {createdTxHash && (
              <div className="dialog-summary-row">
                <span>{t('create.success.txHash')}</span>
                <AddressText address={createdTxHash} />
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <Button
            variant="primary"
            onClick={() => {
              const addr = createdVaultAddress;
              setCreatedVaultAddress(null);
              navigate(`#/vault/${addr}`);
            }}
          >
            {t('create.success.openDashboard')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
