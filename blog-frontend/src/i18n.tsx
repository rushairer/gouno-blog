import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n, { storageKey } from './i18n/index';
import type { Locale } from './i18n/index';
import en from './i18n/locales/en.json';

export type { Locale };

export type TranslationKey = keyof typeof en;

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

// oxlint-disable-next-line react/only-export-components
export function useI18n() {
  const { t: translate, i18n: currentI18n } = useTranslation();
  const lang = currentI18n?.resolvedLanguage || currentI18n?.language || i18n.resolvedLanguage || i18n.language || 'en';
  const locale: Locale = lang.startsWith('zh') ? 'zh' : 'en';

  return useMemo(() => {
    const setLocale = (next: Locale) => {
      localStorage.setItem(storageKey, next);
      void (currentI18n || i18n).changeLanguage(next);
    };

    const t = (key: TranslationKey, params: Record<string, string | number> = {}) => {
      const template: string = translate(key) || key;
      return Object.entries(params).reduce<string>(
        (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
        template,
      );
    };

    const formatDate = (value: string, options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }) =>
      new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', options).format(new Date(value));

    const formatDateTime = (value: string, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        ...options,
      }).format(new Date(value));

    return { locale, setLocale, t, formatDate, formatDateTime };
  }, [translate, currentI18n, locale]);
}
