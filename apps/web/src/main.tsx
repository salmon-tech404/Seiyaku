import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './shared/theme/ThemeContext.js';
import { I18nProvider } from './shared/i18n/index.js';
import { RouterProvider } from './shared/router/index.js';
import { WalletProvider } from './chain/wallet.js';
import { App } from './App.js';

import './shared/styles/global.css';
import './shared/ui/ui.css';
import './shared/layout/layout.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <I18nProvider>
          <RouterProvider>
            <WalletProvider>
              <App />
            </WalletProvider>
          </RouterProvider>
        </I18nProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}
