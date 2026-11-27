import 'server-only';
import type { AirtableSyncConfig } from './config';

/**
 * Airtable sync for RAINFOREST RADAR — the base "IRF push da Supabase", by id
 * (AIRTABLE_SYNC_*), never the read-only Rainmakers OS data base. One-way:
 * Supabase → Airtable. Nothing is ever read back from Airtable into Supabase, so a
 * manual edit in Airtable can never reactivate a contact.
 *
 *   ISCRITTI ALLA NEWSLETTER     ← SUBSCRIBED + double opt-in + consent (upsert on SUPABASE ID)
 *   DISISCRITTI DALLA NEWSLETTER ← UNSUBSCRIBED (upsert, verified, then removal from ISCRITTI)
 *
 * typecast is off: a field with the wrong type or a missing select option fails loudly
 * (see `checkSchema`), it is never silently converted.
 */

export class AirtableError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(`Airtable request failed (${status}${code ? ` ${code}` : ''})`);
    this.status = status;
    this.code = code;
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A connection to the sync base (token + base): shared by the newsletter and the user-request syncs. */
export type AirtableConn = Pick<AirtableSyncConfig, 'pat' | 'baseUrl' | 'baseId'>;

async function call<T>(cfg: AirtableConn, method: 'GET' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  // Guard: never the read-only data base.
  if (cfg.baseId === process.env.AIRTABLE_BASE_ID) throw new AirtableError(0, 'forbidden_base');
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${cfg.pat}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      if (attempt < 1) {
        await wait(500);
        continue;
      }
      throw new AirtableError(0, 'network');
    }
    // 5 requests / second per base; on 429 Airtable asks to wait 30 s: leave it to the
    // reconciliation job instead of blocking the request.
    if (res.status >= 500 && attempt < 1) {
      await wait(800);
      continue;
    }
    const data = (await res.json().catch(() => null)) as T & { error?: { type?: string } | string };
    if (!res.ok) {
      const code = typeof data?.error === 'string' ? data.error : (data?.error?.type ?? '');
      throw new AirtableError(res.status, String(code).slice(0, 60));
    }
    return data;
  }
}

/** The subscriber row as read from Supabase (only the columns the sync needs). */
export type SubscriberRow = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  source: string;
  source_form: string;
  locale: string | null;
  newsletter_consent: boolean;
  newsletter_consent_at: string | null;
  newsletter_consent_version: string | null;
  privacy_notice_version: string | null;
  double_opt_in_confirmed: boolean;
  double_opt_in_confirmed_at: string | null;
  subscription_status: 'PENDING' | 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'BLOCKED';
  unsubscribed_at: string | null;
  unsubscribe_channel: string | null;
  unsubscribe_reason: string | null;
  brevo_contact_id: number | string | null;
  brevo_synced_at: string | null;
};

/** ISO 8601 UTC for Airtable date-time fields; null stays null (never invented). */
const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null);
const text = (v: string | null | undefined) => (v === undefined || v === null || v === '' ? null : String(v));

/** The 17 fields of ISCRITTI ALLA NEWSLETTER, in table order. */
export const SUBSCRIBER_FIELDS = [
  'SUPABASE ID', 'FIRST NAME', 'LAST NAME', 'EMAIL', 'REGISTRATION DATE', 'SOURCE', 'SOURCE FORM', 'LANGUAGE', 'NEWSLETTER CONSENT',
  'CONSENT DATE', 'CONSENT VERSION', 'PRIVACY VERSION', 'DOUBLE OPT-IN', 'DOUBLE OPT-IN CONFIRMATION DATE', 'STATUS', 'BREVO CONTACT ID', 'LAST BREVO SYNC',
] as const;

/** The 17 fields of DISISCRITTI DALLA NEWSLETTER, in table order. */
export const UNSUBSCRIBER_FIELDS = [
  'SUPABASE ID', 'FIRST NAME', 'LAST NAME', 'EMAIL', 'REGISTRATION DATE', 'SOURCE', 'SOURCE FORM', 'LANGUAGE', 'ORIGINAL CONSENT DATE',
  'CONSENT VERSION', 'PRIVACY VERSION', 'UNSUBSCRIBE DATE', 'UNSUBSCRIBE CHANNEL', 'UNSUBSCRIBE REASON', 'STATUS', 'BREVO CONTACT ID', 'LAST BREVO SYNC',
] as const;

export function subscriberFields(s: SubscriberRow): Record<(typeof SUBSCRIBER_FIELDS)[number], string | boolean | null> {
  return {
    'SUPABASE ID': s.id,
    'FIRST NAME': text(s.first_name),
    'LAST NAME': text(s.last_name),
    EMAIL: s.email,
    'REGISTRATION DATE': iso(s.created_at),
    SOURCE: text(s.source),
    'SOURCE FORM': text(s.source_form),
    LANGUAGE: text(s.locale),
    'NEWSLETTER CONSENT': !!s.newsletter_consent,
    'CONSENT DATE': iso(s.newsletter_consent_at),
    'CONSENT VERSION': text(s.newsletter_consent_version),
    'PRIVACY VERSION': text(s.privacy_notice_version),
    'DOUBLE OPT-IN': !!s.double_opt_in_confirmed,
    'DOUBLE OPT-IN CONFIRMATION DATE': iso(s.double_opt_in_confirmed_at),
    STATUS: s.subscription_status,
    'BREVO CONTACT ID': s.brevo_contact_id === null || s.brevo_contact_id === undefined ? null : String(s.brevo_contact_id),
    'LAST BREVO SYNC': iso(s.brevo_synced_at),
  };
}

/** `originalConsentAt`: the first recorded consent (history), not the latest one. */
export function unsubscriberFields(s: SubscriberRow, originalConsentAt: string | null): Record<(typeof UNSUBSCRIBER_FIELDS)[number], string | null> {
  return {
    'SUPABASE ID': s.id,
    'FIRST NAME': text(s.first_name),
    'LAST NAME': text(s.last_name),
    EMAIL: s.email,
    'REGISTRATION DATE': iso(s.created_at),
    SOURCE: text(s.source),
    'SOURCE FORM': text(s.source_form),
    LANGUAGE: text(s.locale),
    'ORIGINAL CONSENT DATE': iso(originalConsentAt ?? s.newsletter_consent_at),
    'CONSENT VERSION': text(s.newsletter_consent_version),
    'PRIVACY VERSION': text(s.privacy_notice_version),
    'UNSUBSCRIBE DATE': iso(s.unsubscribed_at),
    'UNSUBSCRIBE CHANNEL': text(s.unsubscribe_channel),
    'UNSUBSCRIBE REASON': text(s.unsubscribe_reason),
    STATUS: 'UNSUBSCRIBED',
    'BREVO CONTACT ID': s.brevo_contact_id === null || s.brevo_contact_id === undefined ? null : String(s.brevo_contact_id),
    'LAST BREVO SYNC': iso(s.brevo_synced_at),
  };
}

// ---------------------------------------------------------------------------------------
// IRF - USERS REQUESTS — the initial registrations (download / embed) and the database
// update requests. Operative fields edited by the team in Airtable (REVIEW STATUS, STATUS,
// INTERNAL NOTES) are NEVER written: the upsert (PATCH) leaves fields it does not send.
// ---------------------------------------------------------------------------------------
export type UserRequestTable = 'download_registrations' | 'sharing_is_caring_registrations' | 'database_update_requests';
export type UserRequestRow = {
  id: string | number;
  created_at: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  page_section?: string | null;
  embed_kind?: 'MAP' | 'DATABASE' | null;
  change_type?: 'NEW' | 'CORRECTION' | 'OTHER' | null;
  organization_name?: string | null;
  website?: string | null;
  details?: string | null;
  privacy_consent: boolean;
  newsletter_consent: boolean;
};

/** The fields the sync writes (the operative ones are left to the team). */
export const USER_REQUEST_FIELDS = [
  'SUPABASE ID', 'REQUEST DATE', 'SOURCE', 'REQUEST TYPE (DATABASE UPDATE ONLY)', 'FIRST NAME', 'LAST NAME', 'EMAIL',
  'ORGANIZATION CONCERNED', 'WEBSITE', 'UPDATE DETAILS', 'PRIVACY ACKNOWLEDGMENT', 'NEWSLETTER CONSENT',
] as const;
export const USER_REQUEST_OPERATIVE_FIELDS = ['REVIEW STATUS', 'STATUS', 'INTERNAL NOTES'] as const;

/** Unique key across the three source tables, e.g. "database_update_requests:12". */
export const userRequestKey = (table: UserRequestTable, id: string | number) => `${table}:${id}`;

export function userRequestSource(table: UserRequestTable, r: UserRequestRow): string {
  if (table === 'database_update_requests') return 'DATABASE UPDATE REQUEST';
  if (table === 'sharing_is_caring_registrations') return r.embed_kind === 'DATABASE' ? 'EMBED DATABASE' : 'EMBED MAP';
  // Downloads: started from the map section (map files, map menus) or from the database section.
  return r.page_section === 'map' ? 'MAP DOWNLOAD' : 'DATABASE DOWNLOAD';
}

export function userRequestFields(table: UserRequestTable, r: UserRequestRow): Record<(typeof USER_REQUEST_FIELDS)[number], string | boolean | null> {
  const update = table === 'database_update_requests';
  return {
    'SUPABASE ID': userRequestKey(table, r.id),
    'REQUEST DATE': iso(r.created_at),
    SOURCE: userRequestSource(table, r),
    'REQUEST TYPE (DATABASE UPDATE ONLY)': update ? (r.change_type ?? null) : null,
    'FIRST NAME': text(r.first_name),
    'LAST NAME': text(r.last_name),
    EMAIL: r.email,
    'ORGANIZATION CONCERNED': update ? text(r.organization_name) : null,
    WEBSITE: update ? text(r.website) : null,
    'UPDATE DETAILS': update ? text(r.details) : null,
    'PRIVACY ACKNOWLEDGMENT': !!r.privacy_consent,
    'NEWSLETTER CONSENT': !!r.newsletter_consent,
  };
}

type UpsertResponse = { records?: { id: string; fields?: Record<string, unknown> }[] };

/** Idempotent upsert on SUPABASE ID. Returns the Airtable record id (verified in the response). */
export async function upsertBySupabaseId(cfg: AirtableConn, tableId: string, fields: Record<string, unknown>): Promise<string> {
  const data = await call<UpsertResponse>(cfg, 'PATCH', `/v0/${cfg.baseId}/${tableId}`, {
    performUpsert: { fieldsToMergeOn: ['SUPABASE ID'] },
    records: [{ fields }],
    typecast: false,
  });
  const rec = data.records?.[0];
  if (!rec?.id || (rec.fields && rec.fields['SUPABASE ID'] !== fields['SUPABASE ID'])) throw new AirtableError(200, 'upsert_not_verified');
  return rec.id;
}

/** Record id of a Supabase id in a table, or null. */
export async function findBySupabaseId(cfg: AirtableConn, tableId: string, supabaseId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(supabaseId)) return null;
  const formula = encodeURIComponent(`{SUPABASE ID}='${supabaseId}'`);
  const data = await call<{ records?: { id: string }[] }>(cfg, 'GET', `/v0/${cfg.baseId}/${tableId}?filterByFormula=${formula}&maxRecords=2&fields%5B%5D=SUPABASE%20ID`);
  return data.records?.[0]?.id ?? null;
}

export async function deleteRecord(cfg: AirtableConn, tableId: string, recordId: string): Promise<void> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) throw new AirtableError(0, 'invalid_record_id');
  try {
    await call(cfg, 'DELETE', `/v0/${cfg.baseId}/${tableId}?records%5B%5D=${recordId}`);
  } catch (err) {
    // Already gone: the goal (not in the table) is reached.
    if (err instanceof AirtableError && err.status === 404) return;
    throw err;
  }
}

// ---------------------------------------------------------------------------------------
// Schema check (requires schema.bases:read). Read-only: it never changes the schema —
// the Web API cannot change a field type anyway (Update field: name / description only).
// ---------------------------------------------------------------------------------------
/**
 * `type`: the expected type (or the accepted alternatives). `operative`: a field managed by
 * the team, never written by the sync — only its presence is checked.
 */
type Expected = { type: string | string[]; options?: string[]; primary?: boolean; operative?: boolean };
const DATE_TIME: Expected = { type: 'dateTime' };
const SELECT = (options: string[]): Expected => ({ type: 'singleSelect', options });
const SOURCE_FORMS = ['NEWSLETTER_SIGNUP', 'DOWNLOAD_REGISTRATION', 'EMBED_REQUEST', 'DATABASE_UPDATE_REQUEST'];

export const EXPECTED_SCHEMA: Record<'subscribers' | 'unsubscribers' | 'userRequests', Record<string, Expected>> = {
  userRequests: {
    'SUPABASE ID': { type: 'singleLineText', primary: true },
    'REQUEST DATE': DATE_TIME,
    SOURCE: SELECT(['MAP DOWNLOAD', 'DATABASE DOWNLOAD', 'EMBED MAP', 'EMBED DATABASE', 'DATABASE UPDATE REQUEST']),
    'REQUEST TYPE (DATABASE UPDATE ONLY)': SELECT(['NEW', 'CORRECTION', 'OTHER']),
    'FIRST NAME': { type: 'singleLineText' },
    'LAST NAME': { type: 'singleLineText' },
    EMAIL: { type: 'email' },
    'ORGANIZATION CONCERNED': { type: 'singleLineText' },
    WEBSITE: { type: ['url', 'singleLineText'] },
    'REVIEW STATUS': { type: 'singleSelect', operative: true },
    'UPDATE DETAILS': { type: 'multilineText' },
    'PRIVACY ACKNOWLEDGMENT': { type: 'checkbox' },
    'NEWSLETTER CONSENT': { type: 'checkbox' },
    STATUS: { type: 'singleSelect', operative: true },
    'INTERNAL NOTES': { type: ['multilineText', 'richText'], operative: true },
  },
  subscribers: {
    'SUPABASE ID': { type: 'singleLineText', primary: true },
    'FIRST NAME': { type: 'singleLineText' },
    'LAST NAME': { type: 'singleLineText' },
    EMAIL: { type: 'email' },
    'REGISTRATION DATE': DATE_TIME,
    SOURCE: { type: 'singleLineText' },
    'SOURCE FORM': SELECT(SOURCE_FORMS),
    LANGUAGE: SELECT(['it', 'en']),
    'NEWSLETTER CONSENT': { type: 'checkbox' },
    'CONSENT DATE': DATE_TIME,
    'CONSENT VERSION': { type: 'singleLineText' },
    'PRIVACY VERSION': { type: 'singleLineText' },
    'DOUBLE OPT-IN': { type: 'checkbox' },
    'DOUBLE OPT-IN CONFIRMATION DATE': DATE_TIME,
    STATUS: SELECT(['PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED', 'BLOCKED']),
    'BREVO CONTACT ID': { type: 'singleLineText' },
    'LAST BREVO SYNC': DATE_TIME,
  },
  unsubscribers: {
    'SUPABASE ID': { type: 'singleLineText', primary: true },
    'FIRST NAME': { type: 'singleLineText' },
    'LAST NAME': { type: 'singleLineText' },
    EMAIL: { type: 'email' },
    'REGISTRATION DATE': DATE_TIME,
    SOURCE: { type: 'singleLineText' },
    'SOURCE FORM': SELECT(SOURCE_FORMS),
    LANGUAGE: SELECT(['it', 'en']),
    'ORIGINAL CONSENT DATE': DATE_TIME,
    'CONSENT VERSION': { type: 'singleLineText' },
    'PRIVACY VERSION': { type: 'singleLineText' },
    'UNSUBSCRIBE DATE': DATE_TIME,
    'UNSUBSCRIBE CHANNEL': SELECT(['BREVO', 'WEBSITE', 'MANUAL']),
    'UNSUBSCRIBE REASON': { type: 'multilineText' },
    STATUS: SELECT(['UNSUBSCRIBED']),
    'BREVO CONTACT ID': { type: 'singleLineText' },
    'LAST BREVO SYNC': DATE_TIME,
  },
};

type MetaField = { id: string; name: string; type: string; options?: { choices?: { name: string }[]; dateFormat?: { name?: string }; timeFormat?: { name?: string }; timeZone?: string } };
type MetaTable = { id: string; name: string; primaryFieldId: string; fields: MetaField[] };

export type SchemaRow = { table: string; field: string; fieldId: string | null; current: string; expected: string; action: string };

/** The exact table names in the sync base (they are never renamed). */
export const TABLE_NAMES = { userRequests: 'IRF - USERS REQUESTS', subscribers: 'ISCRITTI ALLA NEWSLETTER', unsubscribers: 'DISISCRITTI DALLA NEWSLETTER' } as const;

export async function listTables(cfg: AirtableConn): Promise<MetaTable[]> {
  return (await call<{ tables: MetaTable[] }>(cfg, 'GET', `/v0/meta/bases/${cfg.baseId}/tables`)).tables;
}

/** `cfg` table ids may be unknown: then the tables are found by their exact name. */
export async function checkSchema(cfg: AirtableConn & Partial<Pick<AirtableSyncConfig, 'subscribersTableId' | 'unsubscribersTableId' | 'userRequestsTableId'>>): Promise<{ tables: { id: string; name: string }[]; rows: SchemaRow[] }> {
  const tables = await listTables(cfg);
  const rows: SchemaRow[] = [];
  const byIdOrName = (id: string | null | undefined, name: string) => tables.find((x) => (id && x.id === id) || (!id && x.name === name));
  for (const [kind, tableId] of [['userRequests', cfg.userRequestsTableId], ['subscribers', cfg.subscribersTableId], ['unsubscribers', cfg.unsubscribersTableId]] as const) {
    const t = byIdOrName(tableId, TABLE_NAMES[kind]);
    if (!t) {
      rows.push({ table: tableId || TABLE_NAMES[kind], field: '—', fieldId: null, current: 'table not found', expected: 'table', action: 'check the table id / exact name' });
      continue;
    }
    const expected = EXPECTED_SCHEMA[kind];
    for (const [name, exp] of Object.entries(expected)) {
      const f = t.fields.find((x) => x.name === name);
      const types = Array.isArray(exp.type) ? exp.type : [exp.type];
      const expText = `${types.join(' | ')}${exp.options ? ` [${exp.options.join(', ')}]` : ''}${exp.primary ? ' (primary)' : ''}${types[0] === 'dateTime' ? ' D/M/YYYY 24h Europe/Rome' : ''}${exp.operative ? ' (operative: not written)' : ''}`;
      if (!f) {
        rows.push({ table: t.name, field: name, fieldId: null, current: 'missing', expected: expText, action: 'create the field by hand (exact name) — not done automatically' });
        continue;
      }
      const issues: string[] = [];
      if (!types.includes(f.type)) issues.push(`change type ${f.type} → ${types[0]}`);
      if (exp.primary && t.primaryFieldId !== f.id) issues.push('must be the primary field');
      if (exp.options && types.includes(f.type)) {
        const have = (f.options?.choices ?? []).map((c) => c.name);
        const missing = exp.options.filter((o) => !have.includes(o));
        if (missing.length) issues.push(`add options: ${missing.join(', ')}`);
      }
      if (types[0] === 'dateTime' && f.type === 'dateTime') {
        if (f.options?.dateFormat?.name !== 'european') issues.push('date format: European (D/M/YYYY)');
        if (f.options?.timeFormat?.name !== '24hour') issues.push('time format: 24 hour');
        if (f.options?.timeZone && f.options.timeZone !== 'Europe/Rome') issues.push(`time zone ${f.options.timeZone} → Europe/Rome`);
      }
      rows.push({ table: t.name, field: name, fieldId: f.id, current: f.type, expected: expText, action: issues.length ? issues.join('; ') : 'OK' });
    }
    for (const f of t.fields) if (!(f.name in expected)) rows.push({ table: t.name, field: f.name, fieldId: f.id, current: f.type, expected: '—', action: 'extra field: not written by the sync (left untouched)' });
  }
  return { tables: tables.map((t) => ({ id: t.id, name: t.name })), rows };
}
