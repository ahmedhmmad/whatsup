'use client';

import { LOCALES, LOCALE_NAMES, type Locale } from '@sendwhats/shared';
import { useLocale } from '@/lib/i18n';

/**
 * Switches the console's language and reading direction.
 *
 * Kept as a plain two-button toggle rather than a dropdown: with only two
 * languages the current one should be visible at a glance, which matters when
 * an Arabic user lands on an English screen and needs to find the way back.
 */
export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex overflow-hidden rounded-md ring-1 ring-slate-200" role="group">
      {LOCALES.map((option: Locale) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          aria-pressed={locale === option}
          className={`px-2 py-1 text-xs transition ${
            locale === option
              ? 'bg-brand-500 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {LOCALE_NAMES[option]}
        </button>
      ))}
    </div>
  );
}
