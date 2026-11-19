import type { Dataset } from './schema';
import { CATEGORIES, CATEGORY_FAMILIES, type CategoryKey, type FamilyKey } from './taxonomy';

export type DatasetStats = {
  /** Every enabler in the database (status active or still being verified). */
  total: number;
  active: number;
  /** Player types present in the data (excluding "unclassified"). */
  categories: number;
  /** Regions with at least one player. */
  regions: number;
  cities: number;
  /** Players per region slug. */
  regionCounts: Record<string, number>;
  categoryCounts: { key: CategoryKey; count: number }[];
  /** Distinct organisations per family (an organisation can sit in several). */
  familyCounts: Record<FamilyKey, number>;
  geolocated: number;
  withLogo: number;
  updatedAt: string;
};

export function computeStats(ds: Dataset): DatasetStats {
  const listed = ds.players.filter((p) => p.status !== 'inactive');
  const counts = new Map<CategoryKey, number>();
  for (const p of listed) for (const c of p.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  const real = listed.filter((p) => p.location?.source === 'data');
  return {
    total: listed.length,
    active: listed.filter((p) => p.status === 'active').length,
    categories: [...counts.keys()].filter((k) => k !== 'unclassified').length,
    regions: new Set(real.map((p) => p.location?.region).filter(Boolean)).size,
    regionCounts: real.reduce<Record<string, number>>((acc, p) => {
      const r = p.location?.region;
      if (r) acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    }, {}),
    cities: new Set(real.map((p) => p.location?.city?.toLowerCase()).filter(Boolean)).size,
    familyCounts: Object.fromEntries(
      CATEGORY_FAMILIES.map((f) => [f.key, listed.filter((p) => p.categories.some((c) => (f.categories as readonly CategoryKey[]).includes(c))).length]),
    ) as Record<FamilyKey, number>,
    categoryCounts: CATEGORIES.map((c) => ({ key: c.key, count: counts.get(c.key) ?? 0 })).filter((c) => c.count > 0),
    geolocated: real.filter((p) => p.location?.lat != null).length,
    withLogo: listed.filter((p) => p.logo).length,
    updatedAt: ds.updatedAt,
  };
}
