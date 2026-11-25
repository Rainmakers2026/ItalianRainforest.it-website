import { createHash } from 'node:crypto';
import { PROVINCES, REGIONS } from '@/lib/geo/territories';
import { PublicPlayerSchema, type GatedContacts, type PlayerLocation, type PlayerLogo, type PublicPlayer } from './schema';
import { categoryFromSource, type CategoryKey, type StatusKey } from './taxonomy';

/**
 * Column names of the IRF database, identical in the CSV export and in the Airtable
 * base "Rainmakers OS". Override any of them without code changes with
 * AIRTABLE_FIELD_MAP='{"name":"Company","types":"Type"}'. Fields marked SENSITIVE are
 * only read server-side into GatedContacts. See docs/data-schema.md.
 */
const DEFAULT_FIELDS = {
  name: 'COMPANY NAME',
  website: 'WEBSITE',
  description: 'SHORT DESCRIPTION',
  // MAIN TYPE is the only public classification (see CLAUDE.md "Public data rules").
  // SECONDARY TYPE is never read. Older exports and snapshots call it PLAYER TYPE.
  types: 'MAIN TYPE',
  legacyTypes: 'PLAYER TYPE',
  address: 'ADDRESS',
  addressCheck: 'ADDRESS CHECK', // set by the CSV importer only
  region: 'REGION',
  province: 'PROVINCE',
  city: 'CITY',
  industry: 'INDUSTRY',
  status: 'STATUS',
  logo: 'LOGO',
  osm: 'OPEN STREET MAP', // OpenStreetMap link, coordinates are read from it when present
  lat: 'Latitude',
  lng: 'Longitude',
  geoPrecision: 'GEO PRECISION',
  // SENSITIVE — never in the public payload. Only EMAIL is read, server-side, for the
  // gated contact request. REFERENCE, PHONE, INFORMATION SOURCE and SECONDARY TYPE are
  // reserved: never read at all.
  email: 'EMAIL',
} as const;
type FieldKey = keyof typeof DEFAULT_FIELDS;

function fieldMapFromEnv(): Record<FieldKey, string> {
  try {
    const custom = process.env.AIRTABLE_FIELD_MAP ? (JSON.parse(process.env.AIRTABLE_FIELD_MAP) as Partial<Record<FieldKey, string>>) : {};
    return { ...DEFAULT_FIELDS, ...custom };
  } catch {
    return { ...DEFAULT_FIELDS };
  }
}
export const FIELDS = fieldMapFromEnv();
/** Reserved columns of the master database: never read, never published. */
export const RESERVED_FIELDS = ['REFERENCE', 'INFORMATION SOURCE', 'SECONDARY TYPE', 'PHONE', 'EMAIL'] as const;

/** MAIN TYPE normalised for comparisons: spaces collapsed, upper case, "A / B" → "A/B". */
export const normalizeMainType = (v: string | null): string | null =>
  v ? v.replace(/\s+/g, ' ').trim().toUpperCase().replace(/\s*\/\s*/g, '/') || null : null;
/** Exact match only: "VENTURE BUILDER/STARTUP STUDIO" is not a startup. */
export const isStartup = (mainType: string | null) => normalizeMainType(mainType) === 'STARTUP';

export type RawRecord = { id: string; createdTime?: string; fields: Record<string, unknown> };

/** Editorial lookups keyed by `nameKey()`, so they work for CSV and Airtable records alike. */
export type Lookups = {
  logos: Record<string, PlayerLogo>;
  geo: Record<string, { lat: number | null; lng: number | null; precision: PlayerLocation['precision'] }>;
};

const PLACEHOLDER = /^(da verificare|not answered|n\/?a|-|–|tbd)$/i;
const str = (v: unknown): string | null => {
  if (typeof v === 'string') {
    const s = v.replace(/\s+/g, ' ').trim();
    return s.length && !PLACEHOLDER.test(s) ? s : null;
  }
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object' && 'name' in v) return str((v as { name: unknown }).name); // Airtable select option
  return null;
};
const list = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map(str).filter((s): s is string => !!s)
    : typeof v === 'string'
      ? v.split(';').map((s) => str(s)).filter((s): s is string => !!s)
      : [];
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

const normName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
/** Same key as scripts/import-irf-csv.mjs. */
export const nameKey = (name: string) => `irf_${createHash('sha256').update(normName(name)).digest('hex').slice(0, 14)}`;

export const publicId = (recordId: string) => createHash('sha256').update(`irf:${recordId}`).digest('base64url').slice(0, 10);

export function normalizeWebsite(raw: string | null): { url: string | null; host: string | null } {
  if (!raw) return { url: null, host: null };
  let s = raw.trim().replace(/\s/g, '');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname.includes('.')) return { url: null, host: null };
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|originalSubdomain$|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    return { url: u.toString(), host };
  } catch {
    return { url: null, host: null };
  }
}

/** Industry labels: drop placeholders and fragments, keep the source spelling. */
export function normalizeIndustries(raw: string[]): string[] {
  const out = new Map<string, string>();
  for (const t of raw) {
    const s = t.trim();
    if (s.length < 3 || /^(altro|other)$/i.test(s)) continue;
    if (!out.has(s.toLowerCase())) out.set(s.toLowerCase(), s);
  }
  return [...out.values()];
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

function coordsFromOsm(v: string | null): { lat: number; lng: number } | null {
  if (!v) return null;
  const m = v.match(/mlat=(-?\d+\.\d+).*?mlon=(-?\d+\.\d+)/) ?? v.match(/#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

function normalizeLocation(f: Record<string, unknown>, geo: Lookups['geo'][string] | undefined): PlayerLocation | null {
  const region = str(f[FIELDS.region]);
  const province = str(f[FIELDS.province]);
  const city = str(f[FIELDS.city]);
  const addressCheck = str(f[FIELDS.addressCheck]);
  // An address contradicting REGION is not shown as the location.
  const address = addressCheck && addressCheck !== 'ok' ? null : str(f[FIELDS.address]);
  const prov = province ? provinceBySlugOrCode.get(slugify(province)) ?? provinceBySlugOrCode.get(province.toLowerCase()) : undefined;
  const regionSlug = (region && regionBySlugOrName.get(slugify(region))) ?? prov?.region ?? null;

  let lat = num(f[FIELDS.lat]);
  let lng = num(f[FIELDS.lng]);
  let precision = (str(f[FIELDS.geoPrecision]) as PlayerLocation['precision']) ?? null;
  const osm = coordsFromOsm(str(f[FIELDS.osm]));
  if (osm) ({ lat, lng } = osm), (precision = 'address');
  if ((lat === null || lng === null) && geo?.lat != null) ({ lat, lng, precision } = geo);
  const validCoords = lat !== null && lng !== null && !(lat === 0 && lng === 0);
  if (!regionSlug && !city && !validCoords) return null;
  return {
    country: 'Italy',
    region: regionSlug,
    province: prov?.slug ?? null,
    city,
    address,
    lat: validCoords ? lat : null,
    lng: validCoords ? lng : null,
    precision: validCoords ? (precision ?? 'city') : null,
    source: 'data',
  };
}

function normalizeLogo(v: unknown): PlayerLogo | null {
  if (Array.isArray(v) && v[0] && typeof v[0] === 'object') {
    // Airtable attachment
    const a = v[0] as { url?: unknown; width?: unknown; height?: unknown; thumbnails?: { large?: { url?: unknown } } };
    const u = a.thumbnails?.large?.url ?? a.url;
    return typeof u === 'string' && /^https:\/\//.test(u)
      ? { src: u, w: num(a.width), h: num(a.height), tone: 'dark' }
      : null;
  }
  if (v && typeof v === 'object' && 'src' in v) {
    const l = v as { src: unknown; w?: unknown; h?: unknown; tone?: unknown; onLight?: unknown; color?: unknown };
    return typeof l.src === 'string'
      ? { src: l.src, w: num(l.w), h: num(l.h), tone: l.tone === 'light' ? 'light' : 'dark', onLight: typeof l.onLight === 'string' ? l.onLight : null, color: typeof l.color === 'string' && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : null }
      : null;
  }
  return null;
}

function normalizeStatus(v: unknown): StatusKey {
  const s = str(v)?.toLowerCase();
  if (s === 'active' || s === 'attivo') return 'active';
  if (s === 'inactive' || s === 'non attivo' || s === 'closed') return 'inactive';
  return 'unverified';
}

export function extractGatedContacts(f: Record<string, unknown>): GatedContacts {
  return { email: str(f[FIELDS.email]) };
}

/** The single MAIN TYPE of a record (first value if a legacy list slips through). */
export function mainTypeOf(f: Record<string, unknown>): string | null {
  const v = f[FIELDS.types] !== undefined ? f[FIELDS.types] : f[FIELDS.legacyTypes];
  return list(v)[0] ?? null;
}

/**
 * Maps one raw source record to the public schema (allowlist: only the fields below are
 * read). Returns null for unusable rows, for every record whose MAIN TYPE is STARTUP and
 * for inactive organisations: what it returns is the public dataset, nothing else is.
 */
export function normalizeRecord(rec: RawRecord, lookups: Lookups = { logos: {}, geo: {} }): PublicPlayer | null {
  const f = rec.fields;
  const name = str(f[FIELDS.name]);
  if (!name || /^nome( azienda)?$/i.test(name)) return null;

  const mainType = mainTypeOf(f);
  if (isStartup(mainType)) return null; // startups are not enablers: never public
  const category: CategoryKey = (mainType && categoryFromSource(mainType)) || 'unclassified';
  const status = normalizeStatus(f[FIELDS.status]);
  // Other publishability rule: organisations marked INACTIVE are not shown anywhere, so
  // database, map, KPIs, ring and infographic all share the same perimeter.
  if (status === 'inactive') return null;
  const { url, host } = normalizeWebsite(str(f[FIELDS.website]));
  const gated = extractGatedContacts(f);
  const key = nameKey(name);

  const player: PublicPlayer = {
    id: publicId(rec.id),
    slug: slugify(name),
    name,
    categories: [category],
    status,
    website: url,
    websiteHost: host,
    description: str(f[FIELDS.description]),
    logo: normalizeLogo(f[FIELDS.logo]) ?? lookups.logos[key] ?? null,
    industries: normalizeIndustries(list(f[FIELDS.industry])),
    location: normalizeLocation(f, lookups.geo[key]),
    hasGatedContacts: !!gated.email,
  };
  const parsed = PublicPlayerSchema.safeParse(player);
  return parsed.success ? parsed.data : null;
}

/**
 * Collapses records with the same normalised name (the export repeats blocks),
 * keeping the first one. Returns the duplicates found for the audit log.
 */
export function dedupe(players: PublicPlayer[]): { players: PublicPlayer[]; duplicates: string[] } {
  const seen = new Map<string, PublicPlayer>();
  const duplicates: string[] = [];
  for (const p of players) {
    const k = normName(p.name);
    if (seen.has(k)) duplicates.push(p.name);
    else seen.set(k, p);
  }
  const slugCount = new Map<string, number>();
  const out = [...seen.values()].map((p) => {
    const n = (slugCount.get(p.slug) ?? 0) + 1;
    slugCount.set(p.slug, n);
    return n > 1 ? { ...p, slug: `${p.slug}-${n}` } : p;
  });
  return { players: out, duplicates };
}
