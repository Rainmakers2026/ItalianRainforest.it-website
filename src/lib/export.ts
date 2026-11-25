import { PROVINCES, REGIONS } from '@/lib/geo/territories';
import type { Locale } from '@/lib/i18n/config';
import type { PublicPlayer } from '@/lib/data/schema';
import { CATEGORY_BY_KEY } from '@/lib/data/taxonomy';
import { DEFAULT_DOWNLOAD_FIELDS, DOWNLOAD_FIELDS, googleMapsLink, type DownloadField } from '@/lib/download-fields';
import { applyFilters, parseFilters } from '@/lib/filters';

/** The two download modes (CLAUDE.md "Downloads"): the whole public dataset, or the active filters + search. */
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

const STATUS_LABEL = {
  it: { active: 'Attivo', unverified: 'Da verificare', inactive: 'Non attivo' },
  en: { active: 'Active', unverified: 'To be verified', inactive: 'Inactive' },
} as const;

export type ExportRow = Record<string, string | number>;

/**
 * Public export rows, in the order of the database columns (COMPANY NAME, WEBSITE, …),
 * limited to the fields chosen in the "Columns" dialog. Only public fields: no contacts,
 * no reserved columns and no synthetic (demo) coordinates, ever.
 */
export function exportRows(players: PublicPlayer[], locale: Locale, fields: readonly DownloadField[] = DEFAULT_DOWNLOAD_FIELDS): ExportRow[] {
  const region = new Map(REGIONS.map((r) => [r.slug, r[locale]]));
  const province = new Map(PROVINCES.map((p) => [p.slug, p.name]));
  const wanted = DOWNLOAD_FIELDS.filter((f) => f === 'name' || fields.includes(f));
  return players.map((p) => {
    const loc = p.location?.source === 'data' ? p.location : null;
    const cols: Record<DownloadField, ExportRow> = {
      name: { company_name: p.name },
      website: { website: p.website ?? '' },
      description: { short_description: p.description ?? '' },
      type: { player_type: CATEGORY_BY_KEY[p.categories[0]!].label[locale] },
      address: { address: loc?.address ?? '' },
      region: { region: (loc?.region && region.get(loc.region)) ?? '' },
      city: { city: loc?.city ?? '', province: (loc?.province && province.get(loc.province)) ?? '' },
      industry: { industry: p.industries.join('; ') },
      status: { status: STATUS_LABEL[locale][p.status] },
      maps: {
        google_maps_link: loc || p.location ? googleMapsLink(p.name, loc ?? { ...p.location!, lat: null, lng: null }) : '',
        latitude: loc?.lat ?? '',
        longitude: loc?.lng ?? '',
        position_precision: loc?.precision ?? '',
      },
    };
    return Object.assign({}, ...wanted.map((f) => cols[f])) as ExportRow;
  });
}

const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Record<string, unknown>[], attribution: string): string {
  if (!rows.length) return `${attribution}\n`;
  const header = Object.keys(rows[0]!);
  const lines = [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))];
  // BOM so Excel opens UTF-8 correctly.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
