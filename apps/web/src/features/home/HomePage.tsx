import React from 'react';
import { useTranslation } from '../../shared/i18n/index.js';
import { useRouter } from '../../shared/router/index.js';
import { Button } from '../../shared/ui/Button.js';
import { usePageMeta } from '../../shared/hooks/usePageMeta.js';
import './home.css';

export function HomePage() {
  const { t } = useTranslation();
  const { navigate } = useRouter();

  usePageMeta(t('home.meta.title'), t('home.meta.desc'));

  return (
    <div className="home-container">
      {/* 1. Hero */}
      <section className="home-hero">
        <div className="home-watermark" aria-hidden="true">
          {t('home.hero.watermark')}
        </div>
        <div className="home-hero-badge">
          <span>{t('home.hero.badge')}</span>
        </div>
        <h1 className="home-hero-title">{t('home.hero.title')}</h1>
        <p className="home-hero-promise">{t('home.hero.promise')}</p>
        <div className="home-hero-actions">
          <Button variant="primary" onClick={() => navigate('#/create')}>
            {t('home.hero.ctaCreate')}
          </Button>
          <Button variant="secondary" onClick={() => navigate('#/verify')}>
            {t('home.hero.ctaVerify')}
          </Button>
        </div>
      </section>

      {/* 2. Value Cards */}
      <section className="home-values-grid">
        {/* Card 1: Instant tightening */}
        <div className="home-value-card">
          <div className="home-value-icon">
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
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <h2 className="home-value-title">{t('home.values.tightenTitle')}</h2>
          <p className="home-value-desc">{t('home.values.tightenDesc')}</p>
        </div>

        {/* Card 2: Delayed loosening */}
        <div className="home-value-card">
          <div className="home-value-icon">
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
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h2 className="home-value-title">{t('home.values.loosenTitle')}</h2>
          <p className="home-value-desc">{t('home.values.loosenDesc')}</p>
        </div>

        {/* Card 3: Exits always open */}
        <div className="home-value-card">
          <div className="home-value-icon">
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
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </div>
          <h2 className="home-value-title">{t('home.values.exitsTitle')}</h2>
          <p className="home-value-desc">{t('home.values.exitsDesc')}</p>
        </div>
      </section>

      {/* 3. Six-step "How It Works" Strip */}
      <section className="home-steps-card">
        <div className="home-section-header">
          <h2 className="home-section-title">{t('home.steps.title')}</h2>
          <p className="home-section-subtitle">{t('home.steps.subtitle')}</p>
        </div>
        <div className="home-steps-grid">
          {/* Step 1 */}
          <div className="home-step-item">
            <div className="home-step-num">{1}</div>
            <h3 className="home-step-title">{t('home.steps.step1Title')}</h3>
            <p className="home-step-desc">{t('home.steps.step1Desc')}</p>
          </div>
          {/* Step 2 */}
          <div className="home-step-item">
            <div className="home-step-num">{2}</div>
            <h3 className="home-step-title">{t('home.steps.step2Title')}</h3>
            <p className="home-step-desc">{t('home.steps.step2Desc')}</p>
          </div>
          {/* Step 3 */}
          <div className="home-step-item">
            <div className="home-step-num">{3}</div>
            <h3 className="home-step-title">{t('home.steps.step3Title')}</h3>
            <p className="home-step-desc">{t('home.steps.step3Desc')}</p>
          </div>
          {/* Step 4 */}
          <div className="home-step-item">
            <div className="home-step-num">{4}</div>
            <h3 className="home-step-title">{t('home.steps.step4Title')}</h3>
            <p className="home-step-desc">{t('home.steps.step4Desc')}</p>
          </div>
          {/* Step 5 */}
          <div className="home-step-item">
            <div className="home-step-num">{5}</div>
            <h3 className="home-step-title">{t('home.steps.step5Title')}</h3>
            <p className="home-step-desc">{t('home.steps.step5Desc')}</p>
          </div>
          {/* Step 6 */}
          <div className="home-step-item">
            <div className="home-step-num">{6}</div>
            <h3 className="home-step-title">{t('home.steps.step6Title')}</h3>
            <p className="home-step-desc">{t('home.steps.step6Desc')}</p>
          </div>
        </div>
      </section>

      {/* 4. Honest Limits Box */}
      <section className="home-limits-box">
        <div className="home-limits-header">
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
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{t('home.limits.title')}</span>
        </div>
        <ul className="home-limits-list">
          <li className="home-limit-item">
            <div>
              <strong>{t('home.limits.point1Strong')}</strong> {t('home.limits.point1Desc')}
            </div>
          </li>
          <li className="home-limit-item">
            <div>
              <strong>{t('home.limits.point2Strong')}</strong> {t('home.limits.point2Desc')}
            </div>
          </li>
          <li className="home-limit-item">
            <div>
              <strong>{t('home.limits.point3Strong')}</strong> {t('home.limits.point3Desc')}
            </div>
          </li>
          <li className="home-limit-item">
            <div>
              <strong>{t('home.limits.point4Strong')}</strong> {t('home.limits.point4Desc')}
            </div>
          </li>
        </ul>
      </section>

      {/* 5. Closing Call to Action */}
      <section className="home-cta-card">
        <h2 className="home-cta-title">{t('home.cta.title')}</h2>
        <p className="home-cta-desc">{t('home.cta.desc')}</p>
        <div className="home-cta-actions">
          <Button variant="primary" onClick={() => navigate('#/create')}>
            {t('home.hero.ctaCreate')}
          </Button>
          <Button variant="secondary" onClick={() => navigate('#/about')}>
            {t('home.cta.learnMore')}
          </Button>
        </div>
      </section>
    </div>
  );
}
