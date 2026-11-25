/**
 * Fields a user can switch on or off before a download ("Columns" dialog). Same order
 * and names as the columns of the Rainmakers OS database, restricted to public data:
 * EMAIL, PHONE, REFERENCE, INFORMATION SOURCE and SECONDARY TYPE are not offered and
 * cannot be requested (see CLAUDE.md "Public data rules"). The company name is always
 * included.
 */
export const DOWNLOAD_FIELDS = ['name', 'website', 'description', 'type', 'address', 'region', 'city', 'industry', 'status', 'maps'] as const;
export type DownloadField = (typeof DOWNLOAD_FIELDS)[number];

export const REQUIRED_FIELDS: readonly DownloadField[] = ['name'];
export const DEFAULT_DOWNLOAD_FIELDS: DownloadField[] = ['name', 'website', 'description', 'type', 'region', 'city', 'industry', 'status'];

/** Allowlist parser: unknown values are dropped, canonical order, name always present. */
export function parseDownloadFields(raw: string | null | undefined): DownloadField[] {
  if (!raw) return [...DEFAULT_DOWNLOAD_FIELDS];
  const wanted = new Set(raw.split(',').map((s) => s.trim()));
  for (const r of REQUIRED_FIELDS) wanted.add(r);
  return DOWNLOAD_FIELDS.filter((f) => wanted.has(f));
}

export const serializeDownloadFields = (fields: readonly DownloadField[]) => DOWNLOAD_FIELDS.filter((f) => fields.includes(f)).join(',');

const STORAGE_KEY = 'irf-download-fields';
export function loadDownloadFields(): DownloadField[] {
  try {
    return parseDownloadFields(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [...DEFAULT_DOWNLOAD_FIELDS];
  }
}
export function saveDownloadFields(fields: readonly DownloadField[]) {
  try {
    localStorage.setItem(STORAGE_KEY, serializeDownloadFields(fields));
  } catch {
    /* private mode: the choice simply is not remembered */
  }
}

/** Public Google Maps link of a player: its coordinates, or a search on name + place. */
export function googleMapsLink(name: string, loc: { lat: number | null; lng: number | null; city: string | null; address: string | null } | null): string {
  const q = loc?.lat != null && loc.lng != null ? `${loc.lat},${loc.lng}` : [name, loc?.address ?? loc?.city, 'Italia'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
