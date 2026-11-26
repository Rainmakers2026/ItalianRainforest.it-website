/**
 * One pipeline, one public dataset (CLAUDE.md "Public data rules" 5–6, update 6/6): site
 * pages, embeds, Open Graph image, sitemap, APIs, downloads and the infographic build all
 * use the same public dataset (`buildPublicDataset()` via `getDataset()`); components never
 * filter on their own; KPIs come from `computeStats()` and add up.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildPublicDataset, type Lookups, type RawRecord } from '@/lib/data/normalize';
import { computeStats } from '@/lib/data/stats';

vi.mock('server-only', () => ({}));

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
const src = (re: RegExp) => files('src').filter((f) => re.test(f)).map((f) => ({ f: f.replace(/\\/g, '/'), t: readFileSync(f, 'utf8') }));
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const snapshot = JSON.parse(readFileSync('data/snapshot/irf-records.json', 'utf8')) as { records: RawRecord[] };
const lookups: Lookups = {
  logos: {
    ...(JSON.parse(readFileSync('data/snapshot/logos-scraped.json', 'utf8')) as { logos: Lookups['logos'] }).logos,
    ...(JSON.parse(readFileSync('data/snapshot/logos.json', 'utf8')) as { logos: Lookups['logos'] }).logos,
  },
  geo: JSON.parse(readFileSync('data/snapshot/geocode-cache.json', 'utf8')) as Lookups['geo'],
};

describe('the same public dataset everywhere', () => {
  it('getDataset() (site, APIs, downloads) = buildPublicDataset() (tests, infographic build)', async () => {
    for (const k of ['AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_TABLE', 'IRF_GEO_DEMO']) delete process.env[k];
    vi.resetModules();
    const { getDataset } = await import('@/lib/data/provider');
    const ds = await getDataset();
    expect(ds.players).toEqual(buildPublicDataset(snapshot.records, lookups).players);
  });

  it('KPIs come from computeStats on that dataset and add up to the total', async () => {
    const { getDataset } = await import('@/lib/data/provider');
    const ds = await getDataset();
    const s = computeStats(ds);
    expect(s.total).toBe(ds.players.length);
    expect(s.categoryCounts.reduce((n, c) => n + c.count, 0)).toBe(s.total);
    // One type per player: the families never count a player twice.
    expect(Object.values(s.familyCounts).reduce((n, c) => n + c, 0)).toBeLessThanOrEqual(s.total);
  });

  it('every server surface reads players through getDataset() only', () => {
    for (const { f, t } of src(/\.(ts|tsx)$/)) {
      if (f.startsWith('src/lib/data/')) continue;
      const c = code(t);
      expect(c, f).not.toMatch(/irf-records|irf-database|data\/source|normalizeRecord|buildPublicDataset|SnapshotProvider|AirtableReadOnlyProvider/);
    }
    for (const page of ['src/app/[locale]/page.tsx', 'src/app/[locale]/embed/[kind]/page.tsx', 'src/app/[locale]/opengraph-image.tsx', 'src/app/sitemap.ts', 'src/app/api/players/route.ts', 'src/app/api/download/route.ts']) {
      expect(readFileSync(page, 'utf8'), page).toMatch(/getDataset\(\)/);
    }
  });

  it('the browser gets players from /api/players (or server props): components never filter the perimeter', () => {
    // Every site component (the separate /database-preview mock prototype has its own data).
    const comps = src(/^src[\\/]components[\\/](?!database-preview).*\.(ts|tsx)$/);
    expect(comps.length).toBeGreaterThan(5);
    for (const { f, t } of comps) {
      const c = code(t);
      expect(c, f).not.toMatch(/['"]STARTUP['"]|isStartup|secondaryType|SECONDARY/);
      expect(c, f).not.toMatch(/status\s*!==?\s*['"]inactive['"]/);
    }
    expect(readFileSync('src/components/explorer/ExplorerProvider.tsx', 'utf8')).toMatch(/fetch\('\/api\/players'\)/);
  });

  it('the infographic build uses buildPublicDataset with the same lookups', () => {
    const s = readFileSync('scripts/build-infographic.mts', 'utf8');
    expect(s).toMatch(/buildPublicDataset\(snap\.records, lookups\)/);
    for (const f of ['irf-records.json', 'logos-scraped.json', 'logos.json', 'geocode-cache.json']) expect(s).toContain(f);
  });
});
