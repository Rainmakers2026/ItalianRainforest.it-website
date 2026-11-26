/**
 * In-memory stand-in for the Supabase REST API (PostgREST), for tests and e2e only: no test
 * lead ever reaches the real project (CLAUDE.md). It enforces the schema of
 * supabase/sql/01-04 (known columns only, NOT NULL, CHECK values, unique request_id and
 * unique lower(trim(email)) for the newsletter, defaults) and the service-role key, so a
 * mapping error in src/lib/supabase/store.ts fails the tests instead of production.
 *
 * Supported: POST (insert / upsert with ignore-duplicates on request_id), GET with
 * `eq.` filters and limit, PATCH with `eq.` / `in.(...)` filters.
 */

type Row = Record<string, unknown>;
type Col = { required?: boolean; values?: readonly string[]; default?: () => unknown };
type Table = Record<string, Col>;

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const req: Col = { required: true };
const LOCALE = ['it', 'en'] as const;
const SYNC = ['PENDING', 'SYNCED', 'ERROR'] as const;
const ENTRY = ['REGISTRATION', 'EVENT'] as const;

const provenance: Table = { page_path: req, page_section: req, cta: req, utm: {} };
const consents: Table = {
  privacy_consent: { required: true, values: ['true'] },
  newsletter_consent: { default: () => false },
  consent_at: { default: now },
  privacy_policy_version: req,
};

export const SCHEMA = {
  database_update_requests: {
    id: { default: (() => { let n = 0; return () => ++n; })() },
    created_at: { default: now },
    request_id: req,
    source: { default: () => 'ITALIAN RAINFOREST WEBSITE' },
    change_type: { required: true, values: ['NEW', 'CORRECTION', 'OTHER'] },
    organization_name: req,
    website: {},
    details: req,
    email: req,
    locale: { required: true, values: LOCALE },
    ...provenance,
    ...consents,
    review_status: { default: () => 'PENDING', values: ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED'] },
  },
  sharing_is_caring_registrations: {
    id: { default: uuid },
    created_at: { default: now },
    first_name: req,
    last_name: req,
    email: req,
    source: { default: () => 'SHARING IS CARING' },
    locale: { required: true, values: LOCALE },
    ...consents,
    airtable_record_id: {},
    airtable_sync_status: { default: () => 'PENDING', values: SYNC },
    airtable_synced_at: {},
    airtable_sync_error: {},
    request_id: req,
    entry_type: { required: true, values: ENTRY },
    registration_id: {},
    embed_kind: { required: true, values: ['MAP', 'DATABASE'] },
    embed_locale: { values: LOCALE },
    ...provenance,
  },
  download_registrations: {
    id: { default: uuid },
    created_at: { default: now },
    request_id: req,
    entry_type: { required: true, values: ENTRY },
    registration_id: {},
    source: { default: () => 'ITALIAN RAINFOREST WEBSITE' },
    first_name: req,
    last_name: req,
    email: req,
    request_type: { required: true, values: ['DOWNLOAD_CSV', 'DOWNLOAD_XLSX', 'DOWNLOAD_BULK', 'MAP_CSV', 'MAP_PNG', 'MAP_PDF'] },
    file_format: { values: ['CSV', 'XLSX', 'PNG', 'PDF'] },
    download_scope: { values: ['ALL', 'FILTERED'] },
    filter_query: {},
    row_count: {},
    locale: { required: true, values: LOCALE },
    ...provenance,
    ...consents,
    airtable_record_id: {},
    airtable_sync_status: { default: () => 'PENDING', values: SYNC },
    airtable_synced_at: {},
    airtable_sync_error: {},
  },
  newsletter_subscribers: {
    id: { default: uuid },
    created_at: { default: now },
    updated_at: { default: now },
    source: { default: () => 'ITALIAN RAINFOREST WEBSITE' },
    newsletter_name: { default: () => 'RAINFOREST RADAR', values: ['RAINFOREST RADAR'] },
    source_form: { required: true, values: ['NEWSLETTER_SIGNUP', 'DATABASE_UPDATE_REQUEST', 'EMBED_REQUEST', 'DOWNLOAD_REGISTRATION'] },
    locale: { values: LOCALE },
    first_name: {},
    last_name: {},
    email: req,
    newsletter_consent: { required: true, values: ['true'] },
    newsletter_consent_at: { default: now },
    newsletter_consent_version: req,
    privacy_notice_version: req,
    subscription_status: { default: () => 'PENDING', values: ['PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED', 'BLOCKED'] },
    double_opt_in_confirmed: { default: () => false },
    double_opt_in_confirmed_at: {},
    unsubscribed_at: {},
    brevo_contact_id: {},
    brevo_sync_status: { default: () => 'PENDING', values: SYNC },
    brevo_synced_at: {},
    brevo_sync_error: {},
    brevo_sync_attempts: { default: () => 0 },
    // 06_rainforest_radar.sql
    privacy_acknowledged: { default: () => false },
    privacy_acknowledged_at: {},
    page_path: {},
    page_section: {},
    cta: {},
    utm: {},
    doi_cycle_id: {},
    doi_requested_at: {},
    doi_clicked_at: {},
    welcome_claimed_at: {},
    welcome_sent_at: {},
    welcome_message_id: {},
    status_changed_at: { default: now },
    unsubscribe_channel: { values: ['BREVO', 'WEBSITE', 'MANUAL'] },
    unsubscribe_reason: {},
    brevo_next_attempt_at: {},
    airtable_subscriber_record_id: {},
    airtable_unsubscriber_record_id: {},
    airtable_sync_status: { default: () => 'PENDING', values: ['PENDING', 'SYNCED', 'ERROR', 'SKIPPED'] },
    airtable_synced_at: {},
    airtable_sync_error: {},
    airtable_sync_attempts: { default: () => 0 },
    airtable_next_attempt_at: {},
  },
  newsletter_consent_events: {
    id: { default: uuid },
    created_at: { default: now },
    occurred_at: { default: now },
    subscriber_id: req,
    event_type: { required: true, values: ['CONSENT_GIVEN', 'RESUBSCRIBE_REQUESTED', 'DOI_REQUESTED', 'DOI_REQUEST_FAILED', 'DOI_CLICKED', 'DOI_CONFIRMED', 'WELCOME_SENT', 'WELCOME_FAILED', 'UNSUBSCRIBED', 'EVENT_IGNORED', 'BLOCKED_ATTEMPT'] },
    previous_status: { values: ['PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED', 'BLOCKED'] },
    new_status: { values: ['PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED', 'BLOCKED'] },
    source_form: { values: ['NEWSLETTER_SIGNUP', 'DOWNLOAD_REGISTRATION', 'EMBED_REQUEST', 'DATABASE_UPDATE_REQUEST'] },
    locale: { values: LOCALE },
    newsletter_consent: {},
    consent_text: {},
    newsletter_consent_version: {},
    privacy_acknowledged: {},
    privacy_notice_version: {},
    page_path: {},
    page_section: {},
    cta: {},
    utm: {},
    channel: { values: ['BREVO', 'WEBSITE', 'MANUAL'] },
    reason: {},
    request_id: {},
    external_event_id: {},
    details: {},
  },
} satisfies Record<string, Table>;
/** Unique constraints (besides the primary key). */
const UNIQUE: Record<string, ((r: Row) => unknown)[]> = {
  database_update_requests: [(r) => r.request_id],
  sharing_is_caring_registrations: [(r) => r.request_id],
  download_registrations: [(r) => r.request_id],
  newsletter_subscribers: [(r) => String(r.email).trim().toLowerCase()],
  newsletter_consent_events: [(r) => r.request_id, (r) => r.external_event_id],
};
export type TableName = keyof typeof SCHEMA;
const COLUMNS: Record<string, Table> = SCHEMA;

export type MockCall = { method: string; table: string; status: number; body?: unknown };

export function createSupabaseMock(serviceKey: string) {
  const tables = Object.fromEntries(Object.keys(SCHEMA).map((t) => [t, []])) as unknown as Record<TableName, Row[]>;
  const calls: MockCall[] = [];
  /** Set to a table name (or "*") to make writes fail like an unavailable database. */
  const state = { failOn: null as string | null };

  const pgError = (status: number, code: string, message: string) => Response.json({ code, message, details: null, hint: null }, { status });

  function validate(table: string, input: Row): Row | Response {
    const cols = COLUMNS[table]!;
    const unknown = Object.keys(input).filter((k) => !(k in cols));
    if (unknown.length) return pgError(400, 'PGRST204', `Could not find the '${unknown[0]}' column of '${table}'`);
    const row: Row = {};
    for (const [name, col] of Object.entries(cols)) {
      let v = input[name];
      if (v === undefined) v = col.default ? col.default() : null;
      if (v === null && col.required) return pgError(400, '23502', `null value in column "${name}"`);
      if (v !== null && col.values && !col.values.includes(String(v))) return pgError(400, '23514', `check constraint on "${name}"`);
      row[name] = v;
    }
    return row;
  }

  const filtersOf = (sp: URLSearchParams) =>
    [...sp.entries()]
      .filter(([k]) => !['select', 'limit', 'on_conflict', 'columns', 'order'].includes(k))
      .map(([col, expr]) => {
        if (expr.startsWith('eq.')) return (r: Row) => r[col] !== null && r[col] !== undefined && String(r[col]) === expr.slice(3);
        if (expr === 'is.null') return (r: Row) => r[col] === null || r[col] === undefined;
        if (expr === 'not.is.null') return (r: Row) => r[col] !== null && r[col] !== undefined;
        if (expr.startsWith('in.(')) {
          const list = expr.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, ''));
          return (r: Row) => list.includes(String(r[col]));
        }
        throw new Error(`mock: unsupported filter ${col}=${expr}`);
      });
  const ordered = (rows: Row[], order: string | null) => {
    if (!order) return rows;
    const [col, dir] = order.split('.');
    return [...rows].sort((a, b) => {
      const x = a[col!] ?? '';
      const y = b[col!] ?? '';
      return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1);
    });
  };
  const project = (r: Row, select: string | null) => (select && select !== '*' ? Object.fromEntries(select.split(',').map((c) => [c.trim(), r[c.trim()]])) : { ...r });

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    const table = m?.[1] ?? '';
    const record = (status: number, body?: unknown) => calls.push({ method: request.method, table, status, body });
    if (request.headers.get('apikey') !== serviceKey || request.headers.get('authorization') !== `Bearer ${serviceKey}`) {
      record(401);
      return pgError(401, '42501', 'invalid key');
    }
    if (!m || !(table in COLUMNS)) {
      record(404);
      return pgError(404, '42P01', `relation "${table}" does not exist`);
    }
    const rows = (tables as Record<string, Row[]>)[table]!;
    const sp = url.searchParams;

    if (request.method === 'GET') {
      const out = ordered(
        rows.filter((r) => filtersOf(sp).every((f) => f(r))),
        sp.get('order'),
      );
      const limited = sp.get('limit') ? out.slice(0, Number(sp.get('limit'))) : out;
      record(200);
      return Response.json(limited.map((r) => project(r, sp.get('select'))));
    }

    if (state.failOn === '*' || state.failOn === table) {
      record(503);
      return pgError(503, 'PGRST002', 'database unavailable');
    }

    if (request.method === 'POST') {
      const body = (await request.json()) as Row | Row[];
      const ignoreDup = (request.headers.get('prefer') ?? '').includes('resolution=ignore-duplicates');
      const onConflict = sp.get('on_conflict');
      for (const input of Array.isArray(body) ? body : [body]) {
        const row = validate(table, input);
        if (row instanceof Response) {
          record(row.status, input);
          return row;
        }
        const keys = UNIQUE[table] ?? [];
        const clash = keys.findIndex((k) => {
          const v = k(row);
          return v !== null && v !== undefined && rows.some((r) => k(r) === v);
        });
        const dupRequest = clash === 0 && row.request_id !== undefined && row.request_id !== null;
        if (dupRequest && ignoreDup && onConflict === 'request_id') continue;
        if (clash >= 0) {
          record(409, input);
          return pgError(409, '23505', 'duplicate key value violates unique constraint');
        }
        rows.push(row);
      }
      record(201, body);
      return new Response(null, { status: 201 });
    }

    if (request.method === 'PATCH') {
      const patch = (await request.json()) as Row;
      const unknown = Object.keys(patch).filter((k) => !(k in COLUMNS[table]!));
      if (unknown.length) {
        record(400, patch);
        return pgError(400, 'PGRST204', `Could not find the '${unknown[0]}' column`);
      }
      const cols = COLUMNS[table]!;
      for (const [name, v] of Object.entries(patch)) {
        const col = cols[name]!;
        if (v === null && col.required) return pgError(400, '23502', `null value in column "${name}"`);
        if (v !== null && v !== undefined && col.values && !col.values.includes(String(v))) return pgError(400, '23514', `check constraint on "${name}"`);
      }
      const fs = filtersOf(sp);
      if (!fs.length) throw new Error('mock: PATCH without filter');
      const hit = rows.filter((r) => fs.every((f) => f(r)));
      for (const r of hit) Object.assign(r, patch);
      record(hit.length ? 200 : 204, patch);
      // Prefer: return=representation (supabase-js .update().select()) → the updated rows.
      if ((request.headers.get('prefer') ?? '').includes('return=representation')) return Response.json(hit.map((r) => project(r, sp.get('select'))));
      return new Response(null, { status: 204 });
    }

    record(405);
    return pgError(405, 'PGRST000', 'method not allowed');
  }

  const reset = () => {
    for (const t of Object.keys(tables) as TableName[]) tables[t] = [];
    calls.length = 0;
    state.failOn = null;
  };

  return { tables, calls, state, handle, reset };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
