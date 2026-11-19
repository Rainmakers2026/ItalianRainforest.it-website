import { toCsv } from '@/lib/export';
import { PUBLIC_CONTACT_FIELDS, type PublicContact } from './types';

/**
 * Client-side search / filter / sort over PublicContact[]. Pure functions:
 * the dataset is fetched once from /api/database, then everything runs here.
 */

export type LinkedinFilter = 'all' | 'yes' | 'no';
export type ViewMode = 'table' | 'cards';

/** Sort registry: add an entry to offer a new ordering in the UI. */
const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });
const byText = (pick: (c: PublicContact) => string | null, dir: 1 | -1 = 1) => (a: PublicContact, b: PublicContact) => {
  const x = pick(a);
  const y = pick(b);
  // Missing values always go last, whatever the direction.
  if (!x || !y) return x === y ? collator.compare(a.name, b.name) : x ? -1 : 1;
  return dir * collator.compare(x, y) || collator.compare(a.name, b.name);
};

export const SORTS = {
  'name-asc': byText((c) => c.name),
  'name-desc': byText((c) => c.name, -1),
  'company-asc': byText((c) => c.company),
  'role-asc': byText((c) => c.jobTitle),
} as const;
export type SortKey = keyof typeof SORTS;
export const SORT_KEYS = Object.keys(SORTS) as SortKey[];

export type DatabaseQuery = {
  q: string;
  types: string[];
  companies: string[];
  linkedin: LinkedinFilter;
  sort: SortKey;
  /** null = automatic (table on desktop, cards on mobile). */
  view: ViewMode | null;
};

export const DEFAULT_QUERY: DatabaseQuery = {
  q: '',
  types: [],
  companies: [],
  linkedin: 'all',
  sort: 'name-asc',
  view: null,
};

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Precomputed search text per contact (computed once per dataset). */
export function buildSearchIndex(contacts: PublicContact[]): Map<string, string> {
  return new Map(
    contacts.map((c) => [
      c.id,
      fold([c.name, c.firstName, c.lastName, c.company, c.jobTitle, ...c.contactType].filter(Boolean).join(' ')),
    ]),
  );
}

/**
 * Case- and accent-insensitive. Every word of the query must match somewhere
 * (AND). Values inside a filter group are OR-ed, groups are AND-ed.
 */
export function applyQuery(contacts: PublicContact[], query: DatabaseQuery, index = buildSearchIndex(contacts)) {
  const terms = fold(query.q).split(/\s+/).filter(Boolean);
  const types = new Set(query.types);
  const companies = new Set(query.companies);
  return contacts
    .filter((c) => {
      if (terms.length) {
        const hay = index.get(c.id) ?? '';
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      if (types.size && !c.contactType.some((t) => types.has(t))) return false;
      if (companies.size && !(c.company && companies.has(c.company))) return false;
      if (query.linkedin === 'yes' && !c.hasLinkedin) return false;
      if (query.linkedin === 'no' && c.hasLinkedin) return false;
      return true;
    })
    .sort(SORTS[query.sort]);
}

/** Distinct values with counts over the full dataset, for filter options. */
export function facets(contacts: PublicContact[]) {
  const count = (values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m].sort((a, b) => collator.compare(a[0], b[0])).map(([value, n]) => ({ value, count: n }));
  };
  return {
    types: count(contacts.flatMap((c) => c.contactType)),
    companies: count(contacts.flatMap((c) => (c.company ? [c.company] : []))),
  };
}

export const activeFilterCount = (q: DatabaseQuery) =>
  q.types.length + q.companies.length + (q.linkedin === 'all' ? 0 : 1);

export const isDefaultQuery = (q: DatabaseQuery) => !q.q.trim() && activeFilterCount(q) === 0;

/* URL state: ?q=sales&type=Investor%2FBA&company=HubSpot&li=yes&sort=company-asc&view=cards */

export function parseQuery(search: string | URLSearchParams): DatabaseQuery {
  const p = typeof search === 'string' ? new URLSearchParams(search) : search;
  const sort = p.get('sort');
  const view = p.get('view');
  const li = p.get('li');
  return {
    q: p.get('q') ?? '',
    types: p.getAll('type').filter(Boolean),
    companies: p.getAll('company').filter(Boolean),
    linkedin: li === 'yes' || li === 'no' ? li : 'all',
    sort: SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : DEFAULT_QUERY.sort,
    view: view === 'table' || view === 'cards' ? view : null,
  };
}

export function serializeQuery(q: DatabaseQuery): string {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set('q', q.q.trim());
  for (const t of q.types) p.append('type', t);
  for (const c of q.companies) p.append('company', c);
  if (q.linkedin !== 'all') p.set('li', q.linkedin);
  if (q.sort !== DEFAULT_QUERY.sort) p.set('sort', q.sort);
  if (q.view) p.set('view', q.view);
  return p.toString();
}

/** CSV of the given (already filtered) contacts. Public fields only, by construction. */
export function contactsCsv(contacts: PublicContact[]): string {
  const rows = contacts.map((c) =>
    Object.fromEntries(
      PUBLIC_CONTACT_FIELDS.map((k) => {
        const v = c[k];
        return [k, Array.isArray(v) ? v.join('; ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : (v ?? '')];
      }),
    ),
  );
  return rows.length ? toCsv(rows, '') : `﻿${PUBLIC_CONTACT_FIELDS.join(',')}\r\n`;
}
