import type { Locale } from './config';
import en from './dictionaries/en';
import it, { type Dictionary } from './dictionaries/it';

export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { it, en };

export const getDictionary = (locale: Locale): Dictionary => dictionaries[locale];

/** Replaces {placeholders} with values. Unknown placeholders are left visible on purpose. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
