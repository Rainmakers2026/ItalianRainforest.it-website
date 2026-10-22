import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyDemoGeo } from '@/lib/data/demo-geo';
import { dedupe, normalizeRecord, normalizeTags, normalizeWebsite, type RawRecord } from '@/lib/data/normalize';
import type { PublicPlayer } from '@/lib/data/schema';
import { exportRows, toCsv } from '@/lib/export';
import { applyFilters, DEFAULT_FILTERS, parseFilters, serializeFilters } from '@/lib/filters';

const snapshot = JSON.parse(readFileSync('data/snapshot/legacy-records.json', 'utf8')) as { records: RawRecord[] };
const players = snapshot.records.map(normalizeRecord).filter((p): p is PublicPlayer => !!p);

const sensitive: RawRecord = {
  id: 'recTEST123',
  fields: {
    'Company Name': '  Acme   Ventures \n',
    'Account Type': ['VC', 'BAN / Club Deal'],
    Status: 'Active',
    Website: 'www.acme.vc/?utm_source=x',
    Hashtags: ['IA', 'TBD', 'FinTech'],
    'Stage of Investment/Development': ['1. Idea or Patent', '4. Scaling'],
    Region: 'Lombardia',
    Province: 'MI',
    City: 'Milano',
    Latitude: 45.46,
    Longitude: 9.19,
    Email: 'secret.person@acme.vc',
    Phone: '+39 333 1234567',
    'Contact Person': 'Mario Rossi',
  },
};

describe('normalisation & sanitisation', () => {
  it('maps the whole legacy snapshot', () => {
    expect(players.length).toBeGreaterThan(400);
    expect(players.every((p) => p.name === p.name.trim() && !/\s{2,}/.test(p.name))).toBe(true);
  });

  it('never exposes sensitive fields in the public player', () => {
    const p = normalizeRecord(sensitive)!;
    const json = JSON.stringify(p);
    expect(json).not.toContain('secret.person');
    expect(json).not.toContain('333');
    expect(json).not.toContain('Mario Rossi');
    expect(json).not.toContain('recTEST123'); // source id stays server-side
    expect(p.hasGatedContacts).toBe(true);
    expect(p.name).toBe('Acme Ventures');
    expect(p.categories).toEqual(['vc', 'angels']);
    expect(p.location).toMatchObject({ region: 'lombardia', province: 'milano', city: 'Milano', source: 'data' });
    expect(p.tags).toEqual(['AI', 'FinTech']);
    expect(p.stages).toEqual(['idea', 'scaling']);
  });

  it('cleans websites', () => {
    expect(normalizeWebsite('www.acme.vc/?utm_source=x').host).toBe('acme.vc');
    expect(normalizeWebsite('www.acme.vc/?utm_source=x').url).toBe('https://www.acme.vc/');
    expect(normalizeWebsite('not a site').url).toBeNull();
  });

  it('collapses tag synonyms and drops placeholders', () => {
    expect(normalizeTags(['IA', 'AI', 'TBD', 'HealthCare', 'Healthcare'])).toEqual(['AI', 'Healthcare']);
  });

  it('dedupes exact duplicates only', () => {
    const p = normalizeRecord(sensitive)!;
    const { players: out, duplicates } = dedupe([p, { ...p, id: 'other' }]);
    expect(out).toHaveLength(1);
    expect(duplicates).toEqual(['Acme Ventures']);
  });
});

describe('export', () => {
  it('excludes gated contacts and demo positions', () => {
    const demo = applyDemoGeo(players.slice(0, 40)).filter((p) => p.location?.source === 'demo');
    expect(demo.length).toBeGreaterThan(0);
    const rows = exportRows(demo, 'it');
    expect(rows.every((r) => r.latitude === '' && r.region === '')).toBe(true);
    const csv = toCsv(exportRows([normalizeRecord(sensitive)!], 'en'), 'x');
    expect(csv).not.toContain('secret.person');
    expect(csv).not.toContain('Mario Rossi');
    expect(csv).toContain('Acme Ventures');
  });

  it('neutralises spreadsheet formulas', () => {
    const csv = toCsv([{ name: '=HYPERLINK("x")' }], 'x');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('query state', () => {
  it('round-trips through the URL', () => {
    const f = { ...DEFAULT_FILTERS, q: 'fintech', categories: ['vc' as const], region: 'lombardia', province: 'milano' };
    const sp = serializeFilters(f);
    expect(sp.toString()).toBe('q=fintech&category=vc&region=lombardia&province=milano');
    expect(parseFilters(sp)).toEqual(f);
  });

  it('rejects unknown values and keeps province inside its region', () => {
    const f = parseFilters(new URLSearchParams('category=nope,vc&region=atlantis&province=milano'));
    expect(f.categories).toEqual(['vc']);
    expect(f.region).toBe('lombardia'); // derived from the province
    const g = parseFilters(new URLSearchParams('region=lazio&province=milano'));
    expect(g.province).toBeNull();
  });

  it('filters by status and category', () => {
    const active = applyFilters(players, DEFAULT_FILTERS);
    expect(active.every((p) => p.status === 'active')).toBe(true);
    const vc = applyFilters(players, { ...DEFAULT_FILTERS, categories: ['vc'] });
    expect(vc.length).toBeGreaterThan(0);
    expect(vc.every((p) => p.categories.includes('vc'))).toBe(true);
  });

  it('search is accent- and case-insensitive', () => {
    const r = applyFilters(players, { ...DEFAULT_FILTERS, q: 'UNICREDIT' });
    expect(r.some((p) => /unicredit/i.test(p.name))).toBe(true);
  });
});
