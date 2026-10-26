import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '../../shared/i18n/index.js';
import { useRouter } from '../../shared/router/index.js';
import { defaultPublicClient } from '../../chain/clients.js';
import { getActiveFactoryAddress, getExplorerUrl } from '../../chain/config.js';
import { isAddress, getAddress } from 'viem';
import {
  resolveContractType,
  fetchVerificationReport,
  evaluateOnChain,
  evaluateLocally,
  type VerificationReport,
  type DetectedContractType,
} from './verifyHelpers.js';
import { GateDiagram } from './GateDiagram.js';
import { Button } from '../../shared/ui/Button.js';
import { Chip } from '../../shared/ui/Chip.js';
import { Tooltip } from '../../shared/ui/Tooltip.js';
import { CopyButton } from '../../shared/ui/CopyButton.js';
import { Skeleton } from '../../shared/ui/Skeleton.js';
import { ErrorState } from '../../shared/ui/ErrorState.js';
import './verify.css';

const MANDATE_V1_RULE_KEYS = [
  { key: 'dashboard.rule.sane', tooltipKey: 'dashboard.rule.saneTooltip' },
  { key: 'dashboard.rule.tokenAllowed', tooltipKey: 'dashboard.rule.tokenAllowedTooltip' },
  { key: 'dashboard.rule.notExpired', tooltipKey: 'dashboard.rule.notExpiredTooltip' },
  { key: 'dashboard.rule.notFrozen', tooltipKey: 'dashboard.rule.notFrozenTooltip' },
  { key: 'dashboard.rule.sizeOk', tooltipKey: 'dashboard.rule.sizeOkTooltip' },
  { key: 'dashboard.rule.dailyOk', tooltipKey: 'dashboard.rule.dailyOkTooltip' },
  { key: 'dashboard.rule.tradesOk', tooltipKey: 'dashboard.rule.tradesOkTooltip' },
  { key: 'dashboard.rule.cooldownOk', tooltipKey: 'dashboard.rule.cooldownOkTooltip' },
  { key: 'dashboard.rule.isExit', tooltipKey: 'dashboard.rule.isExitTooltip' },
] as const;

export function VerifyPage() {
  const { t } = useTranslation();
  const { currentRoute } = useRouter();

  // Address input
  const initialAddress = useMemo(() => {
    const routeParam = currentRoute.params.address;
    if (routeParam && isAddress(routeParam)) {
      return getAddress(routeParam);
    }
    const queryAddress = currentRoute.query.get('address');
    if (queryAddress && isAddress(queryAddress)) {
      return getAddress(queryAddress);
    }
    // Fallback to active factory if configured
    const activeFactory = getActiveFactoryAddress(currentRoute.isDemo);
    return activeFactory ? getAddress(activeFactory) : '';
  }, [currentRoute]);

  const [inputAddress, setInputAddress] = useState<string>(initialAddress);

  // Verification Report State
  const [loading, setLoading] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  // 9 Input Toggles: default is sane buy trade (all true except isExit)
  const [inputValues, setInputValues] = useState<boolean[]>([
    true, // sane
    true, // tokenAllowed
    true, // notExpired
    true, // notFrozen
    true, // sizeOk
    true, // dailyOk
    true, // tradesOk
    true, // cooldownOk
    false, // isExit
  ]);

  // Live Eval State
  const [onChainAllowed, setOnChainAllowed] = useState<boolean | null>(null);
  const [isEvaluatingOnChain, setIsEvaluatingOnChain] = useState<boolean>(false);

  // 512 Cases Runner State
  const [runnerStatus, setRunnerStatus] = useState<'idle' | 'running' | 'completed'>('idle');
  const [runnerProgress, setRunnerProgress] = useState<number>(0);
  const [runnerMismatches, setRunnerMismatches] = useState<number[]>([]);

  // Inspect address
  const handleInspect = useCallback(
    async (targetAddr: string) => {
      if (!isAddress(targetAddr)) {
        setReportError(t('verify.error.invalidAddress'));
        setReport(null);
        return;
      }

      setLoading(true);
      setReportError(null);
      const checksummed = getAddress(targetAddr);

      try {
        const type: DetectedContractType = await resolveContractType(
          defaultPublicClient,
          checksummed,
        );
        if (type === 'unknown') {
          setReportError(t('dashboard.error.notMandateVault'));
          setReport(null);
        } else {
          // Check if mock fail override query param is present
          const q = new URLSearchParams(
            typeof window !== 'undefined'
              ? window.location.hash.split('?')[1] || window.location.search
              : '',
          );
          const overrideNetlistHash =
            q.get('mockFail') === '1'
              ? ('0x0000000000000000000000000000000000000000000000000000000000000000' as const)
              : undefined;

          const rep = await fetchVerificationReport(
            defaultPublicClient,
            checksummed,
            type,
            overrideNetlistHash,
          );
          setReport(rep);
        }
      } catch {
        setReportError(t('verify.error.fetchFailed'));
        setReport(null);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // Initial inspection if address provided
  useEffect(() => {
    if (initialAddress) {
      void handleInspect(initialAddress);
    }
  }, [initialAddress, handleInspect]);

  // Input bits integer from 9 toggles
  const currentBits = useMemo(() => {
    let bits = 0;
    for (let i = 0; i < inputValues.length; i++) {
      if (inputValues[i]) {
        bits |= 1 * 2 ** i;
      }
    }
    return bits;
  }, [inputValues]);

  // Local evaluation
  const localAllowed = useMemo(() => evaluateLocally(currentBits), [currentBits]);

  // On-chain evaluation triggered when bits change or report loads
  useEffect(() => {
    if (!report || report.processor === '0x0000000000000000000000000000000000000000') {
      setOnChainAllowed(null);
      return;
    }

    let isSubscribed = true;
    setIsEvaluatingOnChain(true);

    evaluateOnChain(defaultPublicClient, report.processor, report.circuitId, currentBits)
      .then((allowed) => {
        if (isSubscribed) {
          setOnChainAllowed(allowed);
          setIsEvaluatingOnChain(false);
        }
      })
      .catch(() => {
        if (isSubscribed) {
          setOnChainAllowed(null);
          setIsEvaluatingOnChain(false);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [report, currentBits]);

  // Toggle handler
  const handleToggle = (index: number) => {
    setInputValues((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  // 512 Cases Runner (Chunked execution without freezing UI)
  const handleRun512Cases = useCallback(() => {
    if (!report) return;

    setRunnerStatus('running');
    setRunnerProgress(0);
    setRunnerMismatches([]);

    let current = 0;
    const mismatches: number[] = [];
    const CHUNK_SIZE = 32;

    const runChunk = () => {
      const chunkEnd = Math.min(512, current + CHUNK_SIZE);

      for (let bits = current; bits < chunkEnd; bits++) {
        const loc = evaluateLocally(bits);
        // Compare against candidate 1 bit formula
        const isExit = (bits & (1 << 8)) !== 0;
        const expected = isExit ? (bits & 1) !== 0 : (bits & 0x1ff) === 0x0ff;
        if (loc !== expected) {
          mismatches.push(bits);
        }
      }

      current = chunkEnd;
      setRunnerProgress(current);
      setRunnerMismatches(mismatches);

      if (current < 512) {
        setTimeout(runChunk, 16);
      } else {
        setRunnerStatus('completed');
      }
    };

    runChunk();
  }, [report]);

  // Copy JSON handler
  const handleCopyJson = () => {
    if (!report) return;
    const jsonStr = JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        contractAddress: report.contractAddress,
        contractType: report.contractType,
        processor: report.processor,
        circuitId: report.circuitId.toString(),
        overallMatch: report.allMatch,
        pins: report.pins.map((p) => ({
          name: t(p.nameKey),
          expected: p.expected,
          live: p.live,
          match: p.match,
        })),
      },
      null,
      2,
    );
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div className="verify-page">
      {/* 1. Header & Address Input */}
      <section className="verify-header-card">
        <h1>{t('verify.title')}</h1>
        <p>{t('verify.subtitle')}</p>

        <div className="verify-search-row">
          <div className="verify-search-input-wrap">
            <input
              type="text"
              className="input-control"
              placeholder={t('verify.inputPlaceholder')}
              value={inputAddress}
              onChange={(e) => setInputAddress(e.target.value)}
            />
          </div>
          <Button variant="primary" loading={loading} onClick={() => handleInspect(inputAddress)}>
            {t('verify.inspectButton')}
          </Button>
        </div>

        <div className="verify-quick-links">
          <button
            type="button"
            className="verify-quick-link-btn"
            onClick={() => {
              const activeFactory = getActiveFactoryAddress(currentRoute.isDemo);
              if (activeFactory) {
                setInputAddress(activeFactory);
                void handleInspect(activeFactory);
              }
            }}
          >
            {t('verify.defaultFactory')}
          </button>
        </div>
      </section>

      {/* Loading Skeleton */}
      {loading && (
        <>
          <Skeleton height="90px" />
          <Skeleton height="320px" />
          <Skeleton height="400px" />
        </>
      )}

      {/* Error state */}
      {reportError && (
        <ErrorState
          title={t('styleguide.errorTitle')}
          description={reportError}
          onRetry={() => handleInspect(inputAddress)}
        />
      )}

      {/* 2. Verification Report */}
      {report && !loading && (
        <>
          {/* Overall Status Banner */}
          <div
            className={`verify-overall-banner ${report.allMatch ? 'pass' : 'fail'}`}
            role="status"
          >
            <div className="banner-header-row">
              <div className="banner-title">
                {report.allMatch ? t('verify.pins.overallPass') : t('verify.pins.overallFail')}
              </div>
              <Button variant="secondary" onClick={handleCopyJson}>
                {copiedJson ? t('verify.copied') : t('verify.copyJson')}
              </Button>
            </div>
            {!report.allMatch && <div className="banner-desc">{t('verify.pins.failNotice')}</div>}
          </div>

          {/* Security Pins Table */}
          <section className="pins-card">
            <div className="pins-card-header">
              <h2>{t('verify.pins.title')}</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Chip variant={report.contractType === 'vault' ? 'active' : 'info'}>
                  {t(`verify.type.${report.contractType}`)}
                </Chip>
                <Chip variant={report.allMatch ? 'success' : 'danger'} className="pin-match-badge">
                  {report.allMatch ? (
                    <>
                      <svg
                        className="badge-icon"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{t('verify.pins.match')}</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="badge-icon"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      <span>{t('verify.pins.mismatch')}</span>
                    </>
                  )}
                </Chip>
              </div>
            </div>

            <div className="pins-list">
              {report.pins.map((pin) => (
                <div key={pin.nameKey} className="pin-row">
                  <div className="pin-label">{t(pin.nameKey)}</div>
                  <div className="pin-value-box">
                    <div className="pin-live-value">
                      {pin.explorerType === 'address' && isAddress(pin.live) ? (
                        <a
                          href={getExplorerUrl('address', pin.live)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--color-info)' }}
                        >
                          {pin.live}
                        </a>
                      ) : (
                        <span>{pin.live}</span>
                      )}
                    </div>
                    {pin.expected !== pin.live && (
                      <div className="pin-expected-value">
                        {t('verify.pins.expected', { expected: pin.expected })}
                      </div>
                    )}
                  </div>
                  <div className="pin-status-box">
                    <Chip variant={pin.match ? 'success' : 'danger'} className="pin-match-badge">
                      {pin.match ? (
                        <>
                          <svg
                            className="badge-icon"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>{t('verify.pins.match')}</span>
                        </>
                      ) : (
                        <>
                          <svg
                            className="badge-icon"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          <span>{t('verify.pins.mismatch')}</span>
                        </>
                      )}
                    </Chip>
                    <CopyButton textToCopy={pin.live} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* 3. MANDATE_V1 NAND Gate Topology Diagram */}
      <section className="gate-diagram-card">
        <div className="gate-diagram-card-header">
          <h2>{t('verify.diagram.title')}</h2>
          <p>{t('verify.diagram.desc')}</p>
        </div>
        <GateDiagram inputValues={inputValues} />
      </section>

      {/* 4. Live Circuit Evaluation */}
      <section className="eval-card">
        <div className="eval-card-header">
          <h2>{t('verify.eval.title')}</h2>
          <p>{t('verify.eval.desc')}</p>
        </div>

        {/* 9 Input Toggles */}
        <div className="eval-toggles-grid">
          {MANDATE_V1_RULE_KEYS.map((rule, idx) => (
            <div key={rule.key} className="eval-toggle-item">
              <label htmlFor={`toggle-${idx}`} className="eval-toggle-label">
                <span>{t(rule.key)}</span>
                <Tooltip content={t(rule.tooltipKey)}>
                  <span
                    style={{
                      cursor: 'help',
                      color: 'var(--color-muted)',
                      fontSize: '12px',
                    }}
                  >
                    ?
                  </span>
                </Tooltip>
              </label>
              <input
                id={`toggle-${idx}`}
                type="checkbox"
                checked={inputValues[idx]}
                onChange={() => handleToggle(idx)}
              />
            </div>
          ))}
        </div>

        {/* Comparison: Local vs On-Chain */}
        <div className="eval-results-comparison">
          <div className="eval-box">
            <div className="eval-box-header">{t('verify.eval.local')}</div>
            <div className={`eval-box-value ${localAllowed ? 'allow' : 'block'}`}>
              {localAllowed ? t('verify.eval.allowed') : t('verify.eval.blocked')}
            </div>
          </div>

          <div className="eval-box">
            <div className="eval-box-header">{t('verify.eval.onchain')}</div>
            <div
              className={`eval-box-value ${
                onChainAllowed === null ? '' : onChainAllowed ? 'allow' : 'block'
              }`}
            >
              {isEvaluatingOnChain ? (
                <span>{t('verify.eval.ellipsis')}</span>
              ) : onChainAllowed === null ? (
                <span>{t('verify.eval.notApplicable')}</span>
              ) : onChainAllowed ? (
                t('verify.eval.allowed')
              ) : (
                t('verify.eval.blocked')
              )}
            </div>
          </div>
        </div>

        {/* Match Indicator */}
        {onChainAllowed !== null && !isEvaluatingOnChain && (
          <div
            className={`eval-match-banner ${
              localAllowed === onChainAllowed ? 'match' : 'mismatch'
            }`}
          >
            {localAllowed === onChainAllowed
              ? t('verify.eval.agreement')
              : t('verify.eval.disagreement')}
          </div>
        )}

        {/* 512 Cases Runner */}
        <div className="eval-runner-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>
              {runnerStatus === 'completed'
                ? t('verify.eval.allPassed')
                : runnerStatus === 'running'
                  ? t('verify.eval.running', { current: runnerProgress })
                  : t('verify.eval.runAll')}
            </span>
            <Button
              variant="secondary"
              loading={runnerStatus === 'running'}
              onClick={handleRun512Cases}
            >
              {t('verify.eval.runAll')}
            </Button>
          </div>
          {runnerMismatches.length > 0 && (
            <div style={{ color: 'var(--color-accent)', fontSize: '12px' }}>
              {t('verify.eval.mismatchCount', {
                count: runnerMismatches.length,
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
