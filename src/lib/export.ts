import { PROVINCES, REGIONS } from '@/lib/geo/territories';
import type { Locale } from '@/lib/i18n/config';
import type { PublicPlayer } from '@/lib/data/schema';
import { CATEGORY_BY_KEY, STAGE_BY_KEY } from '@/lib/data/taxonomy';

/**
 * Public export rows. Only verified public fields: no gated contacts and
 * no synthetic (demo) coordinates, ever.
 */
export function exportRows(players: PublicPlayer[], locale: Locale) {
  const region = new Map(REGIONS.map((r) => [r.slug, r[locale]]));
  const province = new Map(PROVINCES.map((p) => [p.slug, p.name]));
  return players.map((p) => {
    const loc = p.location?.source === 'data' ? p.location : null;
    return {
      id: p.id,
      name: p.name,
      categories: p.categories.map((c) => CATEGORY_BY_KEY[c].label[locale]).join('; '),
      status: p.status,
      website: p.website ?? '',
      linkedin: p.publicSocial.linkedin ?? '',
      description: p.description[locale] ?? p.description.it ?? p.description.en ?? '',
      city: loc?.city ?? '',
      province: (loc?.province && province.get(loc.province)) ?? '',
      region: (loc?.region && region.get(loc.region)) ?? '',
      country: loc?.country ?? '',
      latitude: loc?.lat ?? '',
      longitude: loc?.lng ?? '',
      focus: p.tags.join('; '),
      stages: p.stages.map((s) => STAGE_BY_KEY[s].label[locale]).join('; '),
      investment_countries: p.investmentCountries.join('; '),
    };
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
  return `﻿${lines.join('\r\n')}\r\n`;
}
