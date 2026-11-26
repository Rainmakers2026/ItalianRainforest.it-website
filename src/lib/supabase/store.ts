import 'server-only';
import type { z } from 'zod';
import type { DownloadReason, DownloadRequestSchema, SignupSchema, SuggestionSchema } from '../leads';
import { json } from '../leads';
import { getSupabase, supabaseConfigured } from './server';

/**
 * Form submissions → Supabase (the system of record of every public form).
 *
 *   /api/signup  reason "embed"      → sharing_is_caring_registrations (REGISTRATION | EVENT)
 *   /api/signup  download reasons    → download_registrations           (REGISTRATION | EVENT)
 *   /api/download (POST)             → download_registrations           (EVENT)
 *   /api/suggest                     → database_update_requests
 *   explicit newsletter consent      → newsletter_subscribers (optional, separate)
 *
 * Every row carries the browser-generated `request_id` (unique): a retry or a double
 * submission of the same action is ignored by the database (ON CONFLICT DO NOTHING), never
 * duplicated. Errors are logged with the table and the Postgres code only — never a
 * submitted value, never a key. SQL: supabase/sql/.
 */

export const TABLES = {
  updates: 'database_update_requests',
  embeds: 'sharing_is_caring_registrations',
  downloads: 'download_registrations',
  newsletter: 'newsletter_subscribers',
} as const;

export class StoreError extends Error {
  constructor(
    readonly table: string,
    readonly code: string,
  ) {
    super(`Supabase write to ${table} failed (${code || 'network'})`);
  }
}

/** Version of the privacy notice the visitor accepted. Required: no default in code. */
function privacyVersion(): string | null {
  return process.env.PRIVACY_POLICY_VERSION?.trim() || null;
}
function newsletterVersion(): string | null {
  return process.env.NEWSLETTER_CONSENT_VERSION?.trim() || privacyVersion();
}

/** Supabase can store a submission: URL, service key and privacy-notice version are set. */
export const storeConfigured = () => supabaseConfigured() && !!privacyVersion();

const normEmail = (e: string) => e.trim().toLowerCase();
const upper = <T extends string>(s: T) => s.toUpperCase() as Uppercase<T>;
const origin = (o: { page: string; section: string; cta: string }) => ({ page_path: o.page, page_section: o.section, cta: o.cta });
const utmOf = (u: Record<string, string> | undefined) => (u && Object.keys(u).length ? u : null);

async function insertOnce(table: string, row: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabase().from(table).upsert(row, { onConflict: 'request_id', ignoreDuplicates: true, defaultToNull: false });
  if (error) throw new StoreError(table, error.code ?? '');
}

type Signup = z.infer<typeof SignupSchema>;
type Download = z.infer<typeof DownloadRequestSchema>;
type Suggestion = z.infer<typeof SuggestionSchema>;

const FORMAT_OF: Partial<Record<DownloadReason, 'PNG' | 'PDF'>> = { map_png: 'PNG', map_pdf: 'PDF' };

/** /api/signup: the one-time sign-up, or a later gated action (map PNG, embed copy). */
export async function recordSignup(s: Signup): Promise<void> {
  const version = privacyVersion()!;
  const event = s.entry === 'event';
  const common = {
    request_id: s.requestId,
    entry_type: event ? 'EVENT' : 'REGISTRATION',
    registration_id: event ? (s.registrationId ?? null) : null,
    first_name: s.firstName,
    last_name: s.lastName,
    email: normEmail(s.email),
    locale: s.locale,
    ...origin(s.origin),
    utm: utmOf(s.utm),
    privacy_consent: true,
    // The newsletter is asked only by the sign-up form, never implied by a later action.
    newsletter_consent: !event && s.marketing,
    privacy_policy_version: version,
  };
  if (s.reason === 'embed') {
    await insertOnce(TABLES.embeds, { ...common, embed_kind: upper(s.embedKind!), embed_locale: s.embedLocale ?? null });
    return;
  }
  await insertOnce(TABLES.downloads, {
    ...common,
    request_type: upper(s.reason),
    file_format: event ? (FORMAT_OF[s.reason] ?? null) : null,
  });
}

/** POST /api/download: the file actually served to a signed-up visitor. */
export async function recordDownload(d: Download, rowCount: number): Promise<void> {
  const q = new URLSearchParams(d.query);
  const reason: DownloadReason = d.reason ?? (d.format === 'table' ? 'map_pdf' : d.format === 'xlsx' ? 'download_xlsx' : 'download_csv');
  await insertOnce(TABLES.downloads, {
    request_id: d.requestId,
    entry_type: 'EVENT',
    registration_id: d.registrationId ?? null,
    first_name: d.firstName,
    last_name: d.lastName,
    email: normEmail(d.email),
    request_type: upper(reason),
    file_format: d.format === 'table' ? 'PDF' : upper(d.format),
    download_scope: q.get('scope') === 'all' ? 'ALL' : 'FILTERED',
    filter_query: d.query || null,
    row_count: Number.isFinite(rowCount) && rowCount >= 0 ? rowCount : null,
    locale: d.locale,
    ...origin(d.origin),
    utm: utmOf(d.utm),
    privacy_consent: true,
    newsletter_consent: false,
    privacy_policy_version: privacyVersion()!,
  });
}

/** /api/suggest: the proposed change, for moderation (nothing is published automatically). */
export async function recordSuggestion(s: Suggestion): Promise<void> {
  await insertOnce(TABLES.updates, {
    request_id: s.requestId,
    change_type: upper(s.type),
    organization_name: s.organization,
    website: s.website || null,
    details: s.details,
    email: normEmail(s.email),
    locale: s.locale,
    ...origin(s.origin),
    utm: utmOf(s.utm),
    privacy_consent: true,
    newsletter_consent: s.marketing,
    privacy_policy_version: privacyVersion()!,
  });
}

export type NewsletterSource = 'EMBED_REQUEST' | 'DOWNLOAD_REGISTRATION' | 'DATABASE_UPDATE_REQUEST';
export type NewsletterOutcome = 'created' | 'refreshed' | 'unchanged';

/**
 * Explicit, optional newsletter consent. A new email → PENDING subscriber (double opt-in
 * happens later, outside the site). An existing email: PENDING / SUBSCRIBED → consent
 * refreshed (status untouched); UNSUBSCRIBED / BLOCKED → nothing is changed, never
 * reactivated.
 */
export async function recordNewsletter(n: { email: string; firstName?: string; lastName?: string; locale: 'it' | 'en'; sourceForm: NewsletterSource }): Promise<NewsletterOutcome> {
  const sb = getSupabase();
  const email = normEmail(n.email);
  const consent = { newsletter_consent: true, newsletter_consent_version: newsletterVersion()!, privacy_notice_version: privacyVersion()! };
  const { error } = await sb.from(TABLES.newsletter).insert({
    email,
    first_name: n.firstName || null,
    last_name: n.lastName || null,
    locale: n.locale,
    source_form: n.sourceForm,
    subscription_status: 'PENDING',
    ...consent,
  });
  if (!error) return 'created';
  if (error.code !== '23505') throw new StoreError(TABLES.newsletter, error.code ?? '');

  // Already known (unique on lower(trim(email))).
  const found = await sb.from(TABLES.newsletter).select('id, subscription_status, first_name, last_name').eq('email', email).limit(1);
  if (found.error) throw new StoreError(TABLES.newsletter, found.error.code ?? '');
  const row = found.data?.[0] as { id: string; subscription_status: string; first_name: string | null; last_name: string | null } | undefined;
  if (!row || row.subscription_status === 'UNSUBSCRIBED' || row.subscription_status === 'BLOCKED') return 'unchanged';
  const now = new Date().toISOString();
  const { error: upd } = await sb
    .from(TABLES.newsletter)
    .update({
      ...consent,
      newsletter_consent_at: now,
      updated_at: now,
      ...(!row.first_name && n.firstName ? { first_name: n.firstName } : {}),
      ...(!row.last_name && n.lastName ? { last_name: n.lastName } : {}),
    })
    .eq('id', row.id)
    // Guard against a concurrent unsubscribe: only active / pending contacts are refreshed.
    .in('subscription_status', ['PENDING', 'SUBSCRIBED']);
  if (upd) throw new StoreError(TABLES.newsletter, upd.code ?? '');
  return 'refreshed';
}

const describe = (err: unknown) => (err instanceof StoreError ? err.message : `unexpected ${(err as Error)?.name ?? 'error'}`);

/**
 * Mandatory write of a submission. Returns null when stored, or the error response:
 * never a success when the record could not be saved. Without Supabase configuration:
 * refused (503) in production; in development / tests a redacted notice, no write.
 */
export async function storeOrFail(label: string, write: () => Promise<void>): Promise<Response | null> {
  if (!storeConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`[${label}] Supabase not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PRIVACY_POLICY_VERSION): submission refused`);
      return json({ error: 'unavailable' }, 503);
    }
    console.info(`[${label}:dev] Supabase not configured: submission not stored`);
    return null;
  }
  try {
    await write();
    return null;
  } catch (err) {
    console.error(`[${label}]`, describe(err));
    return json({ error: 'unavailable' }, 503);
  }
}

/** Optional write (newsletter): a failure is logged, the main submission stays successful. */
export async function storeOptional(label: string, write: () => Promise<unknown>): Promise<void> {
  if (!storeConfigured()) return;
  try {
    await write();
  } catch (err) {
    console.error(`[${label}]`, describe(err));
  }
}
