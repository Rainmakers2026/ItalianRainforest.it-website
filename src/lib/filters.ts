import { PROVINCES, REGIONS } from '@/lib/geo/territories';
import type { PublicPlayer } from '@/lib/data/schema';
import { CATEGORIES, CATEGORY_KEYS, STAGES, type CategoryKey, type StageKey } from '@/lib/data/taxonomy';

/**
 * One query state shared by map, database, embeds and CSV export.
 * Serialised in the URL, e.g. ?category=vc&region=lombardia&province=milano
 */
export type Filters = {
  q: string;
  categories: CategoryKey[];
  region: string | null;
  province: string | null;
  status: 'active' | 'inactive' | 'all';
  stage: StageKey | null;
  tag: string | null;
  invests: string | null;
};

export const DEFAULT_FILTERS: Filters = {
  q: '',
  categories: [],
  region: null,
  province: null,
  status: 'active',
  stage: null,
  tag: null,
  invests: null,
};

const REGION_SLUGS = new Set(REGIONS.map((r) => r.slug));
const PROVINCE_BY_SLUG = new Map(PROVINCES.map((p) => [p.slug, p]));
const STAGE_KEYS = new Set<string>(STAGES.map((s) => s.key));

export function parseFilters(sp: URLSearchParams): Filters {
  const categories = (sp.get('category') ?? '').split(',').filter((c): c is CategoryKey => (CATEGORY_KEYS as string[]).includes(c));
  const province = sp.get('province');
  const prov = province ? PROVINCE_BY_SLUG.get(province) : undefined;
  let region = sp.get('region');
  if (region && !REGION_SLUGS.has(region)) region = null;
  if (prov && !region) region = prov.region;
  const status = sp.get('status');
  const stage = sp.get('stage');
  return {
    q: (sp.get('q') ?? '').slice(0, 120),
    categories: [...new Set(categories)],
    region,
    province: prov && prov.region === region ? prov.slug : null,
    status: status === 'inactive' || status === 'all' ? status : 'active',
    stage: stage && STAGE_KEYS.has(stage) ? (stage as StageKey) : null,
    tag: sp.get('tag')?.slice(0, 60) || null,
    invests: sp.get('invests')?.slice(0, 60) || null,
  };
}

export function serializeFilters(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q.trim()) sp.set('q', f.q.trim());
  if (f.categories.length) sp.set('category', f.categories.join(','));
  if (f.region) sp.set('region', f.region);
  if (f.province) sp.set('province', f.province);
  if (f.status !== 'active') sp.set('status', f.status);
  if (f.stage) sp.set('stage', f.stage);
  if (f.tag) sp.set('tag', f.tag);
  if (f.invests) sp.set('invests', f.invests);
  return sp;
}

export const FILTER_PARAM_KEYS = ['q', 'category', 'region', 'province', 'status', 'stage', 'tag', 'invests'] as const;

export const activeFilterCount = (f: Filters) =>
  (f.q.trim() ? 1 : 0) +
  f.categories.length +
  (f.region ? 1 : 0) +
  (f.province ? 1 : 0) +
  (f.status !== 'active' ? 1 : 0) +
  (f.stage ? 1 : 0) +
  (f.tag ? 1 : 0) +
  (f.invests ? 1 : 0);

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
        ...p.tags,
        p.description.it,
        p.description.en,
      ]
        .filter(Boolean)
        .join(' '),
    );
    haystacks.set(p, h);
  }
  return h;
}

type Facet = 'categories' | 'region' | 'province' | 'status' | 'stage' | 'tag' | 'invests' | 'q';

function matches(p: PublicPlayer, f: Filters, skip?: Facet): boolean {
  if (skip !== 'status' && f.status !== 'all' && p.status !== f.status) return false;
  if (skip !== 'categories' && f.categories.length && !p.categories.some((c) => f.categories.includes(c))) return false;
  if (skip !== 'region' && f.region && p.location?.region !== f.region) return false;
  if (skip !== 'province' && f.province && p.location?.province !== f.province) return false;
  if (skip !== 'stage' && f.stage && !p.stages.includes(f.stage)) return false;
  if (skip !== 'tag' && f.tag && !p.tags.includes(f.tag)) return false;
  if (skip !== 'invests' && f.invests && !p.investmentCountries.includes(f.invests)) return false;
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
export function facetCounts(players: PublicPlayer[], f: Filters, facet: 'categories' | 'region' | 'province' | 'status' | 'stage') {
  const counts = new Map<string, number>();
  for (const p of players) {
    if (!matches(p, f, facet)) continue;
    const values =
      facet === 'categories'
        ? p.categories
        : facet === 'region'
          ? [p.location?.region]
          : facet === 'province'
            ? [p.location?.province]
            : facet === 'status'
              ? [p.status]
              : p.stages;
    for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

export function topTags(players: PublicPlayer[], limit = 40) {
  const counts = new Map<string, number>();
  for (const p of players) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
