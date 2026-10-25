import { useEffect, useState } from 'react';
import { useTranslation } from './shared/i18n/index.js';

export function App() {
  const { t } = useTranslation();
  const [route, setRoute] = useState<string>(() => window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <main data-route={route}>
      <h1>{t('app.title')}</h1>
    </main>
  );
}
