import { createHash } from 'node:crypto';
import { PROVINCES, REGIONS } from '@/lib/geo/territories';
import { PublicPlayerSchema, type GatedContacts, type PlayerLocation, type PublicPlayer } from './schema';
import {
  categoryFromSource,
  STAGE_BY_ORDER,
  TAG_BLOCKLIST,
  TAG_SYNONYMS,
  type CategoryKey,
  type StageKey,
} from './taxonomy';

/**
 * Field names in the Airtable base. The first set exists today; the second set
 * is expected once the geographic/descriptive fields are added (see docs/data-schema.md).
 * Fields marked SENSITIVE are only read server-side into GatedContacts.
 */
export const FIELDS = {
  name: 'Company Name',
  categories: 'Account Type',
  status: 'Status',
  website: 'Website',
  tags: 'Hashtags',
  stages: 'Stage of Investment/Development',
  investmentCountries: 'Countries of investment',
  created: 'Created',
  // Expected / optional
  descriptionIt: 'Description',
  descriptionEn: 'Description EN',
  logo: 'Logo',
  country: 'Country',
  region: 'Region',
  province: 'Province',
  city: 'City',
  lat: 'Latitude',
  lng: 'Longitude',
  linkedin: 'LinkedIn',
  // SENSITIVE — never in the public payload
  email: 'Email',
  phone: 'Phone',
  contactPerson: 'Contact Person',
} as const;

export const SENSITIVE_FIELDS = [FIELDS.email, FIELDS.phone, FIELDS.contactPerson] as const;

export type RawRecord = { id: string; createdTime?: string; fields: Record<string, unknown> };

const str = (v: unknown): string | null => {
  if (typeof v === 'string') {
    const s = v.replace(/\s+/g, ' ').trim();
    return s.length ? s : null;
  }
  if (typeof v === 'number') return String(v);
  return null;
};
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
};

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const publicId = (recordId: string) => createHash('sha256').update(`irf:${recordId}`).digest('base64url').slice(0, 10);

export function normalizeWebsite(raw: string | null): { url: string | null; host: string | null } {
  if (!raw) return { url: null, host: null };
  let s = raw.trim().replace(/\s/g, '');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname.includes('.')) return { url: null, host: null };
    // Drop tracking parameters that sneak in from copy/paste.
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|originalSubdomain$|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    return { url: u.toString(), host };
  } catch {
    return { url: null, host: null };
  }
}

export function normalizeTags(raw: string[]): string[] {
  const out = new Map<string, string>();
  for (const t of raw) {
    const k = t.trim().toLowerCase();
    if (!k || TAG_BLOCKLIST.has(k)) continue;
    const canonical = TAG_SYNONYMS[k] ?? t.trim();
    out.set(canonical.toLowerCase(), canonical);
  }
  return [...out.values()];
}

function normalizeStages(raw: string[]): StageKey[] {
  const keys = raw
    .map((s) => STAGE_BY_ORDER.get(Number.parseInt(s, 10)))
    .filter((k): k is StageKey => !!k);
  return [...new Set(keys)];
}

const regionBySlugOrName = new Map<string, string>(
  REGIONS.flatMap((r) => [[r.slug, r.slug], [slugify(r.it), r.slug], [slugify(r.en), r.slug]]),
);
const provinceBySlugOrCode = new Map<string, { slug: string; region: string }>(
  PROVINCES.flatMap((p) => [
    [p.slug, p],
    [p.code.toLowerCase(), p],
  ]),
);

function normalizeLocation(f: Record<string, unknown>): PlayerLocation | null {
  const region = str(f[FIELDS.region]);
  const province = str(f[FIELDS.province]);
  const city = str(f[FIELDS.city]);
  const lat = num(f[FIELDS.lat]);
  const lng = num(f[FIELDS.lng]);
  const country = str(f[FIELDS.country]);
  if (!region && !province && !city && lat === null && lng === null && !country) return null;
  const prov = province ? provinceBySlugOrCode.get(slugify(province)) ?? provinceBySlugOrCode.get(province.toLowerCase()) : undefined;
  const regionSlug = (region && regionBySlugOrName.get(slugify(region))) ?? prov?.region ?? null;
  const validCoords = lat !== null && lng !== null && !(lat === 0 && lng === 0);
  return {
    country: country ?? (regionSlug ? 'Italy' : null),
    region: regionSlug,
    province: prov?.slug ?? null,
    city,
    lat: validCoords ? lat : null,
    lng: validCoords ? lng : null,
    source: 'data',
  };
}

function attachmentUrl(v: unknown): string | null {
  if (Array.isArray(v) && v[0] && typeof v[0] === 'object') {
    const a = v[0] as { url?: unknown; thumbnails?: { large?: { url?: unknown } } };
    const u = a.thumbnails?.large?.url ?? a.url;
    return typeof u === 'string' && /^https:\/\//.test(u) ? u : null;
  }
  return null;
}

export function extractGatedContacts(f: Record<string, unknown>): GatedContacts {
  return { email: str(f[FIELDS.email]), phone: str(f[FIELDS.phone]), contactPerson: str(f[FIELDS.contactPerson]) };
}

/** Maps one raw source record to the public schema. Returns null for unusable rows. */
export function normalizeRecord(rec: RawRecord): PublicPlayer | null {
  const f = rec.fields;
  const name = str(f[FIELDS.name]);
  if (!name) return null;

  const categories = [
    ...new Set(list(f[FIELDS.categories]).map(categoryFromSource).filter((c): c is CategoryKey => !!c)),
  ];
  const { url, host } = normalizeWebsite(str(f[FIELDS.website]));
  const statusRaw = str(f[FIELDS.status])?.toLowerCase();
  const gated = extractGatedContacts(f);
  const linkedin = normalizeWebsite(str(f[FIELDS.linkedin])).url;

  const player: PublicPlayer = {
    id: publicId(rec.id),
    slug: slugify(name),
    name,
    categories: categories.length ? categories : ['unclassified'],
    status: statusRaw === 'inactive' ? 'inactive' : 'active',
    website: url,
    websiteHost: host,
    description: { it: str(f[FIELDS.descriptionIt]), en: str(f[FIELDS.descriptionEn]) },
    logo: attachmentUrl(f[FIELDS.logo]),
    tags: normalizeTags(list(f[FIELDS.tags])),
    stages: normalizeStages(list(f[FIELDS.stages])),
    investmentCountries: [...new Set(list(f[FIELDS.investmentCountries]))],
    location: normalizeLocation(f),
    publicSocial: { linkedin: linkedin && /linkedin\.com/.test(linkedin) ? linkedin : null },
    hasGatedContacts: !!(gated.email || gated.phone || gated.contactPerson),
    createdAt: str(f[FIELDS.created]) ?? rec.createdTime ?? null,
  };
  const parsed = PublicPlayerSchema.safeParse(player);
  return parsed.success ? parsed.data : null;
}

/**
 * Collapses exact duplicates (same normalised name and same website host),
 * keeping the first record. Returns the duplicates found for the audit log.
 */
export function dedupe(players: PublicPlayer[]): { players: PublicPlayer[]; duplicates: string[] } {
  const seen = new Map<string, PublicPlayer>();
  const duplicates: string[] = [];
  for (const p of players) {
    const key = `${p.slug}|${p.websiteHost ?? ''}`;
    if (seen.has(key)) duplicates.push(p.name);
    else seen.set(key, p);
  }
  // Disambiguate remaining slug collisions so deep links stay unique.
  const slugCount = new Map<string, number>();
  const out = [...seen.values()].map((p) => {
    const n = (slugCount.get(p.slug) ?? 0) + 1;
    slugCount.set(p.slug, n);
    return n > 1 ? { ...p, slug: `${p.slug}-${n}` } : p;
  });
  return { players: out, duplicates };
}
