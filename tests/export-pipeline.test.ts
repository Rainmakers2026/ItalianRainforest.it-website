/**
 * Export pipeline (CLAUDE.md "Export pipeline", PRD § "Export pipeline"): one
 * centralised flow from the Rainmakers OS import to the file. These tests read the real
 * master export and the snapshot.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPublicDataset, normalizeRecord, type Lookups, type RawRecord } from '@/lib/data/normalize';
import { buildExport, MASTER_COLUMNS, RESERVED_EXPORT_COLUMNS, validateExportSchema } from '@/lib/export';
import { applyFilters, DEFAULT_FILTERS } from '@/lib/filters';

const snapshot = JSON.parse(readFileSync('data/snapshot/irf-records.json', 'utf8')) as { records: RawRecord[] };
const lookups: Lookups = {
  logos: {
    ...(JSON.parse(readFileSync('data/snapshot/logos-scraped.json', 'utf8')) as { logos: Lookups['logos'] }).logos,
    ...(JSON.parse(readFileSync('data/snapshot/logos.json', 'utf8')) as { logos: Lookups['logos'] }).logos,
  },
  geo: JSON.parse(readFileSync('data/snapshot/geocode-cache.json', 'utf8')) as Lookups['geo'],
};
const { players } = buildPublicDataset(snapshot.records, lookups);
const schema = (JSON.parse(readFileSync('data/snapshot/export-schema.json', 'utf8')) as { columns: string[] }).columns;
const sp = (q: string) => new URLSearchParams(q);

describe('steps 2–6: one public dataset', () => {
  it('no STARTUP (exact match, spaces and case normalised); VENTURE BUILDER/STARTUP STUDIO stays', () => {
    const rec = (t: string): RawRecord => ({ id: t, fields: { 'COMPANY NAME': `X ${t}`, 'MAIN TYPE': t } });
    for (const t of ['STARTUP', ' startup ', 'StartUp', 'STARTUP  ']) expect(normalizeRecord(rec(t))).toBeNull();
    for (const t of ['VENTURE BUILDER/STARTUP STUDIO', 'Venture Builder / Startup Studio', 'BANCHE PER STARTUP']) expect(normalizeRecord(rec(t))).not.toBeNull();
    expect(players.some((p) => (p.mainType ?? '').replace(/\s+/g, '').toUpperCase() === 'STARTUP')).toBe(false);
    expect(players.some((p) => /STARTUP STUDIO/.test(p.mainType ?? ''))).toBe(true);
  });

  it('SECONDARY TYPE influences neither classification, filters nor exports', () => {
    const base: RawRecord = { id: 's1', fields: { 'COMPANY NAME': 'Acme', 'MAIN TYPE': 'VC' } };
    const withSecondary: RawRecord = { id: 's1', fields: { ...base.fields, 'SECONDARY TYPE': 'STARTUP; CVC; MEDIA' } };
    expect(normalizeRecord(withSecondary)).toEqual(normalizeRecord(base));
    const a = buildExport([normalizeRecord(base)!], schema, sp('scope=all')).rows;
    const b = buildExport([normalizeRecord(withSecondary)!], schema, sp('scope=all')).rows;
    expect(b).toEqual(a);
  });

  it('duplicates are collapsed: one row per organisation', () => {
    const names = players.map((p) => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('steps 7–11: the file', () => {
  it('applies the user filters on the public dataset', () => {
    const f = buildExport(players, schema, sp('scope=filtered&category=vc&region=lombardia'));
    expect(f.rows).toHaveLength(applyFilters(players, { ...DEFAULT_FILTERS, categories: ['vc'], region: 'lombardia' }).length);
  });

  it('rebuilds the master columns, public values only, reserved columns empty', () => {
    const f = buildExport(players, schema, sp('scope=all'));
    expect(f.columns).toEqual(schema);
    expect(f.rows).toHaveLength(players.length);
    for (const c of RESERVED_EXPORT_COLUMNS) {
      const i = f.columns.indexOf(c);
      expect(f.rows.every((r) => r[i] === '')).toBe(true);
    }
  });

  it('validates the schema metadata before generating the file', () => {
    expect(validateExportSchema([...MASTER_COLUMNS])).toEqual([...MASTER_COLUMNS]);
    for (const bad of [[], ['WEBSITE'], ['COMPANY NAME', 'COMPANY NAME', 'MAIN TYPE'], ['COMPANY NAME', '', 'MAIN TYPE'], 'COMPANY NAME', [{ name: 'x' }]])
      expect(() => validateExportSchema(bad)).toThrow();
  });
});

describe('the master is read-only and never sent to the browser', () => {
  const importer = readFileSync('scripts/import-irf-csv.mjs', 'utf8');

  it('the importer never writes to the master export', () => {
    const writes = [...importer.matchAll(/writeFile\(\s*([^,]+),/g)].map((m) => m[1]!);
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w).not.toMatch(/data\/source|csvPath/);
  });

  it('the schema metadata holds column names only', () => {
    const meta = JSON.parse(readFileSync('data/snapshot/export-schema.json', 'utf8')) as Record<string, unknown>;
    expect(Object.keys(meta).sort()).toEqual(['_about', 'columns', 'source']);
    const master = readFileSync('data/source/irf-database.csv', 'utf8').replace(/^﻿/, '').split(/\r?\n/);
    expect((meta.columns as string[]).join(',')).toBe(master[0]!.split(',').map((h) => h.trim()).join(','));
  });

  it('every consumer uses the same public dataset builder', () => {
    expect(readFileSync('src/lib/data/provider.ts', 'utf8')).toMatch(/buildPublicDataset\(/);
    expect(readFileSync('scripts/build-infographic.mts', 'utf8')).toMatch(/buildPublicDataset\(/);
  });
});
