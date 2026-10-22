export const LOCALES = ['it', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'it';

export const isLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);

export const HTML_LANG: Record<Locale, string> = { it: 'it-IT', en: 'en' };
export const OG_LOCALE: Record<Locale, string> = { it: 'it_IT', en: 'en_GB' };

/** DD/MM/YYYY in both languages, as required by the brief. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(HTML_LANG[locale]).format(n);
}
