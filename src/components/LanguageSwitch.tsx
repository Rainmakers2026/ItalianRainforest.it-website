'use client';

import { track } from '@/lib/analytics';
import { LOCALES, type Locale } from '@/lib/i18n/config';

const READ_IN: Record<Locale, string> = { it: 'Leggi questa pagina in italiano', en: 'Read this page in English' };

/**
 * Round pill showing the other language, as on rainmakers.it. Keeps the current
 * section (#hash) and filters (?query) when switching.
 */
export function LanguageSwitch({ locale, basePath = '' }: { locale: Locale; basePath?: string }) {
  const other = LOCALES.find((l) => l !== locale)!;
  return (
    <a
      href={`/${other}${basePath}`}
      hrefLang={other}
      lang={other}
      aria-label={READ_IN[other]}
      onClick={(e) => {
        track('language_switch', { from: locale, to: other });
        e.currentTarget.href = `/${other}${basePath}${window.location.search}${window.location.hash}`;
      }}
      className="inline-flex size-11 items-center justify-center rounded-full border border-white/25 text-[0.8125rem] font-bold text-white uppercase transition-colors hover:border-white/60 hover:bg-white/10"
    >
      {other}
    </a>
  );
}
