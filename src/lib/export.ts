import { PROVINCES, REGIONS } from '@/lib/geo/territories';
import type { Locale } from '@/lib/i18n/config';
import type { PublicPlayer } from '@/lib/data/schema';
import { CATEGORY_BY_KEY } from '@/lib/data/taxonomy';

const STATUS_LABEL = {
  it: { active: 'Attivo', unverified: 'Da verificare', inactive: 'Non attivo' },
  en: { active: 'Active', unverified: 'To be verified', inactive: 'Inactive' },
} as const;

/**
 * Public export rows, same columns as the database (COMPANY NAME, WEBSITE, …).
 * Only public fields: no gated contacts and no synthetic (demo) coordinates, ever.
 */
export function exportRows(players: PublicPlayer[], locale: Locale) {
  const region = new Map(REGIONS.map((r) => [r.slug, r[locale]]));
  const province = new Map(PROVINCES.map((p) => [p.slug, p.name]));
  return players.map((p) => {
    const loc = p.location?.source === 'data' ? p.location : null;
    return {
      company_name: p.name,
      player_type: p.categories.map((c) => CATEGORY_BY_KEY[c].label[locale]).join('; '),
      website: p.website ?? '',
      short_description: p.description ?? '',
      address: loc?.address ?? '',
      city: loc?.city ?? '',
      province: (loc?.province && province.get(loc.province)) ?? '',
      region: (loc?.region && region.get(loc.region)) ?? '',
      industry: p.industries.join('; '),
      status: STATUS_LABEL[locale][p.status],
      latitude: loc?.lat ?? '',
      longitude: loc?.lng ?? '',
      position_precision: loc?.precision ?? '',
      id: p.id,
    };
  });
}

export type ExportRow = ReturnType<typeof exportRows>[number];

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
