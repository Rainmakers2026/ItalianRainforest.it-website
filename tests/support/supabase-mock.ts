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
    newsletter_name: { default: () => 'ITALIAN RAINFOREST' },
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
  },
} satisfies Record<string, Table>;
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
        if (expr.startsWith('eq.')) return (r: Row) => String(r[col]) === expr.slice(3);
        if (expr.startsWith('in.(')) {
          const list = expr.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, ''));
          return (r: Row) => list.includes(String(r[col]));
        }
        throw new Error(`mock: unsupported filter ${col}=${expr}`);
      });

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
      const out = rows.filter((r) => filtersOf(sp).every((f) => f(r)));
      const limited = sp.get('limit') ? out.slice(0, Number(sp.get('limit'))) : out;
      const select = sp.get('select');
      const cols = select && select !== '*' ? select.split(',').map((s) => s.trim()) : null;
      record(200);
      return Response.json(limited.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : r)));
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
        const dupRequest = row.request_id !== undefined && rows.some((r) => r.request_id === row.request_id);
        const dupEmail = table === 'newsletter_subscribers' && rows.some((r) => String(r.email).trim().toLowerCase() === String(row.email).trim().toLowerCase());
        if (dupRequest && ignoreDup && onConflict === 'request_id') continue;
        if (dupRequest || dupEmail) {
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
      const fs = filtersOf(sp);
      if (!fs.length) throw new Error('mock: PATCH without filter');
      for (const r of rows) if (fs.every((f) => f(r))) Object.assign(r, patch);
      record(204, patch);
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
