import { REGIONS } from '@/lib/geo/territories';
import type { PublicPlayer } from '@/lib/data/schema';
import { applyFilters, parseFilters } from '@/lib/filters';

/**
 * Downloadable files (CLAUDE.md "Downloads", PRD § "Public database download").
 *
 * Structure: exactly the columns of the Rainmakers OS master — same number, same original
 * names, same order (read from the import, `getExportColumns()`), nothing added, removed,
 * renamed or merged. MAIN TYPE keeps its master name even though the interface says
 * PLAYER TYPE.
 *
 * Content: only public values. A cell is filled only through the allowlist below (master
 * column → public field of the player). Reserved columns (REFERENCE, INFORMATION SOURCE,
 * SECONDARY TYPE, PHONE, EMAIL) and any column not in the allowlist — including future
 * ones — are present as headers with completely empty cells. This structural exception
 * applies to the files only: reserved fields stay absent from interface, public dataset,
 * API and payloads.
 */

/** The documented structure of the master export (fallback when the import schema is missing). */
export const MASTER_COLUMNS = [
  'COMPANY NAME',
  'WEBSITE',
  'REFERENCE',
  'SHORT DESCRIPTION',
  'INFORMATION SOURCE',
  'MAIN TYPE',
  'SECONDARY TYPE',
  'ADDRESS',
  'REGION',
  'CITY',
  'EMAIL',
  'PHONE',
  'INDUSTRY',
  'STATUS',
  'GOOGLE MAPS LINK',
  'LOGO',
] as const;

/** Columns that are always empty in the files (headers only). Everything outside PUBLIC_VALUES is empty too. */
export const RESERVED_EXPORT_COLUMNS = ['REFERENCE', 'INFORMATION SOURCE', 'SECONDARY TYPE', 'PHONE', 'EMAIL'] as const;

/** Public Google Maps link of a player: its coordinates, or a search on name + place. */
export function googleMapsLink(name: string, loc: { lat: number | null; lng: number | null; city: string | null; address: string | null } | null): string {
  const q = loc?.lat != null && loc.lng != null ? `${loc.lat},${loc.lng}` : [name, loc?.address ?? loc?.city, 'Italia'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

const REGION_NAME = new Map(REGIONS.map((r) => [r.slug, r.it.toUpperCase()]));
/** Master STATUS vocabulary: ACTIVE, or empty when not verified (INACTIVE is never public). */
const STATUS_VALUE = { active: 'ACTIVE', unverified: '', inactive: 'INACTIVE' } as const;

/** The allowlist: master column (normalised name) → public value. Same meaning as in the master. */
const PUBLIC_VALUES: Record<string, (p: PublicPlayer) => string> = {
  'COMPANY NAME': (p) => p.name,
  WEBSITE: (p) => p.website ?? '',
  'SHORT DESCRIPTION': (p) => p.description ?? '',
  'MAIN TYPE': (p) => p.mainType ?? '',
  'PLAYER TYPE': (p) => p.mainType ?? '', // older exports: same column, older name
  ADDRESS: (p) => (p.location?.source === 'data' ? p.location.address : null) ?? '',
  REGION: (p) => (p.location?.region && REGION_NAME.get(p.location.region)) ?? '',
  CITY: (p) => p.location?.city ?? '',
  INDUSTRY: (p) => p.industries.join('; '),
  STATUS: (p) => STATUS_VALUE[p.status],
  'GOOGLE MAPS LINK': (p) => {
    if (!p.location) return '';
    const loc = p.location.source === 'data' ? p.location : { ...p.location, lat: null, lng: null };
    return googleMapsLink(p.name, loc);
  },
  LOGO: (p) => (p.logo ? 'SI' : 'NO'),
};

const norm = (c: string) => c.replace(/\s+/g, ' ').trim().toUpperCase();
const RESERVED = new Set<string>(RESERVED_EXPORT_COLUMNS);

/** Value getter of a master column, or null when the cell must stay empty. */
export function columnValue(column: string): ((p: PublicPlayer) => string) | null {
  const c = norm(column);
  if (RESERVED.has(c)) return null;
  return PUBLIC_VALUES[c] ?? null;
}

/**
 * Authorised schema metadata = column names only. Rejects anything that is not a non-empty
 * list of unique, non-empty names containing the identity and classification columns.
 */
export function validateExportSchema(columns: unknown): string[] {
  if (!Array.isArray(columns) || !columns.length) throw new Error('schema: no columns');
  const names = columns.map((c) => (typeof c === 'string' ? c.trim() : ''));
  if (names.some((n) => !n)) throw new Error('schema: empty column name');
  if (new Set(names.map(norm)).size !== names.length) throw new Error('schema: duplicate column');
  if (!names.some((n) => norm(n) === 'COMPANY NAME')) throw new Error('schema: COMPANY NAME missing');
  if (!names.some((n) => norm(n) === 'MAIN TYPE' || norm(n) === 'PLAYER TYPE')) throw new Error('schema: MAIN TYPE missing');
  return names;
}

/** One row per player, one cell per master column, in the master order. */
export function exportTable(players: PublicPlayer[], columns: readonly string[] = MASTER_COLUMNS): string[][] {
  const getters = columns.map(columnValue);
  return players.map((p) => getters.map((g) => (g ? g(p) : '')));
}

/** The download modes (CLAUDE.md "Downloads"): the whole public dataset, or the active filters + search. */
export type ExportScope = 'all' | 'filtered';

export const parseExportScope = (sp: URLSearchParams): ExportScope => (sp.get('scope') === 'all' ? 'all' : 'filtered');

/**
 * The players a download contains. Input is always the public dataset (getDataset(): STARTUP and
 * the other non-publishable rows are already out). "all" ignores every filter param; "filtered"
 * applies exactly the same applyFilters() as map and database (every public filter, present and
 * future, plus the text search), with no pagination. Count = results on screen.
 */
export function selectForExport(players: PublicPlayer[], sp: URLSearchParams): { scope: ExportScope; list: PublicPlayer[] } {
  const scope = parseExportScope(sp);
  return { scope, list: scope === 'all' ? players : applyFilters(players, parseFilters(sp)) };
}

export type ExportFile = { scope: ExportScope; columns: string[]; rows: string[][] };

/**
 * Steps 7–11 of the export pipeline (CLAUDE.md "Export pipeline"), on the public dataset
 * only: user filters → master column structure → public values → reserved columns as
 * empty cells → validation. Reserved values are never fetched: the only inputs are the
 * public players and the schema metadata (column names). Throws instead of producing a
 * file that breaks the rules.
 */
export function buildExport(players: PublicPlayer[], schema: readonly string[], sp: URLSearchParams): ExportFile {
  const columns = validateExportSchema(schema);
  const { scope, list } = selectForExport(players, sp);
  const rows = exportTable(list, columns);
  // Validation of the file content before it is generated.
  if (rows.length !== list.length) throw new Error('export: row count differs from the selection');
  const empty = columns.map((c, i) => (columnValue(c) ? -1 : i)).filter((i) => i >= 0);
  for (const r of rows) {
    if (r.length !== columns.length) throw new Error('export: row width differs from the schema');
    if (empty.some((i) => r[i] !== '')) throw new Error('export: value in a reserved column');
  }
  return { scope, columns, rows };
}

const csvCell = (v: string) => {
  let s = v;
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV UTF-8 (BOM, CRLF): the master header row, then the rows. An empty result still has the header. */
export function toCsv(columns: readonly string[], rows: string[][]): string {
  const lines = [columns.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** JSON: one object per player with the master columns as keys, in the master order. */
export function toJsonRecords(columns: readonly string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ''])));
}
