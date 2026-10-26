import React from 'react';
import { useTranslation } from '../../shared/i18n/index.js';
import { usePageMeta } from '../../shared/hooks/usePageMeta.js';
import { PROTOCOL_CONSTANTS } from '../../chain/config.js';
import './about.css';

interface RuleCardItem {
  bit: number;
  titleKey: string;
  descKey: string;
}

const RULES: RuleCardItem[] = [
  { bit: 0, titleKey: 'dashboard.rule.sane', descKey: 'dashboard.rule.saneTooltip' },
  {
    bit: 1,
    titleKey: 'dashboard.rule.tokenAllowed',
    descKey: 'dashboard.rule.tokenAllowedTooltip',
  },
  { bit: 2, titleKey: 'dashboard.rule.notExpired', descKey: 'dashboard.rule.notExpiredTooltip' },
  { bit: 3, titleKey: 'dashboard.rule.notFrozen', descKey: 'dashboard.rule.notFrozenTooltip' },
  { bit: 4, titleKey: 'dashboard.rule.sizeOk', descKey: 'dashboard.rule.sizeOkTooltip' },
  { bit: 5, titleKey: 'dashboard.rule.dailyOk', descKey: 'dashboard.rule.dailyOkTooltip' },
  { bit: 6, titleKey: 'dashboard.rule.tradesOk', descKey: 'dashboard.rule.tradesOkTooltip' },
  { bit: 7, titleKey: 'dashboard.rule.cooldownOk', descKey: 'dashboard.rule.cooldownOkTooltip' },
  { bit: 8, titleKey: 'dashboard.rule.isExit', descKey: 'dashboard.rule.isExitTooltip' },
];

export function AboutPage() {
  const { t } = useTranslation();

  usePageMeta(t('about.meta.title'), t('about.meta.desc'));

  return (
    <div className="about-container">
      {/* 1. Header */}
      <header className="about-header">
        <h1 className="about-title">{t('about.header.title')}</h1>
        <p className="about-subtitle">{t('about.header.subtitle')}</p>
      </header>

      {/* 2. Nine Rules Explained in Plain Language */}
      <section className="about-section">
        <h2 className="about-section-title">{t('about.rules.title')}</h2>
        <div className="about-rules-grid">
          {RULES.map((rule) => (
            <div key={rule.bit} className="about-rule-card">
              <div className="about-rule-badge">
                <span className="about-rule-bit">
                  {t('about.rules.bitLabel', { bit: rule.bit })}
                </span>
              </div>
              <h3 className="about-rule-title">{t(rule.titleKey)}</h3>
              <p className="about-rule-desc">{t(rule.descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Tighten vs Loosen Explainer with Animation */}
      <section className="about-section">
        <div className="about-explainer-card">
          <div>
            <h2 className="about-section-title">{t('about.asymmetry.title')}</h2>
            <p style={{ color: 'var(--color-muted)', fontSize: '14px', margin: '4px 0 0 0' }}>
              {t('about.asymmetry.subtitle')}
            </p>
          </div>

          <div className="about-explainer-grid">
            {/* Immediate Tightening */}
            <div className="about-explainer-col tighten">
              <div className="about-explainer-header">
                <h3 className="about-explainer-title">{t('about.asymmetry.tightenTitle')}</h3>
                <span className="about-explainer-badge immediate">
                  {t('about.asymmetry.tightenBadge')}
                </span>
              </div>
              <p className="about-explainer-desc">{t('about.asymmetry.tightenDesc')}</p>
              <div className="about-anim-track">
                <div className="about-anim-fill-tighten" />
              </div>
            </div>

            {/* Delayed Loosening */}
            <div className="about-explainer-col loosen">
              <div className="about-explainer-header">
                <h3 className="about-explainer-title">{t('about.asymmetry.loosenTitle')}</h3>
                <span className="about-explainer-badge delayed">
                  {t('about.asymmetry.loosenBadge')}
                </span>
              </div>
              <p className="about-explainer-desc">{t('about.asymmetry.loosenDesc')}</p>
              <div className="about-anim-track">
                <div className="about-anim-fill-loosen" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Why Exits Are Always Open */}
      <section className="about-section">
        <div className="about-exits-card">
          <h2 className="about-exits-title">{t('about.exits.title')}</h2>
          <p className="about-exits-desc">{t('about.exits.desc')}</p>
        </div>
      </section>

      {/* 5. Trust Model and Limits Table (Synced with config) */}
      <section className="about-section">
        <div className="about-trust-card">
          <h2 className="about-section-title">{t('about.trust.title')}</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '14px', margin: 0 }}>
            {t('about.trust.subtitle')}
          </p>

          <table className="about-table">
            <thead>
              <tr>
                <th>{t('about.trust.colRole')}</th>
                <th>{t('about.trust.colCan')}</th>
                <th>{t('about.trust.colCannot')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{t('about.trust.roleOwner')}</strong>
                </td>
                <td>{t('about.trust.ownerCan')}</td>
                <td>{t('about.trust.ownerCannot')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('about.trust.roleTrader')}</strong>
                </td>
                <td>{t('about.trust.traderCan')}</td>
                <td>{t('about.trust.traderCannot')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('about.trust.roleCircuit')}</strong>
                </td>
                <td>{t('about.trust.circuitCan')}</td>
                <td>{t('about.trust.circuitCannot')}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 'var(--space-2)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 var(--space-2) 0' }}>
              {t('about.limits.title')}
            </h3>
            <ul
              style={{
                margin: 0,
                paddingLeft: '20px',
                color: 'var(--color-muted)',
                fontSize: '13px',
                lineHeight: '1.6',
              }}
            >
              <li>
                <strong>{t('about.limits.depositCapLabel')}:</strong>{' '}
                {t('about.limits.depositCapVal', { cap: PROTOCOL_CONSTANTS.depositCapUsdc })}
              </li>
              <li>
                <strong>{t('about.limits.minLoosenDelayLabel')}:</strong>{' '}
                {t('about.limits.minLoosenDelayVal', {
                  hours: Math.floor(PROTOCOL_CONSTANTS.minLoosenDelaySec / 3600),
                })}
              </li>
              <li>
                <strong>{t('about.limits.minWithdrawDelayLabel')}:</strong>{' '}
                {t('about.limits.minWithdrawDelayVal', {
                  hours: Math.floor(PROTOCOL_CONSTANTS.minWithdrawDelaySec / 3600),
                })}
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 6. Honest Prior Art & Source Links */}
      <section className="about-section">
        <div className="about-links-card">
          <h2 className="about-section-title">{t('about.priorArt.title')}</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
            {t('about.priorArt.desc')}
          </p>

          <div className="about-links-row" style={{ marginTop: 'var(--space-2)' }}>
            <a
              href={PROTOCOL_CONSTANTS.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="about-link-btn"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              <span>{t('about.links.github')}</span>
            </a>
            <a
              href={PROTOCOL_CONSTANTS.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="about-link-btn"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span>{t('about.links.docs')}</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
