import { useState, useCallback } from 'react';
import en from '../../i18n/en.json';
import vi from '../../i18n/vi.json';

export type Language = 'en' | 'vi';
export type TranslationKey = keyof typeof en;

const dictionaries: Record<Language, Record<string, string>> = {
  en,
  vi,
};

export function useTranslation() {
  const [lang, setLang] = useState<Language>('en');

  const t = useCallback(
    (key: TranslationKey): string => {
      const dict = dictionaries[lang];
      return dict[key] ?? en[key] ?? key;
    },
    [lang],
  );

  return { t, lang, setLang };
}
