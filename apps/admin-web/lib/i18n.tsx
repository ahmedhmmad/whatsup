'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALES,
  dirFor,
  isRtl,
  localizeDigits,
  translate,
  translateServerMessage,
  type Locale,
  type TranslationKey,
} from '@sendwhats/shared';

const STORAGE_KEY = 'sendwhats.locale';

interface LocaleValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  rtl: boolean;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  /** Formats a date in the active locale, right-to-left safe. */
  formatDate: (value: string | Date, withTime?: boolean) => string;
  digits: (value: string | number) => string;
  /** Statuses and other words the API sends, translated through the shared table. */
  word: (value: string | null | undefined) => string;
}

const LocaleContext = createContext<LocaleValue | null>(null);

export function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return LOCALES.includes(stored as Locale) ? (stored as Locale) : DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // The inline script in the layout has already set dir/lang before paint; this
  // just brings React's state in line once it hydrates.
  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A browser with storage blocked still switches for this session.
    }
    document.documentElement.lang = next;
    document.documentElement.dir = dirFor(next);
  }, []);

  const value = useMemo<LocaleValue>(() => {
    const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars);

    return {
      locale,
      dir: dirFor(locale),
      rtl: isRtl(locale),
      setLocale,
      t,
      formatDate: (input, withTime = true) => {
        const date = typeof input === 'string' ? new Date(input) : input;
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
          dateStyle: 'medium',
          ...(withTime ? { timeStyle: 'short' } : {}),
        });
      },
      digits: (input) => localizeDigits(input, locale),
      word: (input) => (input ? translateServerMessage(locale, input.replace(/_/g, ' ')) : ''),
    };
  }, [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside LocaleProvider');
  return ctx;
}

/** Shorthand for the common case of only needing the translate function. */
export function useT() {
  return useLocale().t;
}
