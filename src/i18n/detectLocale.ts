import type { Locale } from './types.ts';

/**
 * Detects browser language preference ('es' or 'en'), defaulting to 'en'.
 */
export function detectLocale(
  languages?: readonly string[] | null,
  language?: string | null,
): Locale {
  const candidates: string[] = [];
  if (Array.isArray(languages)) {
    for (const lang of languages) {
      if (typeof lang === 'string' && lang.trim()) {
        candidates.push(lang.trim().toLowerCase());
      }
    }
  }
  if (typeof language === 'string' && language.trim()) {
    candidates.push(language.trim().toLowerCase());
  }

  for (const tag of candidates) {
    const base = tag.split('-')[0];
    if (base === 'es') return 'es';
    if (base === 'en') return 'en';
  }

  return 'en';
}
