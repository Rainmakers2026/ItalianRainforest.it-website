/**
 * Supabase → Airtable "IRF - USERS REQUESTS": the real route handlers (/api/signup,
 * /api/suggest, /api/download, /api/newsletter/reconcile) against SIMULATED Supabase and
 * Airtable (tests/support/*-mock.ts). Nothing leaves the process.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIntegrationsMock } from './support/integrations-mock';
import { createSupabaseMock } from './support/supabase-mock';

vi.mock('server-only', () => ({}));

const SUPABASE_URL = 'http://127.0.0.1:54331';
const MOCK = 'http://127.0.0.1:54332';
const KEY = 'test-service-role-key-not-real-0123456789';
const PAT = 'patTEST.user-requests-not-real';
const BASE = 'appUSERREQTEST001';
const UR = 'tblUSERREQUESTS01';
const CRON = 'test-cron-secret-0123456789abcdef';
const db = createSupabaseMock(KEY);
const ext = createIntegrationsMock({ brevoKey: 'unused', listId: 1, attributes: [], airtablePat: PAT, baseId: BASE, subscribersTable: 'tblNOTUSEDSUBS001', unsubscribersTable: 'tblNOTUSEDUNSU001', userRequestsTable: UR });

const ENV = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: KEY,
  PRIVACY_POLICY_VERSION: 'draft-2026-11',
  AIRTABLE_SYNC_PAT: PAT,
  AIRTABLE_SYNC_BASE_ID: BASE,
  AIRTABLE_USER_REQUESTS_TABLE_ID: UR,
  AIRTABLE_API_BASE: `${MOCK}/airtable`,
  NEWSLETTER_CRON_SECRET: CRON,
};

const ORIGIN = 'http://localhost:3000';
let ip = 0;
const post = (route: { POST: (r: Request) => Promise<Response> }, path: string, body: unknown) =>
  route.POST(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost:3000', origin: ORIGIN, 'x-forwarded-for': `10.5.${Math.floor(++ip / 250)}.${ip % 250}` }, body: JSON.stringify(body) }));
const id = () => crypto.randomUUID();
const person = { firstName: 'Ada', lastName: 'Rossi', email: 'ada.requests@example.com', company: '', consent: true, locale: 'it', elapsed: 4000, company_url: '' };
const reg = (extra: object = {}) => ({ ...person, marketing: false, reason: 'download_csv', entry: 'registration', requestId: id(), origin: { page: '/it', section: 'database', cta: 'dialog_all_csv' }, ...extra });
const upd = (extra: object = {}) => ({ email: 'ada.requests@example.com', consent: true, marketing: true, locale: 'it', elapsed: 4000, company_url: '', type: 'correction', organization: 'Acme Ventures', website: 'https://acme.example', details: 'The address of the office has changed.', requestId: id(), origin: { page: '/it', section: 'update', cta: 'contact_correction' }, ...extra });
const records = () => ext.airtable.records[UR]!;
const reconcileReq = () => new Request(`${ORIGIN}/api/newsletter/reconcile`, { headers: { authorization: `Bearer ${CRON}` } });

let signup: typeof import('@/app/api/signup/route');
let suggest: typeof import('@/app/api/suggest/route');
let download: typeof import('@/app/api/download/route');
let reconcile: typeof import('@/app/api/newsletter/reconcile/route');

beforeAll(async () => {
  for (const k of ['LEAD_WEBHOOK_URL', 'AIRTABLE_LEADS_TOKEN', 'AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'BREVO_API_KEY']) delete process.env[k];
  Object.assign(process.env, ENV);
  for (const level of ['info', 'error', 'warn', 'log'] as const) vi.spyOn(console, level).mockImplementation(() => {});
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(SUPABASE_URL)) return db.handle(new Request(input, init));
    if (url.startsWith(MOCK)) return ext.handle(new Request(input, init));
    throw new Error(`unexpected outbound request: ${url}`);
  });
  vi.resetModules();
  signup = await import('@/app/api/signup/route');
  suggest = await import('@/app/api/suggest/route');
  download = await import('@/app/api/download/route');
  reconcile = await import('@/app/api/newsletter/reconcile/route');
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of Object.keys(ENV)) delete process.env[k];
});
beforeEach(() => {
  db.reset();
  ext.reset();
  Object.assign(process.env, ENV);
});

describe('initial registrations and update requests → IRF - USERS REQUESTS', () => {
  it('database download sign-up → one record, DATABASE DOWNLOAD, typed fields, key with the source table', async () => {
    expect((await post(signup, '/api/signup', reg())).status).toBe(200);
    const row = db.tables.download_registrations[0]!;
    expect(row).toMatchObject({ airtable_sync_status: 'SYNCED', airtable_record_id: records()[0]!.id });
    expect(records()).toHaveLength(1);
    expect(records()[0]!.fields).toEqual({
      'SUPABASE ID': `download_registrations:${row.id}`,
      'REQUEST DATE': new Date(String(row.created_at)).toISOString(),
      SOURCE: 'DATABASE DOWNLOAD',
      'FIRST NAME': 'Ada',
      'LAST NAME': 'Rossi',
      EMAIL: 'ada.requests@example.com',
      'PRIVACY ACKNOWLEDGMENT': true,
      'NEWSLETTER CONSENT': false,
    });
  });

  it('map download → MAP DOWNLOAD; map / database embed → EMBED MAP / EMBED DATABASE', async () => {
    await post(signup, '/api/signup', reg({ reason: 'map_png', origin: { page: '/en', section: 'map', cta: 'panel_filtered_map_png' } }));
    await post(signup, '/api/signup', reg({ reason: 'embed', embedKind: 'map', origin: { page: '/it', section: 'share_map', cta: 'unlock_button' } }));
    await post(signup, '/api/signup', reg({ reason: 'embed', embedKind: 'database', origin: { page: '/it', section: 'share_database', cta: 'unlock_button' } }));
    expect(records().map((r) => r.fields.SOURCE)).toEqual(['MAP DOWNLOAD', 'EMBED MAP', 'EMBED DATABASE']);
    expect(records()[1]!.fields['SUPABASE ID']).toMatch(/^sharing_is_caring_registrations:/);
    expect(records().every((r) => !('REQUEST TYPE (DATABASE UPDATE ONLY)' in r.fields))).toBe(true);
  });

  it('database update request → DATABASE UPDATE REQUEST with request type, organization, website, details', async () => {
    expect((await post(suggest, '/api/suggest', upd())).status).toBe(200);
    const row = db.tables.database_update_requests[0]!;
    expect(records()[0]!.fields).toMatchObject({
      'SUPABASE ID': `database_update_requests:${row.id}`,
      SOURCE: 'DATABASE UPDATE REQUEST',
      'REQUEST TYPE (DATABASE UPDATE ONLY)': 'CORRECTION',
      'ORGANIZATION CONCERNED': 'Acme Ventures',
      WEBSITE: 'https://acme.example',
      'UPDATE DETAILS': 'The address of the office has changed.',
      'PRIVACY ACKNOWLEDGMENT': true,
      'NEWSLETTER CONSENT': true,
    });
    expect(records()[0]!.fields['FIRST NAME']).toBeUndefined(); // the form asks for no name: nothing invented
    expect(row).toMatchObject({ airtable_sync_status: 'SYNCED' });
  });

  it('later downloads, map files and embed copies stay in Supabase only (SKIPPED)', async () => {
    const r = reg();
    await post(signup, '/api/signup', r);
    await post(signup, '/api/signup', reg({ entry: 'event', registrationId: r.requestId, reason: 'map_png', rowCount: 10, filterQuery: 'scope=filtered' }));
    await post(signup, '/api/signup', reg({ entry: 'event', registrationId: r.requestId, reason: 'embed', embedKind: 'map' }));
    await post(download, '/api/download', { ...person, format: 'csv', query: 'scope=all', requestId: id(), origin: { page: '/it', section: 'database', cta: 'dialog_all_csv' } });
    expect(records()).toHaveLength(1);
    const events = [...db.tables.download_registrations, ...db.tables.sharing_is_caring_registrations].filter((x) => x.entry_type === 'EVENT');
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.airtable_sync_status === 'SKIPPED')).toBe(true);
    // The reconciliation never picks them up either.
    await reconcile.GET(reconcileReq());
    expect(records()).toHaveLength(1);
  });

  it('manual operative fields (REVIEW STATUS, STATUS, INTERNAL NOTES) are never overwritten', async () => {
    await post(suggest, '/api/suggest', upd());
    Object.assign(records()[0]!.fields, { 'REVIEW STATUS': 'APPROVED', STATUS: 'DONE', 'INTERNAL NOTES': 'Checked by the team' });
    // A re-sync (e.g. the row back to PENDING) upserts the same key without touching them.
    db.tables.database_update_requests[0]!.airtable_sync_status = 'PENDING';
    await reconcile.GET(reconcileReq());
    expect(records()).toHaveLength(1);
    expect(records()[0]!.fields).toMatchObject({ 'REVIEW STATUS': 'APPROVED', STATUS: 'DONE', 'INTERNAL NOTES': 'Checked by the team', SOURCE: 'DATABASE UPDATE REQUEST' });
  });

  it('Airtable down: the submission still succeeds (Supabase is the source), ERROR + retry later', async () => {
    ext.airtable.fail = 2;
    expect((await post(signup, '/api/signup', reg())).status).toBe(200);
    const row = db.tables.download_registrations[0]!;
    expect(row).toMatchObject({ airtable_sync_status: 'ERROR', airtable_sync_attempts: 1 });
    expect(String(row.airtable_sync_error)).toMatch(/^503/);
    expect(records()).toHaveLength(0);
    // Not due yet: not retried.
    await reconcile.GET(reconcileReq());
    expect(records()).toHaveLength(0);
    row.airtable_next_attempt_at = new Date(Date.now() - 1000).toISOString();
    const r = await (await reconcile.GET(reconcileReq())).json();
    expect(r.report.userRequestsSynced).toBe(1);
    expect(db.tables.download_registrations[0]).toMatchObject({ airtable_sync_status: 'SYNCED' });
    expect(records()).toHaveLength(1);
  });

  it('a wrong select option fails loudly (no typecast) and is not marked synced', async () => {
    ext.airtable.schema[UR]!.SOURCE = { type: 'singleSelect', options: ['MAP DOWNLOAD'] };
    await post(signup, '/api/signup', reg());
    expect(db.tables.download_registrations[0]).toMatchObject({ airtable_sync_status: 'ERROR' });
    expect(String(db.tables.download_registrations[0]!.airtable_sync_error)).toMatch(/INVALID_MULTIPLE_CHOICE_OPTIONS/);
  });

  it('not configured: rows stay PENDING (synced later); QA test rows marked SKIPPED are never sent', async () => {
    delete process.env.AIRTABLE_USER_REQUESTS_TABLE_ID;
    await post(signup, '/api/signup', reg());
    expect(db.tables.download_registrations[0]).toMatchObject({ airtable_sync_status: 'PENDING' });
    db.tables.download_registrations.push({ ...db.tables.download_registrations[0]!, id: id(), request_id: id(), email: 'test-irf-qa+x@example.com', airtable_sync_status: 'SKIPPED' });
    process.env.AIRTABLE_USER_REQUESTS_TABLE_ID = UR;
    const r = await (await reconcile.GET(reconcileReq())).json();
    expect(r.report.userRequestsSynced).toBe(1);
    expect(records().map((x) => x.fields.EMAIL)).toEqual(['ada.requests@example.com']);
  });

  it('never the read-only Rainmakers OS base', async () => {
    process.env.AIRTABLE_BASE_ID = BASE;
    await post(signup, '/api/signup', reg());
    expect(ext.airtable.requests).toEqual([]);
    delete process.env.AIRTABLE_BASE_ID;
  });
});
