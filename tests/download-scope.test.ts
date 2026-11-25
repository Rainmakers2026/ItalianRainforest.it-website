/**
 * Downloads (CLAUDE.md "Downloads", PRD § "Public database download"):
 *   - two modes: complete (every publishable player) and filtered (active filters + search);
 *   - the filtered file honours every public filter at once and is never paginated;
 *   - exported count = filtered results on screen; with no filters the two modes coincide;
 *   - only the public data layer is used: the Rainmakers OS master is never served.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dedupe, normalizeRecord, type Lookups, type RawRecord } from '@/lib/data/normalize';
import type { PublicPlayer } from '@/lib/data/schema';
import { exportRows, parseExportScope, selectForExport, toCsv } from '@/lib/export';
import { applyFilters, DEFAULT_FILTERS, FILTER_PARAM_KEYS, parseFilters, serializeFilters, type Filters } from '@/lib/filters';

const snapshot = JSON.parse(readFileSync('data/snapshot/irf-records.json', 'utf8')) as { records: RawRecord[] };
const lookups: Lookups = {
  logos: {
    ...(JSON.parse(readFileSync('data/snapshot/logos-scraped.json', 'utf8')) as { logos: Lookups['logos'] }).logos,
    ...(JSON.parse(readFileSync('data/snapshot/logos.json', 'utf8')) as { logos: Lookups['logos'] }).logos,
  },
  geo: JSON.parse(readFileSync('data/snapshot/geocode-cache.json', 'utf8')) as Lookups['geo'],
};
const players = dedupe(snapshot.records.map((r) => normalizeRecord(r, lookups)).filter((p): p is PublicPlayer => !!p)).players;

/** What the download route receives from the explorer (Downloads.tsx `query`). */
const query = (f: Filters, all = false) => {
  const sp = all ? new URLSearchParams() : serializeFilters(f);
  sp.set('scope', all ? 'all' : 'filtered');
  return new URLSearchParams(sp.toString());
};

const top = <T,>(values: T[]) => {
  const c = new Map<T, number>();
  for (const v of values) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]![0];
};
const region = top(players.map((p) => p.location?.region).filter((r): r is string => !!r));
const category = top(players.map((p) => p.categories[0]!));
const city = top(players.filter((p) => p.location?.region === region).map((p) => p.location?.city).filter((c): c is string => !!c));

describe('download modes', () => {
  it('scope defaults to filtered; only "all" selects the complete database', () => {
    expect(parseExportScope(new URLSearchParams())).toBe('filtered');
    expect(parseExportScope(new URLSearchParams('scope=all'))).toBe('all');
    expect(parseExportScope(new URLSearchParams('scope=ALL'))).toBe('filtered');
  });

  it('complete = every publishable player, whatever filter params are sent', () => {
    const sp = new URLSearchParams(`scope=all&region=${region}&q=zzzz-nothing`);
    expect(selectForExport(players, sp).list).toHaveLength(players.length);
  });

  it('with no active filters the two modes coincide', () => {
    const filtered = selectForExport(players, query(DEFAULT_FILTERS)).list;
    const all = selectForExport(players, query(DEFAULT_FILTERS, true)).list;
    expect(filtered.map((p) => p.id)).toEqual(all.map((p) => p.id));
    expect(filtered).toHaveLength(players.length);
  });

  it('filtered honours MAIN TYPE, region, city, search and status at the same time', () => {
    const f: Filters = { ...DEFAULT_FILTERS, categories: [category], region, city, q: 'a', status: 'all' };
    const { scope, list } = selectForExport(players, query(f));
    expect(scope).toBe('filtered');
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(p.categories).toContain(category);
      expect(p.location?.region).toBe(region);
    }
    // Same list, same order as on screen.
    expect(list.map((p) => p.id)).toEqual(applyFilters(players, f).map((p) => p.id));
  });

  it('exported rows = filtered results, beyond any table page (no pagination)', () => {
    const f: Filters = { ...DEFAULT_FILTERS, region };
    const onScreen = applyFilters(players, f).length;
    expect(onScreen).toBeGreaterThan(25); // more than one table page
    const rows = exportRows(selectForExport(players, query(f)).list, 'it');
    expect(rows).toHaveLength(onScreen);
    // CSV: header + one line per player.
    expect(toCsv(rows, 'x').trim().split('\r\n')).toHaveLength(onScreen + 1);
  });

  it('every public filter survives the URL round trip used by the download', () => {
    const f: Filters = { q: 'venture', categories: [category], region, city, industry: players.find((p) => p.industries[0])!.industries[0]!, status: 'active' };
    expect(parseFilters(query(f))).toEqual(f);
    // A filter added to Filters must also be serialised (and so reach the export).
    expect(new Set(serializeFilters(f).keys())).toEqual(new Set(FILTER_PARAM_KEYS));
  });

  it('an empty result exports zero rows, never the whole database', () => {
    const list = selectForExport(players, query({ ...DEFAULT_FILTERS, q: 'zzzqqq-nothing-matches' })).list;
    expect(list).toHaveLength(0);
  });
});

describe('the master file is never downloadable', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? files(p) : [p];
    });

  it('public/ contains no copy of the Rainmakers OS export', () => {
    for (const f of files('public')) {
      expect(path.basename(f)).not.toMatch(/irf-database|rainmakers.?os/i);
      if (/\.(csv|json|txt|tsv)$/i.test(f)) expect(readFileSync(f, 'utf8')).not.toMatch(/SECONDARY TYPE|INFORMATION SOURCE/);
    }
  });

  it('no API route or page reads data/source', () => {
    for (const f of files('src/app').filter((n) => /\.(ts|tsx)$/.test(n))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/data\/source|irf-database/);
    }
  });

  it('the download route builds files only from getDataset() + selectForExport()', () => {
    const route = readFileSync('src/app/api/download/route.ts', 'utf8');
    expect(route).toMatch(/getDataset\(\)/);
    expect(route).toMatch(/selectForExport\(/);
    expect(route).not.toMatch(/readFile|node:fs/);
  });
});
