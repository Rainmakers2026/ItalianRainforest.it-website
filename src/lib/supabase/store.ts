import 'server-only';
import type { z } from 'zod';
import type { DownloadReason, DownloadRequestSchema, SignupSchema, SuggestionSchema } from '../leads';
import { json } from '../leads';
import { subscribe, type SubscribeInput } from '../newsletter/service';
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
    // Later events are analytics only: never synced to Airtable (IRF - USERS REQUESTS).
    ...(event ? { airtable_sync_status: 'SKIPPED' } : {}),
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
  // Map PNG / PDF events: the file exists (recorded by the browser just before saving it).
  const mapFile = event && s.filterQuery !== undefined;
  await insertOnce(TABLES.downloads, {
    ...common,
    request_type: upper(s.reason),
    file_format: event ? (FORMAT_OF[s.reason] ?? null) : null,
    ...(mapFile
      ? {
          download_scope: new URLSearchParams(s.filterQuery).get('scope') === 'all' ? 'ALL' : 'FILTERED',
          filter_query: s.filterQuery || null,
          row_count: s.rowCount ?? null,
        }
      : {}),
  });
}

/** POST /api/download: the file actually served to a signed-up visitor. */
export async function recordDownload(d: Download, rowCount: number): Promise<void> {
  const q = new URLSearchParams(d.query);
  const reason: DownloadReason = d.reason ?? (d.format === 'table' ? 'map_pdf' : d.format === 'xlsx' ? 'download_xlsx' : 'download_csv');
  await insertOnce(TABLES.downloads, {
    request_id: d.requestId,
    entry_type: 'EVENT',
    airtable_sync_status: 'SKIPPED',
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

/**
 * Explicit, optional RAINFOREST RADAR consent from the other forms (download, embed,
 * update request): the same subscription lifecycle as the dedicated form
 * (src/lib/newsletter/service.ts) — PENDING until a double opt-in, never a reactivation,
 * the original consent kept, every consent recorded in the history.
 */
export async function recordNewsletter(n: Omit<SubscribeInput, 'sourceForm' | 'privacyAcknowledged'> & { sourceForm: NewsletterSource }) {
  // The other forms require the privacy acknowledgment ("Ho letto l'informativa…").
  return subscribe({ ...n, privacyAcknowledged: true }, 'optional');
}

/** Known error messages carry only the service, the table and a code — never a value. */
const describe = (err: unknown) =>
  err instanceof StoreError || (err instanceof Error && /^(Supabase|Brevo|Airtable) /.test(err.message)) ? (err as Error).message : `unexpected ${(err as Error)?.name ?? 'error'}`;

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
