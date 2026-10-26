import React from 'react';
import { useTranslation } from '../i18n/index.js';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="site-footer">
      <div className="footer-container">
        <p>{t('app.unauditedNotice')}</p>
        <p>{t('app.depositCapNotice')}</p>
        <div className="footer-links">
          <a
            href="https://github.com/seiyaku-protocol/seiyaku"
            target="_blank"
            rel="noreferrer"
            className="footer-link"
          >
            <span>{t('app.github')}</span>
          </a>
          <a
            href="https://github.com/seiyaku-protocol/seiyaku/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="footer-link"
          >
            <span>{t('app.docs')}</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
