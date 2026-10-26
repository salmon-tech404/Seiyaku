import React from 'react';
import { useRouter } from '../router/index.js';
import { useTranslation } from '../i18n/index.js';
import { Header } from './Header.js';
import { Footer } from './Footer.js';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const { currentRoute } = useRouter();
  const { t } = useTranslation();

  return (
    <div className="layout-shell">
      {currentRoute.isDemo && (
        <div className="demo-banner" role="banner">
          <span>{t('common.demoBanner', { delay: 120 })}</span>
        </div>
      )}
      <Header />
      <main className="site-main">{children}</main>
      <Footer />
    </div>
  );
}
