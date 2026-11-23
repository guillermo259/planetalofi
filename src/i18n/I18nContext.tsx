import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { detectLocale } from './detectLocale.ts';
import { en } from './en.ts';
import { es } from './es.ts';
import type { I18nMessages, Locale } from './types.ts';

interface I18nContextValue {
  locale: Locale;
  t: I18nMessages;
  formatCityName: (cityKey: string, rawName: string) => string;
  formatCountryName: (countryCode: string, rawCountry: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useMemo<Locale>(() => {
    if (typeof navigator === 'undefined') return 'en';
    return detectLocale(navigator.languages, navigator.language);
  }, []);

  const t = locale === 'es' ? es : en;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t.metaTitle;
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute('content', t.metaDescription);
  }, [locale, t]);

  const value = useMemo<I18nContextValue>(() => {
    let regionNames: Intl.DisplayNames | null = null;
    try {
      regionNames = new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      regionNames = null;
    }

    const formatCountryName = (countryCode: string, rawCountry: string) => {
      if (!countryCode) return rawCountry;
      try {
        return regionNames?.of(countryCode.toUpperCase()) ?? rawCountry;
      } catch {
        return rawCountry;
      }
    };

    const formatCityName = (cityKey: string, rawName: string) => {
      if (cityKey === 'unknown') return t.cityDetail.unknownLocation;
      if (cityKey.startsWith('country-') && rawName) {
        const cc = cityKey.slice('country-'.length).toUpperCase();
        return formatCountryName(cc, rawName);
      }
      return rawName;
    };

    return { locale, t, formatCityName, formatCountryName };
  }, [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
