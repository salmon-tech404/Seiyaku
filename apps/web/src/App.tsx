import React from 'react';
import { useRouter } from './shared/router/index.js';
import { useTranslation } from './shared/i18n/index.js';
import { LayoutShell } from './shared/layout/LayoutShell.js';
import { StyleguidePage } from './features/styleguide/StyleguidePage.js';
import { CreateVaultPage } from './features/create/CreateVaultPage.js';
import { ErrorState } from './shared/ui/ErrorState.js';

export function App() {
  const { currentRoute, navigate } = useRouter();
  const { t } = useTranslation();

  const renderContent = () => {
    switch (currentRoute.pattern) {
      case '/':
        return (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <h1 tabIndex={-1}>{t('app.title')}</h1>
            <p style={{ color: 'var(--color-muted)', marginTop: '8px' }}>{t('app.tagline')}</p>
          </div>
        );

      case '/create':
        return <CreateVaultPage />;

      case '/styleguide':
        return <StyleguidePage />;

      default:
        return (
          <ErrorState
            title={t('error.404.title')}
            description={t('error.404.desc')}
            onRetry={() => navigate('#/')}
          />
        );
    }
  };

  return <LayoutShell>{renderContent()}</LayoutShell>;
}
