import type { Dataset } from './schema';
import { CATEGORIES, type CategoryKey } from './taxonomy';

export type DatasetStats = {
  total: number;
  active: number;
  categories: number;
  /** Regions with at least one player located from real data (demo positions excluded). */
  regions: number;
  investmentCountries: number;
  categoryCounts: { key: CategoryKey; count: number }[];
  geolocated: number;
  updatedAt: string;
};

export function computeStats(ds: Dataset): DatasetStats {
  const active = ds.players.filter((p) => p.status === 'active');
  const counts = new Map<CategoryKey, number>();
  for (const p of active) for (const c of p.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  const real = ds.players.filter((p) => p.location?.source === 'data');
  return {
    total: ds.players.length,
    active: active.length,
    categories: [...counts.keys()].filter((k) => k !== 'unclassified').length,
    regions: new Set(real.map((p) => p.location?.region).filter(Boolean)).size,
    investmentCountries: new Set(active.flatMap((p) => p.investmentCountries).filter((c) => c !== 'Europe')).size,
    categoryCounts: CATEGORIES.map((c) => ({ key: c.key, count: counts.get(c.key) ?? 0 })).filter((c) => c.count > 0),
    geolocated: real.filter((p) => p.location?.lat != null).length,
    updatedAt: ds.updatedAt,
  };
}
