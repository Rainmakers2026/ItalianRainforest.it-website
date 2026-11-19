import { PROVINCES, REGIONS } from '@/lib/geo/territories';
import type { Locale } from '@/lib/i18n/config';
import type { PublicPlayer } from '@/lib/data/schema';
import { CATEGORY_BY_KEY, type CategoryKey } from '@/lib/data/taxonomy';

export const REGION_BY_SLUG = new Map(REGIONS.map((r) => [r.slug, r]));
export const PROVINCE_BY_SLUG = new Map(PROVINCES.map((p) => [p.slug, p]));

export const regionName = (slug: string, locale: Locale) => REGION_BY_SLUG.get(slug)?.[locale] ?? slug;
export const provinceName = (slug: string) => PROVINCE_BY_SLUG.get(slug)?.name ?? slug;

export function locationLabel(p: PublicPlayer, locale: Locale): string | null {
  const l = p.location;
  if (!l) return null;
  const parts = [l.city, l.province && provinceName(l.province), l.region && regionName(l.region, locale)].filter(Boolean);
  // Avoid "Milano, Milano, Lombardia".
  const unique = parts.filter((v, i) => parts.indexOf(v) === i);
  return unique.length ? unique.join(', ') : l.country;
}

export const primaryCategory = (p: PublicPlayer): CategoryKey => p.categories[0]!;
export const categoryColor = (k: CategoryKey) => CATEGORY_BY_KEY[k].color;
export const categoryName = (k: CategoryKey, locale: Locale) => CATEGORY_BY_KEY[k].label[locale];


export function initials(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '·';
}
