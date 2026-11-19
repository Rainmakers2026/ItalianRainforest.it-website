import { describe, expect, it, vi } from 'vitest';
import { applyQuery, contactsCsv, DEFAULT_QUERY, facets, parseQuery, serializeQuery, type DatabaseQuery } from '@/lib/database/query';
import { PUBLIC_CONTACT_FIELDS, type DatabaseResponse } from '@/lib/database/types';

// `server-only` throws outside a React Server environment; the modules under test are server code.
vi.mock('server-only', () => ({}));

const { GET } = await import('@/app/api/database/route');
const { mapToPublicContact } = await import('@/lib/database/public-contact');

const res = await GET();
const body = (await res.json()) as DatabaseResponse;
const contacts = body.data;
const q = (patch: Partial<DatabaseQuery>) => applyQuery(contacts, { ...DEFAULT_QUERY, ...patch });

const SENSITIVE = /email|phone|mobile|note|status|token|secret|airtable/i;

describe('GET /api/database', () => {
  it('returns 200 with source, total, updatedAt, data', () => {
    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['data', 'source', 'total', 'updatedAt']);
    expect(body.source).toBe('mock');
    expect(body.total).toBe(contacts.length);
    expect(contacts.length).toBeGreaterThanOrEqual(12);
  });

  it('exposes only allowlisted fields and no private value', () => {
    for (const c of contacts) expect(Object.keys(c).sort()).toEqual([...PUBLIC_CONTACT_FIELDS].sort());
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/example\.invalid|\+39 000|Nota interna|linkedin\.com/);
    expect(Object.keys(contacts[0]!).some((k) => SENSITIVE.test(k))).toBe(false);
  });

  it('mapToPublicContact ignores every field outside the allowlist', () => {
    const c = mapToPublicContact({
      id: 'recX',
      fields: { 'First Name': ' Ada ', 'Last Name': 'Rossi', Email: 'a@b.c', Phone: '1', Notes: 'x', 'Contact Type': ['A', 'A', ''] },
    });
    expect(c).toEqual({
      id: 'recX',
      name: 'Ada Rossi',
      firstName: 'Ada',
      lastName: 'Rossi',
      company: null,
      contactType: ['A'],
      jobTitle: null,
      hasLinkedin: false,
    });
    expect(mapToPublicContact({ id: 'recY', fields: { Email: 'only@private.it' } })).toBeNull();
  });
});

describe('search, filters, sorting', () => {
  it('search is case-insensitive across name, company and role', () => {
    const hub = q({ q: 'hubspot' });
    expect(hub.map((c) => c.name).sort()).toEqual(['Adib Mouchanan', 'Gabriele Sardelli']);
    expect(q({ q: 'MOUCHANAN' })).toHaveLength(1);
    expect(q({ q: 'sales' }).every((c) => /sales/i.test(c.jobTitle ?? ''))).toBe(true);
    expect(q({ q: 'cantu' }).map((c) => c.lastName)).toEqual(['Cantù']); // accent-insensitive
  });

  it('contact type filter narrows the results', () => {
    const inv = q({ types: ['Investor/BA'] });
    expect(inv.length).toBeGreaterThan(0);
    expect(inv.length).toBeLessThan(contacts.length);
    expect(inv.every((c) => c.contactType.includes('Investor/BA'))).toBe(true);
  });

  it('search + type + company + LinkedIn combine (AND across groups)', () => {
    expect(q({ q: 'sales', types: ['Investor/BA'], companies: ['HubSpot'] }).map((c) => c.id)).toEqual(['rec001']);
    expect(q({ types: ['Investor/BA'], companies: ['HubSpot'], linkedin: 'no' })).toHaveLength(0);
    expect(q({ companies: ['Mapadore'] }).map((c) => c.lastName).sort()).toEqual(['Motta', 'Tropeano']);
  });

  it('reset restores the whole dataset', () => {
    expect(applyQuery(contacts, DEFAULT_QUERY)).toHaveLength(contacts.length);
  });

  it('sorts by name both ways and keeps missing companies last', () => {
    const asc = q({ sort: 'name-asc' }).map((c) => c.name);
    expect(q({ sort: 'name-desc' }).map((c) => c.name)).toEqual([...asc].reverse());
    const byCompany = q({ sort: 'company-asc' });
    const firstMissing = byCompany.findIndex((c) => !c.company);
    expect(byCompany.slice(firstMissing).every((c) => !c.company)).toBe(true);
  });

  it('facets come from the data', () => {
    const f = facets(contacts);
    expect(f.types.map((x) => x.value)).toEqual(expect.arrayContaining(['Investor/BA', 'Advisor/Mentor']));
    expect(f.companies.find((x) => x.value === 'HubSpot')?.count).toBe(2);
  });

  it('URL state round-trips', () => {
    const state: DatabaseQuery = { q: 'sales', types: ['Investor/BA'], companies: ['HubSpot'], linkedin: 'yes', sort: 'role-asc', view: 'cards' };
    expect(parseQuery(serializeQuery(state))).toEqual(state);
    expect(serializeQuery(DEFAULT_QUERY)).toBe('');
    expect(parseQuery('sort=bogus&view=x&li=maybe')).toEqual(DEFAULT_QUERY);
  });
});

describe('CSV export', () => {
  it('contains only the filtered rows and public columns', () => {
    const filtered = q({ types: ['Investor/BA'] });
    const lines = contactsCsv(filtered).replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe(PUBLIC_CONTACT_FIELDS.join(','));
    expect(lines).toHaveLength(filtered.length + 1);
    expect(lines.join('\n')).not.toMatch(/example\.invalid|\+39 000|Nota interna/);
  });

  it('exports a header even with no results', () => {
    expect(contactsCsv([]).replace(/^﻿/, '').trim()).toBe(PUBLIC_CONTACT_FIELDS.join(','));
  });
});
