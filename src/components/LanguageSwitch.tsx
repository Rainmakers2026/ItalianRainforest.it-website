'use client';

import { track } from '@/lib/analytics';
import { LOCALES, type Locale } from '@/lib/i18n/config';

/** Switches language while preserving the current section (#hash) and filters (?query). */
export function LanguageSwitch({
  locale,
  label,
  basePath = '',
  dark = false,
}: {
  locale: Locale;
  label: string;
  basePath?: string;
  dark?: boolean;
}) {
  return (
    <nav aria-label={label} className="flex items-center rounded-full border border-line p-0.5 text-xs font-bold">
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <a
            key={l}
            href={`/${l}${basePath}`}
            hrefLang={l}
            lang={l}
            aria-current={active ? 'true' : undefined}
            onClick={(e) => {
              if (active) return e.preventDefault();
              track('language_switch', { from: locale, to: l });
              e.currentTarget.href = `/${l}${basePath}${window.location.search}${window.location.hash}`;
            }}
            className={`inline-flex min-h-8 min-w-9 items-center justify-center rounded-full px-2 uppercase transition-colors ${
              active ? 'bg-navy text-white' : dark ? 'text-white/80 hover:text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {l}
          </a>
        );
      })}
    </nav>
  );
}
