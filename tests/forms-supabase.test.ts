/**
 * Form submissions → Supabase (CLAUDE.md "Form submissions → Supabase"): the real route
 * handlers (/api/signup, /api/download POST, /api/suggest) with a SIMULATED Supabase
 * (tests/support/supabase-mock.ts, schema of supabase/sql/) and fictitious data. No request
 * ever leaves the process: any other URL makes the test fail.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from './support/supabase-mock';

vi.mock('server-only', () => ({}));

const SUPABASE_URL = 'http://127.0.0.1:54321';
const KEY = 'test-service-role-key-not-real-0123456789';
const db = createSupabaseMock(KEY);
const ORIGIN = 'http://localhost:3000';
const EMAIL = 'ada.rossi@example.com';

let ip = 0;
const call = (route: { POST: (r: Request) => Promise<Response> }, url: string, body: object, headers: Record<string, string> = {}) =>
  route.POST(
    new Request(`${ORIGIN}${url}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost:3000', origin: ORIGIN, 'x-forwarded-for': `10.7.${Math.floor(++ip / 250)}.${ip % 250}`, ...headers },
      body: JSON.stringify(body),
    }),
  );

const id = () => crypto.randomUUID();
const origin = (section: string, cta: string, page = '/it') => ({ page, section, cta });
const base = { consent: true, locale: 'it', elapsed: 4000, company_url: '' } as const;
const person = { firstName: 'Ada', lastName: 'Rossi', email: EMAIL, company: '' };
const signupBody = (extra: object = {}) => ({ ...base, ...person, marketing: false, reason: 'download_csv', entry: 'registration', requestId: id(), origin: origin('database', 'dialog_all_csv'), utm: { utm_source: 'newsletter' }, ...extra });
const suggestBody = (extra: object = {}) => ({
  ...base,
  email: EMAIL,
  marketing: false,
  type: 'correction',
  organization: 'Acme Ventures',
  website: 'https://acme.example',
  details: 'The address of the office has changed.',
  requestId: id(),
  origin: origin('update', 'contact_correction'),
  ...extra,
});
const downloadBody = (extra: object = {}) => ({ ...base, ...person, format: 'csv', query: 'region=lombardia&scope=filtered&locale=en', requestId: id(), origin: origin('map', 'panel_filtered_csv'), ...extra });

let signup: typeof import('@/app/api/signup/route');
let suggest: typeof import('@/app/api/suggest/route');
let download: typeof import('@/app/api/download/route');
const logs: string[] = [];
const outbound: string[] = [];

beforeAll(async () => {
  for (const k of ['LEAD_WEBHOOK_URL', 'LEAD_WEBHOOK_SECRET', 'AIRTABLE_LEADS_TOKEN', 'AIRTABLE_LEADS_BASE_ID', 'AIRTABLE_LEADS_TABLE', 'AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_TABLE', 'NEWSLETTER_CONSENT_VERSION']) delete process.env[k];
  Object.assign(process.env, { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, PRIVACY_POLICY_VERSION: 'draft-2026-11', DOWNLOAD_REQUIRES_EMAIL: 'true' });
  for (const level of ['info', 'error', 'warn', 'log'] as const) vi.spyOn(console, level).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' ')));
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith(SUPABASE_URL)) {
      outbound.push(url);
      throw new Error(`unexpected outbound request: ${url}`);
    }
    return db.handle(new Request(input, init));
  });
  vi.resetModules();
  signup = await import('@/app/api/signup/route');
  suggest = await import('@/app/api/suggest/route');
  download = await import('@/app/api/download/route');
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PRIVACY_POLICY_VERSION']) delete process.env[k];
});
beforeEach(() => db.reset());

describe('/api/signup → download_registrations / sharing_is_caring_registrations', () => {
  it('download sign-up: one REGISTRATION row with provenance, consent version, normalised email; nothing echoed', async () => {
    const body = signupBody({ email: '  Ada.Rossi@Example.com ' });
    const res = await call(signup, '/api/signup', body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.tables.download_registrations).toHaveLength(1);
    expect(db.tables.download_registrations[0]).toMatchObject({
      request_id: body.requestId,
      entry_type: 'REGISTRATION',
      registration_id: null,
      first_name: 'Ada',
      last_name: 'Rossi',
      email: EMAIL,
      request_type: 'DOWNLOAD_CSV',
      file_format: null,
      locale: 'it',
      page_path: '/it',
      page_section: 'database',
      cta: 'dialog_all_csv',
      utm: { utm_source: 'newsletter' },
      privacy_consent: true,
      newsletter_consent: false,
      privacy_policy_version: 'draft-2026-11',
      source: 'ITALIAN RAINFOREST WEBSITE',
    });
    expect(db.tables.sharing_is_caring_registrations).toHaveLength(0);
    expect(db.tables.newsletter_subscribers).toHaveLength(0);
  });

  it('embed sign-up → sharing_is_caring_registrations with embed kind and language', async () => {
    const res = await call(signup, '/api/signup', signupBody({ reason: 'embed', embedKind: 'database', embedLocale: 'en', origin: origin('share_database', 'unlock_button', '/en') , locale: 'en' }));
    expect(res.status).toBe(200);
    expect(db.tables.sharing_is_caring_registrations).toHaveLength(1);
    expect(db.tables.sharing_is_caring_registrations[0]).toMatchObject({ entry_type: 'REGISTRATION', embed_kind: 'DATABASE', embed_locale: 'en', locale: 'en', page_path: '/en', page_section: 'share_database', cta: 'unlock_button', source: 'SHARING IS CARING' });
    expect(db.tables.download_registrations).toHaveLength(0);
  });

  it('the same request sent twice (retry, double click) is stored once', async () => {
    const body = signupBody();
    expect((await call(signup, '/api/signup', body)).status).toBe(200);
    expect((await call(signup, '/api/signup', body)).status).toBe(200);
    expect(db.tables.download_registrations).toHaveLength(1);
  });

  it('later actions are EVENT rows linked to the sign-up, never newsletter consents', async () => {
    const registrationId = id();
    const ev = { entry: 'event', registrationId, marketing: true };
    expect((await call(signup, '/api/signup', signupBody({ ...ev, reason: 'map_png', origin: origin('map', 'toolbar_filtered_map_png') }))).status).toBe(200);
    expect((await call(signup, '/api/signup', signupBody({ ...ev, reason: 'embed', embedKind: 'map', embedLocale: 'it', origin: origin('share_map', 'copy_button') }))).status).toBe(200);
    expect(db.tables.download_registrations[0]).toMatchObject({ entry_type: 'EVENT', registration_id: registrationId, request_type: 'MAP_PNG', file_format: 'PNG', newsletter_consent: false });
    expect(db.tables.sharing_is_caring_registrations[0]).toMatchObject({ entry_type: 'EVENT', registration_id: registrationId, embed_kind: 'MAP', newsletter_consent: false });
    expect(db.tables.newsletter_subscribers).toHaveLength(0);
  });

  it('server-side validation: 400 and nothing stored', async () => {
    const bad = [
      signupBody({ consent: false }),
      signupBody({ firstName: '' }),
      signupBody({ email: 'not-an-email' }),
      signupBody({ reason: 'contacts' }),
      signupBody({ reason: 'embed' }), // embed kind missing
      signupBody({ embedKind: 'map' }), // embed kind on a download
      signupBody({ requestId: 'abc' }),
      signupBody({ requestId: undefined }),
      signupBody({ origin: { page: 'javascript:alert(1)', section: 'database', cta: 'x' } }),
      signupBody({ origin: { page: '/it', section: 'Database Section', cta: 'x' } }),
      signupBody({ origin: undefined }),
      signupBody({ locale: 'fr' }),
      signupBody({ registrationId: id() }), // registrations carry no registrationId
      signupBody({ utm: { 'bad key': 'x' } }),
    ];
    for (const b of bad) expect((await call(signup, '/api/signup', b)).status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('anti-bot: honeypot or too-fast submissions get a fake success and store nothing; foreign origin refused', async () => {
    expect((await call(signup, '/api/signup', signupBody({ company_url: 'http://spam.example' }))).status).toBe(200);
    expect((await call(signup, '/api/signup', signupBody({ elapsed: 300 }))).status).toBe(200);
    expect((await call(signup, '/api/signup', signupBody(), { origin: 'https://evil.example' })).status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('rate limit: the 6th sign-up from one client in 10 minutes gets 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call(signup, '/api/signup', signupBody(), { 'x-forwarded-for': '10.200.0.1' })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('no success when the mandatory write fails (database unavailable)', async () => {
    db.state.failOn = 'download_registrations';
    const res = await call(signup, '/api/signup', signupBody());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });
});

describe('/api/download (POST) → download_registrations EVENT', () => {
  it('records the file actually served: format, scope, filters, exact row count, real locale', async () => {
    const registrationId = id();
    const body = downloadBody({ registrationId, reason: 'map_csv' });
    const res = await call(download, '/api/download', body);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    const rows = Number(res.headers.get('x-row-count'));
    expect(rows).toBeGreaterThan(0);
    expect(db.tables.download_registrations).toHaveLength(1);
    expect(db.tables.download_registrations[0]).toMatchObject({
      request_id: body.requestId,
      entry_type: 'EVENT',
      registration_id: registrationId,
      request_type: 'MAP_CSV',
      file_format: 'CSV',
      download_scope: 'FILTERED',
      filter_query: 'region=lombardia&scope=filtered&locale=en',
      row_count: rows,
      locale: 'it',
      page_section: 'map',
      cta: 'panel_filtered_csv',
      newsletter_consent: false,
    });
  });

  it('complete database, Excel and the map PDF list are recorded with their own type', async () => {
    await call(download, '/api/download', downloadBody({ format: 'xlsx', query: 'scope=all', reason: 'download_bulk' }));
    await call(download, '/api/download', downloadBody({ format: 'table', query: 'region=lombardia', reason: 'map_pdf' }));
    await call(download, '/api/download', downloadBody({ format: 'xlsx', query: 'scope=filtered' }));
    expect(db.tables.download_registrations.map((r) => [r.request_type, r.file_format, r.download_scope])).toEqual([
      ['DOWNLOAD_BULK', 'XLSX', 'ALL'],
      ['MAP_PDF', 'PDF', 'FILTERED'],
      ['DOWNLOAD_XLSX', 'XLSX', 'FILTERED'],
    ]);
  });

  it('no file when the download cannot be recorded', async () => {
    db.state.failOn = '*';
    const res = await call(download, '/api/download', downloadBody());
    expect(res.status).toBe(503);
    expect(res.headers.get('content-disposition')).toBeNull();
  });

  it('a bot still gets the open data but is not recorded; invalid payloads are refused', async () => {
    expect((await call(download, '/api/download', downloadBody({ company_url: 'x' }))).status).toBe(200);
    expect((await call(download, '/api/download', downloadBody({ requestId: undefined }))).status).toBe(400);
    expect((await call(download, '/api/download', downloadBody({ lastName: undefined }))).status).toBe(400);
    expect((await call(download, '/api/download', downloadBody({ reason: 'embed' }))).status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });
});

describe('/api/suggest → database_update_requests', () => {
  it('stores every field of the form, the change type and the provenance, for moderation', async () => {
    const body = suggestBody({ utm: { utm_campaign: 'autumn' } });
    const res = await call(suggest, '/api/suggest', body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.tables.database_update_requests).toHaveLength(1);
    expect(db.tables.database_update_requests[0]).toMatchObject({
      request_id: body.requestId,
      change_type: 'CORRECTION',
      organization_name: 'Acme Ventures',
      website: 'https://acme.example',
      details: 'The address of the office has changed.',
      email: EMAIL,
      locale: 'it',
      page_path: '/it',
      page_section: 'update',
      cta: 'contact_correction',
      utm: { utm_campaign: 'autumn' },
      privacy_consent: true,
      newsletter_consent: false,
      privacy_policy_version: 'draft-2026-11',
      review_status: 'PENDING',
      source: 'ITALIAN RAINFOREST WEBSITE',
    });
  });

  it('empty website and UTM are stored as null; duplicates ignored; validation enforced', async () => {
    const body = suggestBody({ website: '', type: 'new' });
    await call(suggest, '/api/suggest', body);
    await call(suggest, '/api/suggest', body);
    expect(db.tables.database_update_requests).toHaveLength(1);
    expect(db.tables.database_update_requests[0]).toMatchObject({ website: null, utm: null, change_type: 'NEW' });
    for (const b of [suggestBody({ details: 'short' }), suggestBody({ organization: '   ' }), suggestBody({ type: 'delete' }), suggestBody({ consent: false })]) {
      expect((await call(suggest, '/api/suggest', b)).status).toBe(400);
    }
  });

  it('no success when the write fails', async () => {
    db.state.failOn = 'database_update_requests';
    expect((await call(suggest, '/api/suggest', suggestBody())).status).toBe(503);
  });
});

describe('explicit newsletter consent → newsletter_subscribers (separate, optional)', () => {
  it('only when the checkbox is ticked, with the source form; PENDING until double opt-in', async () => {
    await call(signup, '/api/signup', signupBody({ marketing: false }));
    expect(db.tables.newsletter_subscribers).toHaveLength(0);
    await call(signup, '/api/signup', signupBody({ marketing: true, reason: 'embed', embedKind: 'map' }));
    await call(suggest, '/api/suggest', suggestBody({ marketing: true, email: 'other@example.com' }));
    await call(signup, '/api/signup', signupBody({ marketing: true, email: 'third@example.com', reason: 'download_bulk' }));
    expect(db.tables.newsletter_subscribers.map((r) => [r.email, r.source_form, r.subscription_status, r.first_name])).toEqual([
      [EMAIL, 'EMBED_REQUEST', 'PENDING', 'Ada'],
      ['other@example.com', 'DATABASE_UPDATE_REQUEST', 'PENDING', null],
      ['third@example.com', 'DOWNLOAD_REGISTRATION', 'PENDING', 'Ada'],
    ]);
    expect(db.tables.newsletter_subscribers[0]).toMatchObject({ newsletter_consent: true, newsletter_consent_version: 'draft-2026-11', privacy_notice_version: 'draft-2026-11', locale: 'it' });
  });

  it('an unsubscribed or blocked contact is never reactivated; a subscribed one keeps status and original consent', async () => {
    const seed = (email: string, status: string, confirmed = false) =>
      db.tables.newsletter_subscribers.push({ id: id(), email, subscription_status: status, double_opt_in_confirmed: confirmed, source_form: 'NEWSLETTER_SIGNUP', first_name: null, last_name: null, newsletter_consent_at: '2026-01-01T00:00:00.000Z', status_changed_at: '2026-01-01T00:00:00.000Z' });
    seed('gone@example.com', 'UNSUBSCRIBED');
    seed('blocked@example.com', 'BLOCKED');
    seed('fan@example.com', 'SUBSCRIBED', true);
    await call(signup, '/api/signup', signupBody({ marketing: true, email: 'Gone@Example.com' }));
    await call(suggest, '/api/suggest', suggestBody({ marketing: true, email: 'blocked@example.com' }));
    await call(signup, '/api/signup', signupBody({ marketing: true, email: 'fan@example.com' }));
    const by = (e: string) => db.tables.newsletter_subscribers.find((r) => r.email === e)!;
    const ev = (e: string) => db.tables.newsletter_consent_events.filter((x) => x.subscriber_id === by(e).id).map((x) => x.event_type);
    expect(db.tables.newsletter_subscribers).toHaveLength(3);
    // Explicit new consent of an unsubscribed contact = a voluntary re-subscription REQUEST:
    // still UNSUBSCRIBED until a new double opt-in; the original consent is kept.
    expect(by('gone@example.com')).toMatchObject({ subscription_status: 'UNSUBSCRIBED', newsletter_consent_at: '2026-01-01T00:00:00.000Z' });
    expect(by('gone@example.com').doi_cycle_id).toBeTruthy();
    expect(ev('gone@example.com')).toEqual(['RESUBSCRIBE_REQUESTED']);
    expect(by('blocked@example.com')).toMatchObject({ subscription_status: 'BLOCKED', newsletter_consent_at: '2026-01-01T00:00:00.000Z' });
    expect(by('blocked@example.com').doi_cycle_id).toBeFalsy();
    expect(ev('blocked@example.com')).toEqual(['BLOCKED_ATTEMPT']);
    expect(by('fan@example.com')).toMatchObject({ subscription_status: 'SUBSCRIBED', first_name: 'Ada', newsletter_consent_at: '2026-01-01T00:00:00.000Z' });
    expect(ev('fan@example.com')).toEqual(['CONSENT_GIVEN']);
    // The registrations themselves are stored in every case.
    expect(db.tables.download_registrations).toHaveLength(2);
  });

  it('a newsletter failure does not undo the registration (optional), and is logged without data', async () => {
    db.state.failOn = 'newsletter_subscribers';
    logs.length = 0;
    const res = await call(signup, '/api/signup', signupBody({ marketing: true }));
    expect(res.status).toBe(200);
    expect(db.tables.download_registrations).toHaveLength(1);
    expect(logs.some((l) => l.includes('newsletter_subscribers') && l.includes('PGRST002'))).toBe(true);
  });
});

describe('configuration and secrets', () => {
  it('production without Supabase configuration: submissions refused (503), never a fake success', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      expect((await call(signup, '/api/signup', signupBody())).status).toBe(503);
      expect((await call(suggest, '/api/suggest', suggestBody())).status).toBe(503);
      expect((await call(download, '/api/download', downloadBody())).status).toBe(503);
      process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
      delete process.env.PRIVACY_POLICY_VERSION;
      expect((await call(suggest, '/api/suggest', suggestBody())).status).toBe(503);
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
      process.env.PRIVACY_POLICY_VERSION = 'draft-2026-11';
      vi.unstubAllEnvs();
    }
    expect(db.calls).toHaveLength(0);
  });

  it('every request carries the service key server-side; logs never contain the key or a submitted email', async () => {
    logs.length = 0;
    await call(signup, '/api/signup', signupBody({ marketing: true }));
    db.state.failOn = '*';
    await call(suggest, '/api/suggest', suggestBody());
    expect(db.calls.every((c) => c.status !== 401)).toBe(true);
    const all = logs.join('\n');
    expect(all).not.toContain(KEY);
    expect(all.toLowerCase()).not.toContain(EMAIL);
    expect(outbound).toEqual([]);
  });

  it('the Supabase client is server-only and never imported by browser code; no public key variable', () => {
    expect(readFileSync('src/lib/supabase/server.ts', 'utf8')).toMatch(/^import 'server-only';/);
    expect(readFileSync('src/lib/supabase/store.ts', 'utf8')).toMatch(/^import 'server-only';/);
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n)) : [path.join(d, n)]));
    for (const f of walk('src').filter((f) => /\.(tsx?|mts)$/.test(f))) {
      const src = readFileSync(f, 'utf8');
      if (/^['"]use client['"]/.test(src)) expect(src, f).not.toMatch(/from ['"][^'"]*supabase|process\.env\.SUPABASE/i);
      expect(src, f).not.toMatch(/NEXT_PUBLIC_SUPABASE|SUPABASE_ANON|SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]/);
    }
    expect(readFileSync('.env.example', 'utf8')).toMatch(/^SUPABASE_SERVICE_ROLE_KEY=$/m);
  });
});
