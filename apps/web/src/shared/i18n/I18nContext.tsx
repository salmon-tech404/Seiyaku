import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import en from '../../i18n/en.json';
import vi from '../../i18n/vi.json';

export type Language = 'en' | 'vi';
export type TranslationKey = keyof typeof en;
export type TranslationParams = Record<string, string | number>;

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const dictionaries: Record<Language, Record<string, string>> = {
  en,
  vi,
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'seiyaku_lang';

function getStoredLang(): Language {
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const paramLang = q.get('lang');
      if (paramLang === 'en' || paramLang === 'vi') return paramLang;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'vi') return stored;
    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('vi')) {
      return 'vi';
    }
  } catch {
    // Storage blocked / unavailable
  }
  return 'en';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(getStoredLang);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    try {
      window.localStorage.setItem(STORAGE_KEY, newLang);
    } catch {
      // LocalStorage error safely ignored
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', newLang);
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'en' ? 'vi' : 'en');
  }, [lang, setLang]);

  const pluralRules = useMemo(() => {
    try {
      return new Intl.PluralRules(lang);
    } catch {
      return null;
    }
  }, [lang]);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams): string => {
      const dict = dictionaries[lang];
      let template: string | undefined;

      // Handle pluralization if count parameter is provided
      if (params && params.count !== undefined && pluralRules) {
        const count = Number(params.count);
        const rule = pluralRules.select(count);
        const pluralKey = `${key}_${rule}` as TranslationKey;
        if (dict[pluralKey]) {
          template = dict[pluralKey];
        } else if (en[pluralKey]) {
          template = en[pluralKey];
        }
      }

      if (!template) {
        template = dict[key] ?? en[key] ?? String(key);
      }

      // Handle interpolation: {var}
      if (params) {
        for (const [pKey, pVal] of Object.entries(params)) {
          template = template.replaceAll(`{${pKey}}`, String(pVal));
        }
      }

      return template;
    },
    [lang, pluralRules],
  );

  const value = useMemo(() => ({ lang, setLang, toggleLang, t }), [lang, setLang, toggleLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    // Return safe fallback for isolated components/tests
    const lang: Language = 'en';
    const t = (key: TranslationKey, params?: TranslationParams): string => {
      let str = en[key] ?? String(key);
      if (params) {
        for (const [pKey, pVal] of Object.entries(params)) {
          str = str.replaceAll(`{${pKey}}`, String(pVal));
        }
      }
      return str;
    };
    return {
      lang,
      setLang: () => {},
      toggleLang: () => {},
      t,
    };
  }
  return context;
}
