/**
 * P0 public data rules (CLAUDE.md "Public data rules"). These tests read the real
 * master export (data/source/irf-database.csv) and the generated public snapshot, so
 * they keep guarding the site after every database update:
 *   - no record with MAIN TYPE = STARTUP is public (exact match, spaces/case normalised);
 *   - VENTURE BUILDER/STARTUP STUDIO and every other enabler type stays public;
 *   - reserved fields (REFERENCE, INFORMATION SOURCE, SECONDARY TYPE, PHONE, EMAIL) never
 *     reach the snapshot, the public player, the API payload or the downloads;
 *   - one MAIN TYPE per player, counted once; per-type counts add up to the total.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dedupe, isStartup, normalizeRecord, RESERVED_FIELDS, type Lookups, type RawRecord } from '@/lib/data/normalize';
import { PublicPlayerSchema, type PublicPlayer } from '@/lib/data/schema';
import { computeStats } from '@/lib/data/stats';
import { CATEGORY_FAMILIES } from '@/lib/data/taxonomy';
import { DOWNLOAD_FIELDS, parseDownloadFields } from '@/lib/download-fields';
import { exportRows, toCsv } from '@/lib/export';
import { applyFilters, DEFAULT_FILTERS } from '@/lib/filters';

function parseCsv(t: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') (f += '"'), i++;
        else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(f), (f = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(f), rows.push(row), (row = []), (f = '');
    } else f += c;
  }
  if (f || row.length) row.push(f), rows.push(row);
  return rows;
}
const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

// ---------- master export (first occurrence of each name, like the importer) ----------
const [header, ...rows] = parseCsv(readFileSync('data/source/irf-database.csv', 'utf8').replace(/^﻿/, ''));
const col = (n: string) => header!.findIndex((h) => h.trim().toUpperCase() === n);
const typeCol = col('MAIN TYPE') >= 0 ? col('MAIN TYPE') : col('PLAYER TYPE');
const statusCol = col('STATUS');
const master = new Map<string, { name: string; mainType: string; inactive: boolean; row: string[] }>();
for (const r of rows) {
  const name = (r[0] ?? '').trim();
  if (!name || /^nome( azienda)?$/i.test(name) || master.has(normName(name))) continue;
  master.set(normName(name), { name, mainType: (r[typeCol] ?? '').split(';')[0]!, inactive: /^\s*INACTIVE\b/i.test(r[statusCol] ?? ''), row: r });
}
const startupKeys = [...master].filter(([, m]) => isStartup(m.mainType)).map(([k]) => k);
// Publishable enablers: not a startup and not marked INACTIVE.
const enablerKeys = [...master].filter(([, m]) => !isStartup(m.mainType) && !m.inactive).map(([k]) => k);

// ---------- public dataset (same path as the data provider) ----------
const snapshot = JSON.parse(readFileSync('data/snapshot/irf-records.json', 'utf8')) as { exportDate: string; records: RawRecord[] };
const lookups: Lookups = {
  logos: { ...JSON.parse(readFileSync('data/snapshot/logos-scraped.json', 'utf8')).logos, ...JSON.parse(readFileSync('data/snapshot/logos.json', 'utf8')).logos },
  geo: JSON.parse(readFileSync('data/snapshot/geocode-cache.json', 'utf8')),
};
const { players } = dedupe(snapshot.records.map((r) => normalizeRecord(r, lookups)).filter((p): p is PublicPlayer => !!p));
const publicKeys = new Set(players.map((p) => normName(p.name)));
const stats = computeStats({ players, updatedAt: snapshot.exportDate, source: 'snapshot', hasDemoGeo: false, warnings: [] });

describe('startup exclusion (MAIN TYPE = STARTUP, exact match)', () => {
  it('the master export still holds the startups (nothing is deleted at the source)', () => {
    expect(startupKeys.length).toBeGreaterThan(0);
  });

  it('no startup is in the public dataset', () => {
    for (const k of startupKeys) expect(publicKeys.has(k), master.get(k)!.name).toBe(false);
    expect(snapshot.records.some((r) => isStartup(String(r.fields['MAIN TYPE (EXPORT)'] ?? r.fields['MAIN TYPE'] ?? '')))).toBe(false);
  });

  it('every enabler of the master is public, once', () => {
    for (const k of enablerKeys) expect(publicKeys.has(k), master.get(k)!.name).toBe(true);
    expect(players).toHaveLength(enablerKeys.length);
    expect(publicKeys.size).toBe(players.length);
  });

  it('keeps VENTURE BUILDER/STARTUP STUDIO and every other type containing "STARTUP"', () => {
    const ventureBuilders = enablerKeys.filter((k) => /STARTUP/i.test(master.get(k)!.mainType));
    expect(ventureBuilders.length).toBeGreaterThan(0);
    for (const k of ventureBuilders) expect(publicKeys.has(k)).toBe(true);
  });

  it('matches exactly, after normalising spaces and case', () => {
    for (const v of ['STARTUP', 'startup', '  Startup ']) expect(isStartup(v)).toBe(true);
    for (const v of ['VENTURE BUILDER/STARTUP STUDIO', 'VENTURE BUILDER / STARTUP STUDIO', 'STARTUP STUDIO', 'BANCHE PER STARTUP', 'INCUBATOR/ACCELERATOR', 'VC', 'CVC', '', null])
      expect(isStartup(v)).toBe(false);
    const base = { 'COMPANY NAME': 'Test Studio', REGION: 'Lazio' };
    expect(normalizeRecord({ id: 'a', fields: { ...base, 'MAIN TYPE': ' startup ' } })).toBeNull();
    expect(normalizeRecord({ id: 'b', fields: { ...base, 'MAIN TYPE': 'VENTURE BUILDER/STARTUP STUDIO' } })?.categories).toEqual(['venture-builder']);
    expect(normalizeRecord({ id: 'c', fields: { ...base, 'MAIN TYPE': 'INCUBATOR / ACCELERATOR' } })?.categories).toEqual(['incubator']);
  });

  it('never excludes an enabler because of SECONDARY TYPE or its description', () => {
    const p = normalizeRecord({
      id: 'd',
      fields: { 'COMPANY NAME': 'Acme VC', 'MAIN TYPE': 'VC', 'SECONDARY TYPE': 'STARTUP', 'SHORT DESCRIPTION': 'Invests in startup companies.' },
    });
    expect(p?.categories).toEqual(['vc']);
  });
});

describe('reserved fields never reach the browser', () => {
  const reservedValues = new Set<string>();
  for (const { mainType, row } of master.values()) {
    if (isStartup(mainType)) continue;
    for (const f of RESERVED_FIELDS) {
      const v = (row[col(f)] ?? '').trim();
      // Long enough to be meaningful; short values like "VC" also appear in public text.
      // Skip public URLs (INFORMATION SOURCE often repeats the website) and single words.
      if (col(f) >= 0 && v.length >= 8 && /[\s@\d]/.test(v) && !/^https?:\/\/\S+$/i.test(v)) reservedValues.add(v.toUpperCase());
    }
  }
  const secondaryOnly = new Set<string>();
  for (const { mainType, row } of master.values()) if (!isStartup(mainType)) secondaryOnly.add((row[col('SECONDARY TYPE')] ?? '').trim().toUpperCase());

  it('the snapshot only holds allowlisted fields', () => {
    const allowed = new Set(['COMPANY NAME', 'WEBSITE', 'SHORT DESCRIPTION', 'MAIN TYPE', 'MAIN TYPE (EXPORT)', 'ADDRESS', 'ADDRESS CHECK', 'REGION', 'PROVINCE', 'CITY', 'INDUSTRY', 'STATUS', 'LOGO FLAG', 'LOGO', 'Latitude', 'Longitude', 'GEO PRECISION']);
    for (const r of snapshot.records) for (const k of Object.keys(r.fields)) expect(allowed.has(k), k).toBe(true);
  });

  it('public players carry only schema fields', () => {
    const keys = Object.keys(PublicPlayerSchema.shape).sort();
    for (const p of players) expect(Object.keys(p).sort()).toEqual(keys);
  });

  it('no phone, reference, email, information source or secondary type value in the public payload or the downloads', () => {
    const payload = JSON.stringify({ players }).toUpperCase();
    const all = [...DOWNLOAD_FIELDS];
    const download = toCsv(exportRows(players, 'it', all), 'x').toUpperCase() + JSON.stringify(exportRows(players, 'en', all)).toUpperCase();
    expect(reservedValues.size).toBeGreaterThan(100);
    const leaks = [...reservedValues].filter((v) => !secondaryOnly.has(v) && (payload.includes(v) || download.includes(v)));
    expect(leaks).toEqual([]);
    for (const k of RESERVED_FIELDS) expect(payload).not.toContain(`"${k}"`);
    expect(payload).not.toMatch(/SECONDARY/);
    // Download columns: an explicit list, none of them reserved.
    expect(Object.keys(exportRows(players, 'it', all)[0]!).join(',')).not.toMatch(/secondary|reference|source|phone|email/i);
  });

  it('a raw record with reserved fields is sanitised', () => {
    const p = normalizeRecord({
      id: 'recX',
      fields: { 'COMPANY NAME': 'Acme', 'MAIN TYPE': 'VC', REFERENCE: 'Mario Rossi', PHONE: '+39 333 1234567', EMAIL: 'mario@acme.it', 'INFORMATION SOURCE': 'Chelonia note', 'SECONDARY TYPE': 'CVC' },
    })!;
    const json = JSON.stringify(p);
    for (const v of ['Mario Rossi', '1234567', 'mario@acme.it', 'Chelonia', 'cvc', 'recX']) expect(json).not.toContain(v);
  });

  it('no public static file (public/) contains reserved columns', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
    for (const f of walk('public').filter((f) => /\.(json|csv|txt|js|html)$/i.test(f))) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/SECONDARY TYPE|INFORMATION SOURCE|"REFERENCE"|"PHONE"/);
    }
  });
});

describe('MAIN TYPE is the only public classification', () => {
  it('no inactive organisation is public', () => {
    expect(players.some((p) => p.status === 'inactive')).toBe(false);
  });

  it('every player has exactly one type', () => {
    for (const p of players) expect(p.categories).toHaveLength(1);
    expect(players.some((p) => p.categories[0] === 'unclassified')).toBe(false);
  });

  it('counts add up: per-type and per-family totals equal the number of enablers', () => {
    const sum = stats.categoryCounts.reduce((a, c) => a + c.count, 0);
    expect(sum).toBe(stats.total);
    const fam = CATEGORY_FAMILIES.reduce((a, f) => a + stats.familyCounts[f.key], 0);
    const other = stats.categoryCounts.filter((c) => c.key === 'other' || c.key === 'unclassified').reduce((a, c) => a + c.count, 0);
    expect(fam + other).toBe(stats.total);
  });

  it('region and type filters combine on the same perimeter', () => {
    const both = applyFilters(players, { ...DEFAULT_FILTERS, categories: ['vc'], region: 'lombardia' });
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((p) => p.categories[0] === 'vc' && p.location?.region === 'lombardia')).toBe(true);
  });

  it('downloads only allow public columns, in the chosen subset', () => {
    expect(parseDownloadFields('email,phone,reference,secondary,website')).toEqual(['name', 'website']);
    expect(Object.keys(exportRows(players, 'it', ['website', 'region'])[0]!)).toEqual(['company_name', 'website', 'region']);
    const filtered = applyFilters(players, { ...DEFAULT_FILTERS, categories: ['vc'], region: 'lombardia' });
    expect(exportRows(filtered, 'it', ['type']).every((r) => r.player_type === exportRows(filtered, 'it', ['type'])[0]!.player_type)).toBe(true);
  });

  it('downloads use one type per row', () => {
    for (const r of exportRows(players, 'it')) expect(r.player_type).not.toContain(';');
  });
});
