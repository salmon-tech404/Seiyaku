import React, { useState } from 'react';
import { useTranslation } from '../i18n/index.js';
import { useTheme } from '../theme/ThemeContext.js';
import { useRouter, Link } from '../router/index.js';
import { Button } from '../ui/Button.js';

export function Header() {
  const { t, lang, toggleLang } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { currentRoute } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { to: '#/create', labelKey: 'nav.create' as const, path: '/create' },
    { to: '#/verify', labelKey: 'nav.verify' as const, path: '/verify' },
    { to: '#/agents', labelKey: 'nav.agents' as const, path: '/agents' },
    { to: '#/about', labelKey: 'nav.about' as const, path: '/about' },
  ];

  return (
    <header className="site-header">
      <div className="header-container">
        {/* Brand Link with inline SVG logo (seal + NAND gate motif) */}
        <Link to="#/" className="brand-link" aria-label={t('app.title')}>
          <svg
            className="brand-logo-svg"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect width="32" height="32" rx="6" fill="var(--color-accent-bg)" />
            {/* NAND gate shape */}
            <path
              d="M8 9H16C19.3 9 22 11.7 22 15C22 18.3 19.3 21 16 21H8V9Z"
              stroke="#ffffff"
              strokeWidth="2"
              fill="none"
            />
            {/* Inversion bubble */}
            <circle
              cx="24"
              cy="15"
              r="2"
              stroke="#ffffff"
              strokeWidth="2"
              fill="var(--color-accent-bg)"
            />
          </svg>
          <span>{t('app.title')}</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="nav-links" aria-label={t('nav.menu')}>
          {navItems.map((item) => {
            const isActive = currentRoute.path.startsWith(item.path);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        {/* Header Controls */}
        <div className="header-controls">
          {/* Language Switch */}
          <Button variant="quiet" onClick={toggleLang} aria-label={t('nav.toggleLanguage')}>
            <span>{lang.toUpperCase()}</span>
          </Button>

          {/* Theme Switch */}
          <Button variant="quiet" onClick={toggleTheme} aria-label={t('nav.toggleTheme')}>
            <span>{theme === 'dark' ? '☀' : '☾'}</span>
          </Button>

          {/* Wallet placeholder */}
          <Button variant="primary">
            <span>{t('nav.connectWallet')}</span>
          </Button>

          {/* Mobile menu toggle */}
          <Button
            variant="quiet"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.menu')}
          >
            <span>{mobileMenuOpen ? '✕' : '☰'}</span>
          </Button>
        </div>
      </div>

      {/* Mobile nav menu drawer */}
      {mobileMenuOpen && (
        <nav className="nav-links-mobile" aria-label={t('nav.menu')}>
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="nav-item"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>{t(item.labelKey)}</span>
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
