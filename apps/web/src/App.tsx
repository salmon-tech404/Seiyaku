import React from 'react';
import { useRouter } from './shared/router/index.js';
import { useTranslation } from './shared/i18n/index.js';
import { LayoutShell } from './shared/layout/LayoutShell.js';
import { HomePage } from './features/home/HomePage.js';
import { AboutPage } from './features/about/AboutPage.js';
import { AgentsPage } from './features/agents/AgentsPage.js';
import { StyleguidePage } from './features/styleguide/StyleguidePage.js';
import { CreateVaultPage } from './features/create/CreateVaultPage.js';
import { VaultDashboardPage } from './features/vault/VaultDashboardPage.js';
import { VerifyPage } from './features/verify/VerifyPage.js';
import { ErrorState } from './shared/ui/ErrorState.js';

export function App() {
  const { currentRoute, navigate } = useRouter();
  const { t } = useTranslation();

  const renderContent = () => {
    switch (currentRoute.pattern) {
      case '/':
        return <HomePage />;

      case '/create':
        return <CreateVaultPage />;

      case '/vault/:address':
        return <VaultDashboardPage />;

      case '/verify':
      case '/verify/:address':
        return <VerifyPage />;

      case '/about':
        return <AboutPage />;

      case '/agents':
        return <AgentsPage />;

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
