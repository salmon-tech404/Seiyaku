import { useEffect } from 'react';

/**
 * Hook to set document title and meta description dynamically.
 * Safe for SSR/static build environments.
 */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (title) {
      document.title = title;
    }

    if (description) {
      let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.head.appendChild(meta);
      }
      meta.content = description;
    }
  }, [title, description]);
}
