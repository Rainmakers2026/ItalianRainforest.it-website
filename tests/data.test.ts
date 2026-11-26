import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dedupe, nameKey, normalizeIndustries, normalizeRecord, normalizeWebsite, type Lookups, type RawRecord } from '@/lib/data/normalize';
import type { PublicPlayer } from '@/lib/data/schema';
import { computeStats } from '@/lib/data/stats';
import { categoryFromSource } from '@/lib/data/taxonomy';
import { exportTable, MASTER_COLUMNS, toCsv } from '@/lib/export';
import { applyFilters, DEFAULT_FILTERS, facetCounts, parseFilters, searchSuggestions, serializeFilters } from '@/lib/filters';

const snapshot = JSON.parse(readFileSync('data/snapshot/irf-records.json', 'utf8')) as { exportDate: string; records: RawRecord[] };
const lookups: Lookups = {
  // Same merge as the data provider: curated logos win over the ones scraped from websites.
  logos: {
    ...(JSON.parse(readFileSync('data/snapshot/logos-scraped.json', 'utf8')) as { logos: Lookups['logos'] }).logos,
    ...(JSON.parse(readFileSync('data/snapshot/logos.json', 'utf8')) as { logos: Lookups['logos'] }).logos,
  },
  geo: JSON.parse(readFileSync('data/snapshot/geocode-cache.json', 'utf8')) as Lookups['geo'],
};
const players = snapshot.records.map((r) => normalizeRecord(r, lookups)).filter((p): p is PublicPlayer => !!p);

// A record shaped like the Airtable base "Rainmakers OS".
const sensitive: RawRecord = {
  id: 'recTEST123',
  fields: {
    'COMPANY NAME': '  Acme   Ventures \n',
    'MAIN TYPE': 'VC',
    'SECONDARY TYPE': 'BAN/CLUB DEAL; STARTUP',
    'INFORMATION SOURCE': 'CHELONIA ITALIA internal note',
    STATUS: 'ACTIVE',
    WEBSITE: 'www.acme.vc/?utm_source=x',
    INDUSTRY: 'Fintech; DA VERIFICARE; it',
    REGION: 'Lombardia',
    PROVINCE: 'MI',
    CITY: 'Milano',
    'OPEN STREET MAP': 'https://www.openstreetmap.org/?mlat=45.4642&mlon=9.19#map=17/45.4642/9.19',
    EMAIL: 'secret.person@acme.vc',
    PHONE: '+39 333 1234567',
    REFERENCE: 'Mario Rossi',
  },
};

describe('IRF database import', () => {
  it('maps the whole snapshot (enablers only, no startups, no template rows)', () => {
    // The snapshot is the public dataset: every record maps to a public player.
    expect(players.length).toBe(snapshot.records.length);
    expect(players.length).toBeGreaterThan(600);
    expect(players.some((p) => /^nome( azienda)?$/i.test(p.name))).toBe(false);
    expect(players.every((p) => p.name === p.name.trim() && !/\s{2,}/.test(p.name))).toBe(true);
  });

  it('maps every PLAYER TYPE of the export to a category', () => {
    for (const t of ['INCUBATOR/ACCELERATOR', 'INCUBATOR / ACCELERATOR', 'BANCHE PER STARTUP', 'PERCORSI FORMATIVI PRIVATI', 'VENTURE BUILDER/STARTUP STUDIO', 'VC', 'MEDIA', 'PST', 'BAN/CLUB DEAL', 'ASSOCIATIONS', 'EMPOWERMENT PROGRAM', 'CROWDFUNDING PLATFORM', 'INSTITUTIONS', 'CORSI DI FORMAZIONE', 'FAMILY OFFICE', 'CVC', 'COWORKING', 'Altri abilitatori'])
      expect(categoryFromSource(t), t).not.toBeNull();
    expect(categoryFromSource('STARTUP')).toBeNull();
    expect(players.some((p) => p.categories.includes('unclassified'))).toBe(false);
  });

  it('keeps logos and positions from the lookups', () => {
    expect(players.filter((p) => p.logo).length).toBeGreaterThan(400);
    expect(players.every((p) => !lookups.logos[nameKey(p.name)] || p.logo)).toBe(true);
    expect(players.every((p) => !p.logo || p.logo.src.startsWith('/logos/players/'))).toBe(true);
    expect(players.filter((p) => p.location?.lat != null).length).toBeGreaterThan(400);
  });

  it('computes live stats', () => {
    const s = computeStats({ players, updatedAt: snapshot.exportDate, source: 'snapshot', hasDemoGeo: false, warnings: [] });
    expect(s.total).toBe(players.length);
    expect(s.categories).toBeGreaterThanOrEqual(14);
    expect(s.regions).toBeGreaterThan(10);
    expect(s.familyCounts.financial).toBeGreaterThan(0);
  });
});

describe('normalisation & sanitisation', () => {
  it('never exposes sensitive fields in the public player', () => {
    const p = normalizeRecord(sensitive)!;
    const json = JSON.stringify(p);
    expect(json).not.toContain('secret.person');
    expect(json).not.toContain('333');
    expect(json).not.toContain('Mario Rossi');
    expect(json).not.toContain('recTEST123'); // source id stays server-side
    expect(p.hasGatedContacts).toBe(true);
    expect(p.name).toBe('Acme Ventures');
    expect(p.categories).toEqual(['vc']);
    expect(p.status).toBe('active');
    expect(p.industries).toEqual(['Fintech']);
    expect(p.location).toMatchObject({ region: 'lombardia', province: 'milano', city: 'Milano', lat: 45.4642, lng: 9.19, precision: 'address' });
  });

  it('reads status placeholders as "to be verified" and skips startups', () => {
    const p = normalizeRecord({ id: 'r1', fields: { 'COMPANY NAME': 'X', 'MAIN TYPE': 'VC', STATUS: 'DA VERIFICARE' } })!;
    expect(p.status).toBe('unverified');
    expect(normalizeRecord({ id: 'r2', fields: { 'COMPANY NAME': 'Y', 'MAIN TYPE': 'STARTUP' } })).toBeNull();
  });

  it('falls back to the geocode and logo lookups by name', () => {
    const k = nameKey('Acme Ventures');
    const p = normalizeRecord(
      { id: 'r3', fields: { 'COMPANY NAME': 'Acme Ventures', 'MAIN TYPE': 'VC', REGION: 'Lazio' } },
      { logos: { [k]: { src: '/logos/players/x.webp', w: 10, h: 10, tone: 'dark' } }, geo: { [k]: { lat: 41.9, lng: 12.5, precision: 'city' } } },
    )!;
    expect(p.logo?.src).toBe('/logos/players/x.webp');
    expect(p.location).toMatchObject({ lat: 41.9, lng: 12.5, precision: 'city', region: 'lazio' });
  });

  it('cleans websites and industries', () => {
    expect(normalizeWebsite('www.acme.vc/?utm_source=x').host).toBe('acme.vc');
    expect(normalizeWebsite('not a site').url).toBeNull();
    expect(normalizeIndustries(['Fintech', 'fintech', 'it', 'Altro'])).toEqual(['Fintech']);
  });

  it('dedupes by name', () => {
    const p = normalizeRecord(sensitive)!;
    const { players: out, duplicates } = dedupe([p, { ...p, id: 'other' }]);
    expect(out).toHaveLength(1);
    expect(duplicates).toEqual(['Acme Ventures']);
  });
});

describe('export', () => {
  it('excludes gated contacts', () => {
    const csv = toCsv(MASTER_COLUMNS, exportTable([normalizeRecord(sensitive)!]));
    expect(csv).not.toContain('secret.person');
    expect(csv).not.toContain('Mario Rossi');
    expect(csv).toContain('Acme Ventures');
    expect(csv.split('\r\n')[0]).toBe('\uFEFF' + MASTER_COLUMNS.join(','));
  });

  it('neutralises spreadsheet formulas', () => {
    const csv = toCsv(['COMPANY NAME'], [['=HYPERLINK("x")']]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('query state', () => {
  it('round-trips through the URL', () => {
    const f = { ...DEFAULT_FILTERS, q: 'fintech', categories: ['vc' as const], region: 'lombardia', city: 'Milano', industry: 'Fintech', status: 'active' as const };
    const sp = serializeFilters(f);
    expect(sp.toString()).toBe('q=fintech&category=vc&region=lombardia&city=Milano&industry=Fintech&status=active');
    expect(parseFilters(sp)).toEqual(f);
  });

  it('rejects unknown values', () => {
    const f = parseFilters(new URLSearchParams('category=nope,vc&region=atlantis&status=weird'));
    expect(f.categories).toEqual(['vc']);
    expect(f.region).toBeNull();
    expect(f.status).toBe('all');
  });

  it('shows every enabler by default and filters by the database columns', () => {
    expect(applyFilters(players, DEFAULT_FILTERS)).toHaveLength(players.length);
    const vc = applyFilters(players, { ...DEFAULT_FILTERS, categories: ['vc'] });
    expect(vc.length).toBeGreaterThan(0);
    expect(vc.every((p) => p.categories.includes('vc'))).toBe(true);
    const milano = applyFilters(players, { ...DEFAULT_FILTERS, city: 'milano' });
    expect(milano.length).toBeGreaterThan(10);
    expect(milano.every((p) => p.location?.city?.toLowerCase() === 'milano')).toBe(true);
    expect(facetCounts(players, DEFAULT_FILTERS, 'region').get('lombardia')).toBeGreaterThan(50);
  });

  it('search ignores punctuation and ranks name matches first', () => {
    const birex = applyFilters(players, { ...DEFAULT_FILTERS, q: 'birex' });
    expect(birex[0]?.name).toMatch(/bi-rex/i);
    const q = { ...DEFAULT_FILTERS, q: 'polihub' };
    const r = applyFilters(players, q);
    expect(r[0]?.name.toLowerCase()).toContain('polihub');
    expect(searchSuggestions(r, q.q).every((p) => /polihub/i.test(p.name))).toBe(true);
    // Ranking never changes the result set, only its order.
    expect(new Set(r.map((p) => p.id))).toEqual(new Set(players.filter((p) => r.includes(p)).map((p) => p.id)));
  });

  it('search is accent- and case-insensitive', () => {
    const r = applyFilters(players, { ...DEFAULT_FILTERS, q: 'POLIHUB' });
    expect(r.some((p) => /polihub/i.test(p.name))).toBe(true);
  });
});
