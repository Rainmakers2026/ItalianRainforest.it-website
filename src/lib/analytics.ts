/**
 * Privacy-aware analytics abstraction. Provider is chosen with
 * NEXT_PUBLIC_ANALYTICS_PROVIDER = plausible | umami | gtm | none (default).
 * Never pass PII (emails, names typed by users, free text) to `track`.
 */
export type AnalyticsEvent =
  | 'map_view'
  | 'map_filter_used'
  | 'map_category_hover'
  | 'map_player_hover'
  | 'map_player_open'
  | 'contact_unlock_cta_click'
  | 'contact_unlock_form_view'
  | 'contact_unlock_submit'
  | 'contact_unlock_success'
  | 'database_view'
  | 'database_search'
  | 'database_filter_used'
  | 'database_download_click'
  | 'database_download_success'
  | 'embed_code_view'
  | 'embed_code_copy'
  | 'language_switch'
  | 'outbound_player_website'
  | 'rainmakers_outbound'
  | 'update_form_submit'
  | 'update_form_success';

type Props = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    plausible?: (e: string, o?: { props?: Props }) => void;
    umami?: { track: (e: string, p?: Props) => void };
    dataLayer?: unknown[];
  }
}

const PROVIDER = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER ?? 'none';
const PII = /@|\+?\d[\d\s]{7,}/;

// Hover events fire a lot: send each distinct target at most once per page view.
const seenHover = new Set<string>();

export function track(event: AnalyticsEvent, props: Props = {}) {
  if (typeof window === 'undefined') return;
  const clean: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (typeof v === 'string' && PII.test(v)) continue;
    clean[k] = typeof v === 'string' ? v.slice(0, 100) : v;
  }
  if (event.endsWith('_hover')) {
    const key = `${event}:${JSON.stringify(clean)}`;
    if (seenHover.has(key)) return;
    seenHover.add(key);
  }
  try {
    if (PROVIDER === 'plausible') window.plausible?.(event, { props: clean });
    else if (PROVIDER === 'umami') window.umami?.track(event, clean);
    else if (PROVIDER === 'gtm') (window.dataLayer ??= []).push({ event, ...clean });
    else if (process.env.NODE_ENV === 'development') console.debug('[track]', event, clean);
  } catch {
    // Analytics must never break the page.
  }
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

/** Stores first-touch UTM parameters for the session so lead forms can attribute conversions. */
export function captureUtm() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const utm = Object.fromEntries(UTM_KEYS.filter((k) => sp.get(k)).map((k) => [k, sp.get(k)!.slice(0, 80)]));
    if (Object.keys(utm).length && !sessionStorage.getItem('irf_utm')) sessionStorage.setItem('irf_utm', JSON.stringify(utm));
  } catch {
    /* storage unavailable */
  }
}

export function getUtm(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem('irf_utm') ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
