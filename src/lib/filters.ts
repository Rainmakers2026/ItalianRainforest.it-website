import { PROVINCES, REGIONS } from '@/lib/geo/territories';
import type { PublicPlayer } from '@/lib/data/schema';
import { CATEGORIES, CATEGORY_KEYS, STATUSES, type CategoryKey, type StatusKey } from '@/lib/data/taxonomy';

/**
 * One query state shared by map, database, embeds and exports. The facets mirror the
 * columns of the database: PLAYER TYPE, REGION, CITY, INDUSTRY, STATUS.
 * Serialised in the URL, e.g. ?category=vc&region=lombardia&city=Milano
 */
export type Filters = {
  q: string;
  categories: CategoryKey[];
  region: string | null;
  city: string | null;
  industry: string | null;
  status: StatusKey | 'all';
};

export const DEFAULT_FILTERS: Filters = {
  q: '',
  categories: [],
  region: null,
  city: null,
  industry: null,
  status: 'all',
};

const REGION_SLUGS = new Set(REGIONS.map((r) => r.slug));

export function parseFilters(sp: URLSearchParams): Filters {
  const categories = (sp.get('category') ?? '').split(',').filter((c): c is CategoryKey => (CATEGORY_KEYS as string[]).includes(c));
  let region = sp.get('region');
  if (region && !REGION_SLUGS.has(region)) region = null;
  const status = sp.get('status');
  return {
    q: (sp.get('q') ?? '').slice(0, 120),
    categories: [...new Set(categories)],
    region,
    city: sp.get('city')?.slice(0, 80) || null,
    industry: sp.get('industry')?.slice(0, 80) || null,
    status: (STATUSES as readonly string[]).includes(status ?? '') ? (status as StatusKey) : 'all',
  };
}

export function serializeFilters(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q.trim()) sp.set('q', f.q.trim());
  if (f.categories.length) sp.set('category', f.categories.join(','));
  if (f.region) sp.set('region', f.region);
  if (f.city) sp.set('city', f.city);
  if (f.industry) sp.set('industry', f.industry);
  if (f.status !== 'all') sp.set('status', f.status);
  return sp;
}

export const FILTER_PARAM_KEYS = ['q', 'category', 'region', 'city', 'industry', 'status'] as const;

export const activeFilterCount = (f: Filters) =>
  (f.q.trim() ? 1 : 0) + f.categories.length + (f.region ? 1 : 0) + (f.city ? 1 : 0) + (f.industry ? 1 : 0) + (f.status !== 'all' ? 1 : 0);

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const REGION_NAME = new Map(REGIONS.map((r) => [r.slug, `${r.it} ${r.en}`]));
const PROVINCE_NAME = new Map(PROVINCES.map((p) => [p.slug, `${p.name} ${p.code}`]));
const CATEGORY_TEXT = new Map(CATEGORIES.map((c) => [c.key, `${c.label.it} ${c.label.en} ${c.short.it} ${c.short.en}`]));

const haystacks = new WeakMap<PublicPlayer, string>();
function haystack(p: PublicPlayer): string {
  let h = haystacks.get(p);
  if (!h) {
    h = fold(
      [
        p.name,
        p.websiteHost,
        ...p.categories.map((c) => CATEGORY_TEXT.get(c)),
        p.location?.city,
        p.location?.province && PROVINCE_NAME.get(p.location.province),
        p.location?.region && REGION_NAME.get(p.location.region),
        ...p.industries,
        p.description,
      ]
        .filter(Boolean)
        .join(' '),
    );
    haystacks.set(p, h);
  }
  return h;
}

export type Facet = 'categories' | 'region' | 'city' | 'industry' | 'status' | 'q';

const sameCity = (a: string | null | undefined, b: string) => !!a && fold(a) === fold(b);

function matches(p: PublicPlayer, f: Filters, skip?: Facet): boolean {
  if (skip !== 'status' && f.status !== 'all' && p.status !== f.status) return false;
  if (skip !== 'categories' && f.categories.length && !p.categories.some((c) => f.categories.includes(c))) return false;
  if (skip !== 'region' && f.region && p.location?.region !== f.region) return false;
  if (skip !== 'city' && f.city && !sameCity(p.location?.city, f.city)) return false;
  if (skip !== 'industry' && f.industry && !p.industries.includes(f.industry)) return false;
  if (skip !== 'q' && f.q.trim()) {
    const h = haystack(p);
    const terms = fold(f.q).split(/\s+/).filter(Boolean);
    if (!terms.every((t) => h.includes(t))) return false;
  }
  return true;
}

export function applyFilters(players: PublicPlayer[], f: Filters): PublicPlayer[] {
  return players.filter((p) => matches(p, f));
}

/** Counts per value of one facet, with every *other* active filter applied. */
export function facetCounts(players: PublicPlayer[], f: Filters, facet: Exclude<Facet, 'q'>) {
  const counts = new Map<string, number>();
  for (const p of players) {
    if (!matches(p, f, facet)) continue;
    const values: (string | null | undefined)[] =
      facet === 'categories'
        ? p.categories
        : facet === 'region'
          ? [p.location?.region]
          : facet === 'city'
            ? [p.location?.city]
            : facet === 'industry'
              ? p.industries
              : [p.status];
    for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}
