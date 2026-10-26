import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { isAddress, getAddress } from 'viem';
import { useTranslation } from '../i18n/index.js';
import { useTheme } from '../theme/ThemeContext.js';
import { useRouter, Link } from '../router/index.js';
import { Button } from '../ui/Button.js';
import { useWallet } from '../../chain/wallet.js';
import { formatShortAddress } from '../formatting/address.js';

export function Header() {
  const { t, lang, toggleLang } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { currentRoute } = useRouter();
  const { account, status: walletStatus, connect, disconnect, switchToXLayer } = useWallet();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const checksummedAccount = useMemo(() => {
    if (!account) return '';
    try {
      return isAddress(account) ? getAddress(account) : account;
    } catch {
      return account;
    }
  }, [account]);

  const shortAddress = useMemo(() => {
    return formatShortAddress(checksummedAccount);
  }, [checksummedAccount]);

  const handleCopyAccount = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(checksummedAccount);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard write failed
      }
    },
    [checksummedAccount],
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const navItems = [
    { to: '#/create', labelKey: 'nav.create' as const, path: '/create' },
    { to: '#/verify', labelKey: 'nav.verify' as const, path: '/verify' },
    { to: '#/agents', labelKey: 'nav.agents' as const, path: '/agents' },
    { to: '#/about', labelKey: 'nav.about' as const, path: '/about' },
  ];

  return (
    <header className="site-header app-header">
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
          <Button
            variant="quiet"
            className="lang-toggle"
            data-lang={lang}
            onClick={toggleLang}
            aria-label={t('nav.toggleLanguage')}
          >
            <span>{lang.toUpperCase()}</span>
          </Button>

          {/* Theme Switch */}
          <Button
            variant="quiet"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={t('nav.toggleTheme')}
          >
            <span>{theme === 'dark' ? '☀' : '☾'}</span>
          </Button>

          {/* Wallet connection / Account status */}
          {walletStatus === 'wrong_network' ? (
            <Button variant="danger" className="network-warning" onClick={switchToXLayer}>
              <span>{t('nav.switchNetwork')}</span>
            </Button>
          ) : walletStatus === 'connected' && account ? (
            <div className="wallet-pill-wrapper" ref={dropdownRef}>
              <div
                className="wallet-connected account-pill wallet-pill"
                role="region"
                aria-label={`Connected account ${checksummedAccount}`}
              >
                <span className="wallet-status-dot" aria-hidden="true" />
                <button
                  type="button"
                  className="wallet-address-btn"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  aria-expanded={dropdownOpen}
                  aria-haspopup="true"
                  title={checksummedAccount}
                >
                  <span>{shortAddress}</span>
                  <svg
                    className={`wallet-chevron ${dropdownOpen ? 'open' : ''}`}
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M2.5 4.5L6 8L9.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <button
                  type="button"
                  className="wallet-action-btn wallet-copy-btn"
                  onClick={handleCopyAccount}
                  aria-label={copied ? t('nav.addressCopied') : t('nav.copyAddress')}
                  title={copied ? t('nav.addressCopied') : t('nav.copyAddress')}
                >
                  {copied ? (
                    <svg
                      className="wallet-icon"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="var(--color-success, #10b981)"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg
                      className="wallet-icon"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <rect x="5.5" y="5.5" width="7" height="7" rx="1.5" />
                      <path
                        d="M10.5 5.5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </button>

                <span className="wallet-pill-divider" aria-hidden="true" />

                <button
                  type="button"
                  className="wallet-action-btn wallet-disconnect-btn"
                  onClick={() => disconnect()}
                  aria-label={t('nav.disconnectWallet')}
                  title={t('nav.disconnectWallet')}
                >
                  <svg
                    className="wallet-icon"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6" strokeLinecap="round" />
                    <path d="M10.5 11.5L14 8l-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M14 8H6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {dropdownOpen && (
                <div className="wallet-dropdown" role="menu">
                  <div className="wallet-dropdown-header">
                    <span className="wallet-dropdown-status">
                      <span className="wallet-status-dot" aria-hidden="true" />
                      <span>{t('nav.connected')}</span>
                    </span>
                    <button
                      type="button"
                      className="wallet-action-btn"
                      onClick={handleCopyAccount}
                      aria-label={copied ? t('nav.addressCopied') : t('nav.copyAddress')}
                      title={copied ? t('nav.addressCopied') : t('nav.copyAddress')}
                    >
                      {copied ? (
                        <svg className="wallet-icon" viewBox="0 0 16 16" fill="none" stroke="var(--color-success, #10b981)" strokeWidth="2">
                          <path d="M3.5 8.5L6.5 11.5L12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg className="wallet-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="5.5" y="5.5" width="7" height="7" rx="1.5" />
                          <path d="M10.5 5.5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5.5" strokeLinecap="round" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="wallet-dropdown-address">
                    <code>{checksummedAccount}</code>
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => {
                      disconnect();
                      setDropdownOpen(false);
                    }}
                    aria-label={t('nav.disconnectWallet')}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <span>{t('nav.disconnectWallet')}</span>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Button variant="primary" onClick={() => connect()}>
              <span>{t('nav.connectWallet')}</span>
            </Button>
          )}

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
