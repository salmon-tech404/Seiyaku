import React from 'react';
import { useTranslation } from '../../shared/i18n/index.js';
import { usePageMeta } from '../../shared/hooks/usePageMeta.js';
import { CopyButton } from '../../shared/ui/CopyButton.js';
import { RULE_FAILURE_CODES } from '@seiyaku/circuit-tools';
import './agents.css';

/**
 * Concrete typed example of TradeParams in JSON format.
 */
export const SAMPLE_TRADE_PARAMS_JSON = JSON.stringify(
  {
    tokenIn: '0xB6CEceAB302E2E4948951eE7843FC24E92933061', // USDC
    tokenOut: '0xe538905cf8410324e03a5a23c1c177a474d59b2b', // WOKB
    feeTier: 500, // 0.05%
    amountIn: '25000000', // 25 USDC (6 decimals)
    amountOutMin: '120000000000000000', // min expected WOKB (18 decimals)
    deadline: 1774000000, // Unix timestamp in seconds (must be <= block.timestamp + 600)
  },
  null,
  2,
);

const BLOCK_REASONS = [
  { code: RULE_FAILURE_CODES.sane, descKey: 'agents.reasons.saneDesc' },
  { code: RULE_FAILURE_CODES.tokenAllowed, descKey: 'agents.reasons.tokenAllowedDesc' },
  { code: RULE_FAILURE_CODES.notExpired, descKey: 'agents.reasons.notExpiredDesc' },
  { code: RULE_FAILURE_CODES.notFrozen, descKey: 'agents.reasons.notFrozenDesc' },
  { code: RULE_FAILURE_CODES.sizeOk, descKey: 'agents.reasons.sizeOkDesc' },
  { code: RULE_FAILURE_CODES.dailyOk, descKey: 'agents.reasons.dailyOkDesc' },
  { code: RULE_FAILURE_CODES.tradesOk, descKey: 'agents.reasons.tradesOkDesc' },
  { code: RULE_FAILURE_CODES.cooldownOk, descKey: 'agents.reasons.cooldownOkDesc' },
];

export function AgentsPage() {
  const { t } = useTranslation();

  usePageMeta(t('agents.meta.title'), t('agents.meta.desc'));

  return (
    <div className="agents-container">
      {/* 1. Header */}
      <header className="agents-header">
        <h1 className="agents-title">{t('agents.header.title')}</h1>
        <p className="agents-subtitle">{t('agents.header.subtitle')}</p>
      </header>

      {/* 2. Notice: SDK arrives in the next release */}
      <div className="agents-sdk-notice">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0, marginTop: '2px' }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div>
          <strong>{t('agents.notice.tag')}</strong>: {t('agents.notice.desc')}
        </div>
      </div>

      {/* 3. What an Agent Can and Cannot Do (Permissions Table) */}
      <section className="agents-section">
        <h2 className="agents-section-title">{t('agents.permissions.title')}</h2>
        <div className="agents-table-card">
          <table className="agents-table">
            <thead>
              <tr>
                <th>{t('agents.permissions.colAction')}</th>
                <th>{t('agents.permissions.colAllowed')}</th>
                <th>{t('agents.permissions.colDetails')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionTrade')}</strong>
                </td>
                <td className="agents-check-yes">{t('agents.permissions.yes')}</td>
                <td>{t('agents.permissions.actionTradeDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionTighten')}</strong>
                </td>
                <td className="agents-check-yes">{t('agents.permissions.yes')}</td>
                <td>{t('agents.permissions.actionTightenDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionFreeze')}</strong>
                </td>
                <td className="agents-check-yes">{t('agents.permissions.yes')}</td>
                <td>{t('agents.permissions.actionFreezeDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionCancelLoosen')}</strong>
                </td>
                <td className="agents-check-yes">{t('agents.permissions.yes')}</td>
                <td>{t('agents.permissions.actionCancelLoosenDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionWithdraw')}</strong>
                </td>
                <td className="agents-check-no">{t('agents.permissions.no')}</td>
                <td>{t('agents.permissions.actionWithdrawDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionLoosen')}</strong>
                </td>
                <td className="agents-check-no">{t('agents.permissions.no')}</td>
                <td>{t('agents.permissions.actionLoosenDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionTransfer')}</strong>
                </td>
                <td className="agents-check-no">{t('agents.permissions.no')}</td>
                <td>{t('agents.permissions.actionTransferDesc')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Trade Request Format (TradeParams JSON) */}
      <section className="agents-section">
        <div className="agents-code-card">
          <div className="agents-code-header">
            <h2 className="agents-code-title">{t('agents.format.title')}</h2>
            <CopyButton text={SAMPLE_TRADE_PARAMS_JSON} />
          </div>
          <p style={{ color: 'var(--color-muted)', fontSize: '13px', margin: 0 }}>
            {t('agents.format.desc')}
          </p>
          <pre className="agents-code-pre">{SAMPLE_TRADE_PARAMS_JSON}</pre>
        </div>
      </section>

      {/* 5. Block Reasons List (from explainBlock) */}
      <section className="agents-section">
        <h2 className="agents-section-title">{t('agents.reasons.title')}</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: '14px', margin: 0 }}>
          {t('agents.reasons.desc')}
        </p>
        <div className="agents-reasons-grid">
          {BLOCK_REASONS.map((reason) => (
            <div key={reason.code} className="agents-reason-item">
              <span className="agents-reason-code">{reason.code}</span>
              <p className="agents-reason-desc">{t(reason.descKey)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
