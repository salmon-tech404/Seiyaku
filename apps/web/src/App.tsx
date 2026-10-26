import React, { Suspense, lazy } from 'react';
import { useRouter } from './shared/router/index.js';
import { useTranslation } from './shared/i18n/index.js';
import { LayoutShell } from './shared/layout/LayoutShell.js';
import { HomePage } from './features/home/HomePage.js';
import { CreateVaultPage } from './features/create/CreateVaultPage.js';
import { VaultDashboardPage } from './features/vault/VaultDashboardPage.js';
import { ErrorState } from './shared/ui/ErrorState.js';

// Route-level lazy loading for non-initial routes
const VerifyPage = lazy(() =>
  import('./features/verify/VerifyPage.js').then((m) => ({ default: m.VerifyPage })),
);
const AboutPage = lazy(() =>
  import('./features/about/AboutPage.js').then((m) => ({ default: m.AboutPage })),
);
const AgentsPage = lazy(() =>
  import('./features/agents/AgentsPage.js').then((m) => ({ default: m.AgentsPage })),
);
const StyleguidePage = lazy(() =>
  import('./features/styleguide/StyleguidePage.js').then((m) => ({ default: m.StyleguidePage })),
);

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
        return (
          <Suspense
            fallback={
              <div
                className="page-loading-fallback"
                role="status"
                style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-muted)' }}
              >
                Loading circuit verifier...
              </div>
            }
          >
            <VerifyPage />
          </Suspense>
        );

      case '/about':
        return (
          <Suspense
            fallback={
              <div
                className="page-loading-fallback"
                role="status"
                style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-muted)' }}
              >
                Loading...
              </div>
            }
          >
            <AboutPage />
          </Suspense>
        );

      case '/agents':
        return (
          <Suspense
            fallback={
              <div
                className="page-loading-fallback"
                role="status"
                style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-muted)' }}
              >
                Loading...
              </div>
            }
          >
            <AgentsPage />
          </Suspense>
        );

      case '/styleguide':
        return (
          <Suspense
            fallback={
              <div
                className="page-loading-fallback"
                role="status"
                style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-muted)' }}
              >
                Loading...
              </div>
            }
          >
            <StyleguidePage />
          </Suspense>
        );

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
