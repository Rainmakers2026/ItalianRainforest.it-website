import 'server-only';
import { AirtableError, upsertBySupabaseId, userRequestFields, type UserRequestRow, type UserRequestTable } from '../newsletter/airtable';
import { airtableUserRequestsConfig } from '../newsletter/config';
import { getSupabase } from './server';

/**
 * Supabase → Airtable "IRF - USERS REQUESTS" (one-way; Supabase stays the source).
 *
 *   download_registrations           REGISTRATION rows → MAP DOWNLOAD / DATABASE DOWNLOAD
 *   sharing_is_caring_registrations  REGISTRATION rows → EMBED MAP / EMBED DATABASE
 *   database_update_requests         every request     → DATABASE UPDATE REQUEST (+ REQUEST TYPE)
 *
 * Later EVENT rows (each download / copy) are analytics: SKIPPED, never synced.
 * Key: "SUPABASE ID" = "<table>:<id>" (unique across the three tables). Idempotent upsert;
 * a row is SYNCED only once Airtable returned the record; failures → ERROR with attempts and
 * a next attempt (5, 20, 80 min … 24 h), retried by the reconciliation. The operative fields
 * (REVIEW STATUS, STATUS, INTERNAL NOTES) are never written. Logs: table + code only.
 */

const COLUMNS: Record<UserRequestTable, string> = {
  download_registrations: 'id, created_at, email, first_name, last_name, page_section, privacy_consent, newsletter_consent, entry_type, airtable_sync_status, airtable_sync_attempts',
  sharing_is_caring_registrations: 'id, created_at, email, first_name, last_name, embed_kind, privacy_consent, newsletter_consent, entry_type, airtable_sync_status, airtable_sync_attempts',
  database_update_requests: 'id, created_at, email, change_type, organization_name, website, details, privacy_consent, newsletter_consent, airtable_sync_status, airtable_sync_attempts',
};
export const USER_REQUEST_TABLES = Object.keys(COLUMNS) as UserRequestTable[];

type Row = UserRequestRow & { entry_type?: 'REGISTRATION' | 'EVENT'; airtable_sync_status: string; airtable_sync_attempts: number | null };
type Outcome = 'synced' | 'skipped' | 'error' | 'not_configured';

const backoff = (attempts: number) => new Date(Date.now() + Math.min(5 * 4 ** Math.max(0, attempts - 1), 1440) * 60_000).toISOString();

async function mark(table: UserRequestTable, id: string | number, values: Record<string, unknown>) {
  const { error } = await getSupabase().from(table).update(values).eq('id', id);
  if (error) throw new Error(`Supabase ${table} failed (${error.code || 'network'})`);
}

/** Syncs one row (already stored in Supabase). Never throws: the outcome is recorded on the row. */
export async function syncUserRequestRow(table: UserRequestTable, row: Row): Promise<Outcome> {
  let cfg;
  try {
    cfg = airtableUserRequestsConfig();
  } catch (err) {
    console.error('[airtable:user-requests] configuration', (err as Error).message);
    return 'error';
  }
  if (!cfg) return 'not_configured'; // stays PENDING: synced once the configuration exists
  if (row.airtable_sync_status === 'SKIPPED' || row.airtable_sync_status === 'SYNCED') return 'skipped';
  if (table !== 'database_update_requests' && row.entry_type !== 'REGISTRATION') {
    await mark(table, row.id, { airtable_sync_status: 'SKIPPED' });
    return 'skipped';
  }
  try {
    const recordId = await upsertBySupabaseId(cfg, cfg.tableId, userRequestFields(table, row));
    await mark(table, row.id, { airtable_record_id: recordId, airtable_sync_status: 'SYNCED', airtable_synced_at: new Date().toISOString(), airtable_sync_error: null, airtable_next_attempt_at: null });
    return 'synced';
  } catch (err) {
    const code = err instanceof AirtableError ? `${err.status} ${err.code}`.trim() : 'error';
    const attempts = (row.airtable_sync_attempts ?? 0) + 1;
    console.error(`[airtable:user-requests] ${table}`, err instanceof Error ? err.message : 'error');
    await mark(table, row.id, { airtable_sync_status: 'ERROR', airtable_sync_error: code.slice(0, 80), airtable_sync_attempts: attempts, airtable_next_attempt_at: backoff(attempts) }).catch(() => {});
    return 'error';
  }
}

/** Right after a submission was stored (best effort: the reconciliation catches up). */
export async function syncUserRequestByRequestId(table: UserRequestTable, requestId: string): Promise<Outcome> {
  if (!airtableUserRequestsConfigSafe()) return 'not_configured';
  try {
    const { data, error } = await getSupabase().from(table).select(COLUMNS[table]).eq('request_id', requestId).limit(1);
    if (error) throw new Error(`Supabase ${table} failed (${error.code || 'network'})`);
    const row = (data as unknown as Row[] | null)?.[0];
    return row ? await syncUserRequestRow(table, row) : 'skipped';
  } catch (err) {
    console.error('[airtable:user-requests]', (err as Error).message);
    return 'error';
  }
}

function airtableUserRequestsConfigSafe() {
  try {
    return airtableUserRequestsConfig();
  } catch {
    return null;
  }
}

export type UserRequestsReport = { userRequestsSynced: number; userRequestsErrors: number };

/** Reconciliation: PENDING / ERROR rows that are due, oldest first, per table. */
export async function reconcileUserRequests(limit = 25): Promise<UserRequestsReport> {
  const r: UserRequestsReport = { userRequestsSynced: 0, userRequestsErrors: 0 };
  if (!airtableUserRequestsConfigSafe()) return r;
  const now = new Date().toISOString();
  for (const table of USER_REQUEST_TABLES) {
    let q = getSupabase().from(table).select(`${COLUMNS[table]}, airtable_next_attempt_at`).in('airtable_sync_status', ['PENDING', 'ERROR']);
    if (table !== 'database_update_requests') q = q.eq('entry_type', 'REGISTRATION');
    const { data, error } = await q.order('created_at', { ascending: true }).limit(limit);
    if (error) {
      console.error(`[airtable:user-requests] reconcile ${table} (${error.code || 'network'})`);
      continue;
    }
    for (const row of (data as unknown as (Row & { airtable_next_attempt_at: string | null })[]) ?? []) {
      if (row.airtable_next_attempt_at && row.airtable_next_attempt_at > now) continue;
      if ((row.airtable_sync_attempts ?? 0) >= 10) continue;
      const out = await syncUserRequestRow(table, row);
      if (out === 'synced') r.userRequestsSynced++;
      if (out === 'error') r.userRequestsErrors++;
    }
  }
  return r;
}
