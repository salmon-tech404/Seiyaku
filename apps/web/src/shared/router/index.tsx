import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

export interface RouteMatch {
  path: string;
  pattern: string;
  params: Record<string, string>;
  query: URLSearchParams;
  isDemo: boolean;
}

interface RouterContextValue {
  currentRoute: RouteMatch;
  navigate: (pathWithHashOrQuery: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function parseHash(hash: string): { path: string; query: URLSearchParams } {
  const clean = hash.replace(/^#\/?/, '/');
  const [pathname = '/', search = ''] = clean.split('?');
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return {
    path: normalizedPath || '/',
    query: new URLSearchParams(search),
  };
}

export function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    const actual = pathParts[i];
    if (!p || !actual) return null;

    if (p.startsWith(':')) {
      params[p.slice(1)] = actual;
    } else if (p.toLowerCase() !== actual.toLowerCase()) {
      return null;
    }
  }

  return params;
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [hash, setHash] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.hash : '#/',
  );

  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash || '#/');
      // Scroll restoration
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0);
      }
      // Focus management: move focus to main heading
      setTimeout(() => {
        const heading = document.querySelector('main h1, h1') as HTMLElement | null;
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus();
        }
      }, 50);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((to: string) => {
    const formatted = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`;
    if (typeof window !== 'undefined') {
      window.location.hash = formatted;
    }
  }, []);

  const currentRoute: RouteMatch = useMemo(() => {
    const { path, query } = parseHash(hash);
    const isDemo = query.get('demo') === '1';

    // Route table
    const knownPatterns = [
      '/',
      '/create',
      '/vault/:address',
      '/verify',
      '/verify/:address',
      '/agents',
      '/about',
      '/styleguide',
    ];

    for (const pattern of knownPatterns) {
      const params = matchPattern(pattern, path);
      if (params !== null) {
        return { path, pattern, params, query, isDemo };
      }
    }

    return { path, pattern: '404', params: {}, query, isDemo };
  }, [hash]);

  const value = useMemo(() => ({ currentRoute, navigate }), [currentRoute, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
}

export function Link({
  to,
  children,
  className,
  'aria-label': ariaLabel,
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
  onClick?: () => void;
}) {
  const href = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`;
  return (
    <a href={href} className={className} aria-label={ariaLabel} onClick={onClick}>
      {children}
    </a>
  );
}
