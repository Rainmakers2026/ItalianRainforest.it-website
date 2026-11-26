/**
 * RAINFOREST RADAR — the real route handlers (/api/newsletter, /confirm, /brevo-webhook,
 * /reconcile, /api/signup opt-in) against SIMULATED Supabase, Brevo and Airtable
 * (tests/support/*-mock.ts). No email is sent, nothing is written outside the process.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIntegrationsMock } from './support/integrations-mock';
import { createSupabaseMock } from './support/supabase-mock';

vi.mock('server-only', () => ({}));

const SUPABASE_URL = 'http://127.0.0.1:54321';
const MOCK = 'http://127.0.0.1:54322';
const KEY = 'test-service-role-key-not-real-0123456789';
const BREVO_KEY = 'xkeysib-test-not-real';
const PAT = 'patTEST.not-real-0123456789';
const BASE = 'appTESTSYNC000001';
const SUBS = 'tblTESTSUBSCRIB01';
const UNSUBS = 'tblTESTUNSUBSCR01';
const WEBHOOK = 'test-webhook-secret-0123456789abcdef';
const CRON = 'test-cron-secret-0123456789abcdef';
const LIST = 7;

const db = createSupabaseMock(KEY);
const ext = createIntegrationsMock({ brevoKey: BREVO_KEY, listId: LIST, attributes: ['FIRSTNAME', 'LASTNAME', 'LANGUAGE', 'SUPABASE_ID', 'SOURCE', 'SOURCE_FORM'], airtablePat: PAT, baseId: BASE, subscribersTable: SUBS, unsubscribersTable: UNSUBS });

const ENV = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: KEY,
  PRIVACY_POLICY_VERSION: 'draft-2026-11',
  NEWSLETTER_CONSENT_VERSION: 'radar-draft-2026-11',
  BREVO_API_KEY: BREVO_KEY,
  BREVO_API_BASE: `${MOCK}/brevo`,
  BREVO_LIST_ID: String(LIST),
  BREVO_DOI_TEMPLATE_ID: '11',
  BREVO_WELCOME_TEMPLATE_ID_IT: '21',
  BREVO_WELCOME_TEMPLATE_ID_EN: '22',
  BREVO_WEBHOOK_SECRET: WEBHOOK,
  BREVO_CONTACT_ATTRIBUTES: 'FIRSTNAME,LASTNAME,LANGUAGE,SUPABASE_ID,SOURCE,SOURCE_FORM',
  AIRTABLE_SYNC_PAT: PAT,
  AIRTABLE_SYNC_BASE_ID: BASE,
  AIRTABLE_NEWSLETTER_SUBSCRIBERS_TABLE_ID: SUBS,
  AIRTABLE_NEWSLETTER_UNSUBSCRIBERS_TABLE_ID: UNSUBS,
  AIRTABLE_API_BASE: `${MOCK}/airtable`,
  NEWSLETTER_TOKEN_SECRET: 'test-token-secret-0123456789abcdef-xyz',
  NEWSLETTER_CRON_SECRET: CRON,
  NEWSLETTER_PUBLIC_URL: 'http://localhost:3000',
};

const ORIGIN = 'http://localhost:3000';
let ip = 0;
const post = (route: { POST: (r: Request) => Promise<Response> }, path: string, body: unknown, headers: Record<string, string> = {}) =>
  route.POST(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost:3000', origin: ORIGIN, 'x-forwarded-for': `10.9.${Math.floor(++ip / 250)}.${ip % 250}`, ...headers },
      body: JSON.stringify(body),
    }),
  );
const id = () => crypto.randomUUID();
const EMAIL = 'radar.tester@example.com';
const form = (extra: object = {}) => ({
  firstName: 'Ada',
  lastName: 'Radar',
  email: EMAIL,
  privacy: true,
  newsletter: true,
  locale: 'it',
  requestId: id(),
  origin: { page: '/it', section: 'newsletter', cta: 'newsletter_form' },
  utm: { utm_source: 'test' },
  company_url: '',
  elapsed: 4000,
  ...extra,
});

let newsletter: typeof import('@/app/api/newsletter/route');
let confirmRoute: typeof import('@/app/api/newsletter/confirm/route');
let webhook: typeof import('@/app/api/newsletter/brevo-webhook/route');
let reconcileRoute: typeof import('@/app/api/newsletter/reconcile/route');
let signup: typeof import('@/app/api/signup/route');
const logs: string[] = [];

const sub = () => db.tables.newsletter_subscribers.find((r) => r.email === EMAIL)!;
const events = () => db.tables.newsletter_consent_events.filter((e) => e.subscriber_id === sub()?.id).map((e) => e.event_type);
const confirmUrl = (redirect: string) => new Request(redirect.replace('http://localhost:3000', ORIGIN), { headers: { 'x-forwarded-for': `10.8.0.${++ip % 250}` } });
const hook = (body: unknown, auth = `Bearer ${WEBHOOK}`) => post(webhook, '/api/newsletter/brevo-webhook', body, { authorization: auth });
async function subscribeAndConfirm(extra: object = {}) {
  expect((await post(newsletter, '/api/newsletter', form(extra))).status).toBe(200);
  const redirect = ext.clickConfirmation(EMAIL);
  return confirmRoute.GET(confirmUrl(redirect));
}

beforeAll(async () => {
  for (const k of ['LEAD_WEBHOOK_URL', 'AIRTABLE_LEADS_TOKEN', 'AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_TABLE']) delete process.env[k];
  Object.assign(process.env, ENV);
  for (const level of ['info', 'error', 'warn', 'log'] as const) vi.spyOn(console, level).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' ')));
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(SUPABASE_URL)) return db.handle(new Request(input, init));
    if (url.startsWith(MOCK)) return ext.handle(new Request(input, init));
    throw new Error(`unexpected outbound request: ${url}`);
  });
  vi.resetModules();
  newsletter = await import('@/app/api/newsletter/route');
  confirmRoute = await import('@/app/api/newsletter/confirm/route');
  webhook = await import('@/app/api/newsletter/brevo-webhook/route');
  reconcileRoute = await import('@/app/api/newsletter/reconcile/route');
  signup = await import('@/app/api/signup/route');
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of Object.keys(ENV)) delete process.env[k];
});
beforeEach(() => {
  db.reset();
  ext.reset();
  logs.length = 0;
  Object.assign(process.env, ENV);
});

describe('dedicated form → Supabase PENDING → Brevo double opt-in', () => {
  it('saves the contact PENDING with consent proof and provenance, then starts the double opt-in', async () => {
    const body = form({ email: '  Radar.Tester@Example.com ' });
    const res = await post(newsletter, '/api/newsletter', body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sub()).toMatchObject({
      source: 'ITALIAN RAINFOREST WEBSITE',
      newsletter_name: 'RAINFOREST RADAR',
      source_form: 'NEWSLETTER_SIGNUP',
      locale: 'it',
      first_name: 'Ada',
      last_name: 'Radar',
      newsletter_consent: true,
      newsletter_consent_version: 'radar-draft-2026-11',
      privacy_notice_version: 'draft-2026-11',
      privacy_acknowledged: true,
      subscription_status: 'PENDING',
      double_opt_in_confirmed: false,
      brevo_sync_status: 'SYNCED',
      page_path: '/it',
      page_section: 'newsletter',
      cta: 'newsletter_form',
      utm: { utm_source: 'test' },
    });
    expect(sub().newsletter_consent_at).toBeTruthy();
    const consent = db.tables.newsletter_consent_events.find((e) => e.event_type === 'CONSENT_GIVEN')!;
    expect(consent).toMatchObject({ request_id: body.requestId, consent_text: 'Desidero iscrivermi a RAINFOREST RADAR, la newsletter di Italian Rainforest.', privacy_acknowledged: true, source_form: 'NEWSLETTER_SIGNUP' });
    expect(events()).toEqual(['CONSENT_GIVEN', 'DOI_REQUESTED']);
    const doi = ext.brevo.doiRequests[0]!;
    expect(doi).toMatchObject({ email: EMAIL, includeListIds: [LIST], templateId: 11, attributes: { FIRSTNAME: 'Ada', LASTNAME: 'Radar', LANGUAGE: 'it', SUPABASE_ID: sub().id, SOURCE_FORM: 'NEWSLETTER_SIGNUP' } });
    expect(doi.redirectionUrl).toMatch(/^http:\/\/localhost:3000\/api\/newsletter\/confirm\?l=it&t=[\w-]+\.[\w-]+$/);
    // Not confirmed: no welcome, nothing in Airtable.
    expect(ext.brevo.emails).toEqual([]);
    expect(ext.airtable.records[SUBS]).toEqual([]);
  });

  it('only attributes that exist in Brevo are sent (BREVO_CONTACT_ATTRIBUTES)', async () => {
    process.env.BREVO_CONTACT_ATTRIBUTES = 'FIRSTNAME,LASTNAME';
    await post(newsletter, '/api/newsletter', form());
    expect(Object.keys(ext.brevo.doiRequests[0]!.attributes).sort()).toEqual(['FIRSTNAME', 'LASTNAME']);
  });

  it('both checkboxes are mandatory; server-side validation and anti-bot', async () => {
    for (const b of [form({ privacy: false }), form({ newsletter: false }), form({ firstName: '' }), form({ lastName: undefined }), form({ email: 'nope' }), form({ requestId: 'x' }), form({ locale: 'fr' })]) {
      expect((await post(newsletter, '/api/newsletter', b)).status).toBe(400);
    }
    expect((await post(newsletter, '/api/newsletter', form({ company_url: 'http://bot' }))).status).toBe(200);
    expect((await post(newsletter, '/api/newsletter', form({ elapsed: 200 }))).status).toBe(200);
    expect((await post(newsletter, '/api/newsletter', form(), { origin: 'https://evil.example' })).status).toBe(403);
    expect(db.tables.newsletter_subscribers).toHaveLength(0);
    expect(ext.brevo.doiRequests).toHaveLength(0);
  });

  it('without Brevo configured nothing is stored and no success is shown (503)', async () => {
    delete process.env.BREVO_API_KEY;
    const res = await post(newsletter, '/api/newsletter', form());
    expect(res.status).toBe(503);
    expect(db.tables.newsletter_subscribers).toHaveLength(0);
  });

  it('Brevo refusing the double opt-in: no "check your inbox", consent kept PENDING for the retry', async () => {
    ext.brevo.fail.doi = 3;
    const res = await post(newsletter, '/api/newsletter', form());
    expect(res.status).toBe(503);
    expect(sub()).toMatchObject({ subscription_status: 'PENDING', brevo_sync_status: 'ERROR', brevo_sync_attempts: 1 });
    expect(sub().brevo_sync_error).toMatch(/^503/);
    expect(events()).toEqual(['CONSENT_GIVEN', 'DOI_REQUEST_FAILED']);
  });

  it('the same submission twice (double click / retry) records one consent and sends one double opt-in', async () => {
    const b = form();
    await post(newsletter, '/api/newsletter', b);
    await post(newsletter, '/api/newsletter', b);
    expect(db.tables.newsletter_consent_events.filter((e) => e.event_type === 'CONSENT_GIVEN')).toHaveLength(1);
    expect(ext.brevo.doiRequests).toHaveLength(1);
  });

  it('a PENDING contact asking again right away gets no second email (anti-flooding), same answer', async () => {
    await post(newsletter, '/api/newsletter', form());
    const res = await post(newsletter, '/api/newsletter', form());
    expect(res.status).toBe(200);
    expect(ext.brevo.doiRequests).toHaveLength(1);
    expect(db.tables.newsletter_subscribers).toHaveLength(1);
  });
});

describe('confirmation → SUBSCRIBED → welcome (once) → Airtable ISCRITTI', () => {
  it('confirms only after the click, sends the Italian welcome once, upserts the 17 typed fields', async () => {
    const res = await subscribeAndConfirm();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/it?newsletter=confirmed#newsletter');
    expect(sub()).toMatchObject({ subscription_status: 'SUBSCRIBED', double_opt_in_confirmed: true, brevo_contact_id: 1000, brevo_sync_status: 'SYNCED', airtable_sync_status: 'SYNCED' });
    expect(sub().double_opt_in_confirmed_at).toBeTruthy();
    expect(ext.brevo.emails).toEqual([{ templateId: 21, to: EMAIL, params: { FIRSTNAME: 'Ada' } }]);
    const rec = ext.airtable.records[SUBS]![0]!;
    expect(sub().airtable_subscriber_record_id).toBe(rec.id);
    expect(Object.keys(rec.fields).sort()).toEqual(
      ['SUPABASE ID', 'FIRST NAME', 'LAST NAME', 'EMAIL', 'REGISTRATION DATE', 'SOURCE', 'SOURCE FORM', 'LANGUAGE', 'NEWSLETTER CONSENT', 'CONSENT DATE', 'CONSENT VERSION', 'PRIVACY VERSION', 'DOUBLE OPT-IN', 'DOUBLE OPT-IN CONFIRMATION DATE', 'STATUS', 'BREVO CONTACT ID', 'LAST BREVO SYNC'].sort(),
    );
    expect(rec.fields).toMatchObject({ 'SUPABASE ID': sub().id, 'NEWSLETTER CONSENT': true, 'DOUBLE OPT-IN': true, STATUS: 'SUBSCRIBED', 'BREVO CONTACT ID': '1000', LANGUAGE: 'it', 'SOURCE FORM': 'NEWSLETTER_SIGNUP' });
    expect(rec.fields['REGISTRATION DATE']).toMatch(/Z$/);
    expect(events()).toEqual(['CONSENT_GIVEN', 'DOI_REQUESTED', 'DOI_CLICKED', 'DOI_CONFIRMED', 'WELCOME_SENT']);
    // The link again: already confirmed, no second welcome, no duplicate Airtable record.
    const again = await confirmRoute.GET(confirmUrl(ext.brevo.doiRequests[0]!.redirectionUrl));
    expect(again.headers.get('location')).toBe('/it?newsletter=already#newsletter');
    expect(ext.brevo.emails).toHaveLength(1);
    expect(ext.airtable.records[SUBS]).toHaveLength(1);
  });

  it('English subscribers get the English welcome', async () => {
    await subscribeAndConfirm({ locale: 'en' });
    expect(ext.brevo.emails[0]!.templateId).toBe(22);
  });

  it('a link opened before Brevo lists the contact stays pending; the reconciliation confirms it later', async () => {
    await post(newsletter, '/api/newsletter', form());
    const redirect = ext.brevo.doiRequests[0]!.redirectionUrl;
    const res = await confirmRoute.GET(confirmUrl(redirect)); // not in the Brevo list yet
    expect(res.headers.get('location')).toBe('/it?newsletter=pending#newsletter');
    expect(sub().subscription_status).toBe('PENDING');
    ext.clickConfirmation(EMAIL);
    const r = await reconcileRoute.GET(new Request(`${ORIGIN}/api/newsletter/reconcile`, { headers: { authorization: `Bearer ${CRON}` } }));
    expect((await r.json()).report.confirmed).toBe(1);
    expect(sub().subscription_status).toBe('SUBSCRIBED');
    expect(ext.brevo.emails).toHaveLength(1);
  });

  it('tampered, foreign or expired tokens are refused', async () => {
    await post(newsletter, '/api/newsletter', form());
    const good = ext.brevo.doiRequests[0]!.redirectionUrl;
    const bad = good.replace(/t=([\w-]+)\.([\w-]+)$/, (_m, p, s) => `t=${p}.${s.slice(0, -2)}xx`);
    for (const u of [bad, `${ORIGIN}/api/newsletter/confirm?t=abc`, `${ORIGIN}/api/newsletter/confirm`]) {
      expect((await confirmRoute.GET(confirmUrl(u))).headers.get('location')).toBe('/it?newsletter=invalid#newsletter');
    }
    expect(sub().subscription_status).toBe('PENDING');
  });

  it('a failed welcome is retried by the reconciliation, never sent twice', async () => {
    ext.brevo.fail.smtp = 3;
    await subscribeAndConfirm();
    expect(sub().subscription_status).toBe('SUBSCRIBED');
    expect(ext.brevo.emails).toHaveLength(0);
    expect(sub().welcome_claimed_at).toBeNull();
    const auth = { headers: { authorization: `Bearer ${CRON}` } };
    await reconcileRoute.GET(new Request(`${ORIGIN}/api/newsletter/reconcile`, auth));
    await reconcileRoute.GET(new Request(`${ORIGIN}/api/newsletter/reconcile`, auth));
    expect(ext.brevo.emails).toHaveLength(1);
  });

  it('an already subscribed address submitting the form again: same answer, no email, original consent kept', async () => {
    await subscribeAndConfirm();
    const consentAt = sub().newsletter_consent_at;
    const res = await post(newsletter, '/api/newsletter', form());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(ext.brevo.doiRequests).toHaveLength(1);
    expect(ext.brevo.emails).toHaveLength(1);
    expect(sub().newsletter_consent_at).toBe(consentAt);
    expect(db.tables.newsletter_consent_events.filter((e) => e.event_type === 'CONSENT_GIVEN')).toHaveLength(2);
  });
});

describe('unsubscription (Brevo webhook) → UNSUBSCRIBED → DISISCRITTI, then out of ISCRITTI', () => {
  const unsub = (ts: number, list: number[] = [LIST], eid = 1) => ({ event: 'unsubscribe', email: EMAIL, id: eid, list_id: list, ts, date: '2026-11-26 20:00:00', camp_id: 1 });

  it('authenticates, updates Supabase, writes DISISCRITTI, verifies, then removes from ISCRITTI', async () => {
    await subscribeAndConfirm();
    expect((await hook(unsub(Math.floor(Date.now() / 1000) + 5), 'Bearer wrong')).status).toBe(401);
    expect((await hook(unsub(Math.floor(Date.now() / 1000) + 5), '')).status).toBe(401);
    const ts = Math.floor(Date.now() / 1000) + 5;
    const res = await hook(unsub(ts));
    expect(res.status).toBe(200);
    expect((await res.json()).counts).toEqual({ unsubscribed: 1 });
    expect(sub()).toMatchObject({ subscription_status: 'UNSUBSCRIBED', unsubscribe_channel: 'BREVO', unsubscribe_reason: null, airtable_sync_status: 'SYNCED', airtable_subscriber_record_id: null });
    expect(sub().unsubscribed_at).toBe(new Date(ts * 1000).toISOString());
    expect(ext.airtable.records[SUBS]).toEqual([]);
    const rec = ext.airtable.records[UNSUBS]![0]!;
    expect(rec.fields).toMatchObject({ 'SUPABASE ID': sub().id, STATUS: 'UNSUBSCRIBED', 'UNSUBSCRIBE CHANNEL': 'BREVO', 'BREVO CONTACT ID': '1000', 'UNSUBSCRIBE DATE': new Date(ts * 1000).toISOString() });
    expect(rec.fields['UNSUBSCRIBE REASON']).toBeUndefined(); // never invented
    expect(rec.fields['ORIGINAL CONSENT DATE']).toBe(db.tables.newsletter_consent_events.find((e) => e.event_type === 'CONSENT_GIVEN')!.occurred_at);
    // Duplicate delivery: recognised, nothing changes.
    expect((await (await hook(unsub(ts))).json()).counts).toEqual({ duplicate: 1 });
    expect(ext.airtable.records[UNSUBS]).toHaveLength(1);
  });

  it('a removal from another list (e.g. GOCCE) is ignored', async () => {
    await subscribeAndConfirm();
    expect((await (await hook(unsub(Math.floor(Date.now() / 1000) + 5, [99]))).json()).counts).toEqual({ ignored: 1 });
    expect(sub().subscription_status).toBe('SUBSCRIBED');
  });

  it('an event older than the last status change is stale (out of order) and ignored', async () => {
    await subscribeAndConfirm();
    const res = await hook(unsub(Math.floor(Date.parse(String(sub().status_changed_at)) / 1000) - 3600));
    expect((await res.json()).counts).toEqual({ stale: 1 });
    expect(sub().subscription_status).toBe('SUBSCRIBED');
  });

  it('a missed webhook is caught by the reconciliation (Brevo reports the list unsubscription)', async () => {
    await subscribeAndConfirm();
    const c = ext.brevo.contacts.get(EMAIL)!;
    c.listUnsubscribed = [LIST];
    c.listIds = [];
    const r = await reconcileRoute.GET(new Request(`${ORIGIN}/api/newsletter/reconcile`, { headers: { authorization: `Bearer ${CRON}` } }));
    expect((await r.json()).report.unsubscribedFromBrevo).toBe(1);
    expect(sub().subscription_status).toBe('UNSUBSCRIBED');
    expect(ext.airtable.records[UNSUBS]).toHaveLength(1);
  });
});

describe('no reactivation; voluntary re-subscription needs a new consent and a new double opt-in', () => {
  it('an optional checkbox or a form after unsubscribing never reactivates; only the new confirmation does', async () => {
    await subscribeAndConfirm();
    await hook({ event: 'unsubscribe', email: EMAIL, id: 5, list_id: [LIST], ts: Math.floor(Date.now() / 1000) + 5 });
    const oldLink = ext.brevo.doiRequests[0]!.redirectionUrl;
    // Optional opt-in from a download sign-up: still UNSUBSCRIBED.
    await post(signup, '/api/signup', { firstName: 'Ada', lastName: 'Radar', email: EMAIL, company: '', consent: true, marketing: true, locale: 'it', elapsed: 4000, company_url: '', reason: 'download_csv', entry: 'registration', requestId: id(), origin: { page: '/it', section: 'database', cta: 'dialog_all_csv' } });
    expect(sub().subscription_status).toBe('UNSUBSCRIBED');
    expect(events()).toContain('RESUBSCRIBE_REQUESTED');
    // The OLD confirmation link no longer works (new cycle).
    expect((await confirmRoute.GET(confirmUrl(oldLink))).headers.get('location')).toBe('/it?newsletter=invalid#newsletter');
    expect(sub().subscription_status).toBe('UNSUBSCRIBED');
    // The new double opt-in, confirmed: SUBSCRIBED again, out of DISISCRITTI, back in ISCRITTI, new welcome.
    expect(ext.brevo.doiRequests).toHaveLength(2);
    ext.clickConfirmation(EMAIL);
    const res = await confirmRoute.GET(confirmUrl(ext.brevo.doiRequests[1]!.redirectionUrl));
    expect(res.headers.get('location')).toBe('/it?newsletter=confirmed#newsletter');
    expect(sub().subscription_status).toBe('SUBSCRIBED');
    expect(ext.airtable.records[UNSUBS]).toEqual([]);
    expect(ext.airtable.records[SUBS]).toHaveLength(1);
    expect(ext.brevo.emails).toHaveLength(2);
    // The original consent proof is kept in the history.
    expect(events().filter((e) => e === 'CONSENT_GIVEN')).toHaveLength(1);
  });

  it('a BLOCKED contact gets the same answer but no email and no change', async () => {
    db.tables.newsletter_subscribers.push({ id: id(), email: EMAIL, subscription_status: 'BLOCKED', source_form: 'NEWSLETTER_SIGNUP', status_changed_at: '2026-01-01T00:00:00.000Z' });
    const res = await post(newsletter, '/api/newsletter', form());
    expect(res.status).toBe(200);
    expect(ext.brevo.doiRequests).toHaveLength(0);
    expect(sub().subscription_status).toBe('BLOCKED');
    expect(events()).toEqual(['BLOCKED_ATTEMPT']);
  });
});

describe('other forms, Airtable errors and retries, configuration, secrets', () => {
  it('download sign-up with the optional box: PENDING + double opt-in; later downloads add nothing', async () => {
    const reg = { firstName: 'Ada', lastName: 'Radar', email: EMAIL, company: '', consent: true, marketing: true, locale: 'it', elapsed: 4000, company_url: '', reason: 'download_csv', entry: 'registration', requestId: id(), origin: { page: '/it', section: 'database', cta: 'dialog_all_csv' } };
    expect((await post(signup, '/api/signup', reg)).status).toBe(200);
    expect(sub()).toMatchObject({ source_form: 'DOWNLOAD_REGISTRATION', subscription_status: 'PENDING', privacy_acknowledged: true });
    expect(db.tables.newsletter_consent_events[0]).toMatchObject({ consent_text: 'I would like to subscribe to RAINFOREST RADAR, the Italian Rainforest newsletter (optional).' });
    expect(ext.brevo.doiRequests).toHaveLength(1);
    await post(signup, '/api/signup', { ...reg, entry: 'event', reason: 'map_png', requestId: id(), registrationId: reg.requestId });
    expect(db.tables.newsletter_subscribers).toHaveLength(1);
    expect(ext.brevo.doiRequests).toHaveLength(1);
  });

  it('without Brevo the optional consent is kept PENDING and the double opt-in is sent later by the reconciliation', async () => {
    delete process.env.BREVO_API_KEY;
    await post(signup, '/api/signup', { firstName: 'Ada', lastName: 'Radar', email: EMAIL, company: '', consent: true, marketing: true, locale: 'it', elapsed: 4000, company_url: '', reason: 'embed', embedKind: 'map', entry: 'registration', requestId: id(), origin: { page: '/it', section: 'share_map', cta: 'unlock_button' } });
    expect(sub()).toMatchObject({ subscription_status: 'PENDING', brevo_sync_status: 'PENDING', source_form: 'EMBED_REQUEST' });
    process.env.BREVO_API_KEY = BREVO_KEY;
    const r = await reconcileRoute.GET(new Request(`${ORIGIN}/api/newsletter/reconcile`, { headers: { authorization: `Bearer ${CRON}` } }));
    expect((await r.json()).report.doiSent).toBe(1);
    expect(ext.brevo.doiRequests).toHaveLength(1);
  });

  it('Airtable errors leave the subscription confirmed and are retried', async () => {
    ext.airtable.fail = 2;
    await subscribeAndConfirm();
    expect(sub()).toMatchObject({ subscription_status: 'SUBSCRIBED', airtable_sync_status: 'ERROR', airtable_sync_attempts: 1 });
    db.tables.newsletter_subscribers[0]!.airtable_next_attempt_at = new Date(Date.now() - 1000).toISOString();
    const r = await reconcileRoute.GET(new Request(`${ORIGIN}/api/newsletter/reconcile`, { headers: { authorization: `Bearer ${CRON}` } }));
    expect((await r.json()).report.airtableSynced).toBe(1);
    expect(ext.airtable.records[SUBS]).toHaveLength(1);
  });

  it('a wrong Airtable field type fails loudly (no typecast), the record is not half-written', async () => {
    ext.airtable.schema[SUBS]!['NEWSLETTER CONSENT'] = { type: 'singleLineText' };
    await subscribeAndConfirm();
    expect(sub()).toMatchObject({ airtable_sync_status: 'ERROR' });
    expect(sub().airtable_sync_error).toMatch(/INVALID_VALUE_FOR_COLUMN/);
    expect(ext.airtable.records[SUBS]).toEqual([]);
  });

  it('the sync refuses the read-only Rainmakers OS base and its token', async () => {
    process.env.AIRTABLE_BASE_ID = BASE;
    await subscribeAndConfirm();
    expect(ext.airtable.requests).toEqual([]);
    delete process.env.AIRTABLE_BASE_ID;
  });

  it('reconcile and webhook require their secrets; logs never contain keys or emails', async () => {
    expect((await reconcileRoute.GET(new Request(`${ORIGIN}/api/newsletter/reconcile`))).status).toBe(401);
    expect((await reconcileRoute.GET(new Request(`${ORIGIN}/api/newsletter/reconcile`, { headers: { authorization: 'Bearer nope' } }))).status).toBe(401);
    ext.brevo.fail.doi = 3;
    await post(newsletter, '/api/newsletter', form());
    const all = logs.join('\n');
    for (const secret of [KEY, BREVO_KEY, PAT, WEBHOOK, CRON, ENV.NEWSLETTER_TOKEN_SECRET, EMAIL]) expect(all).not.toContain(secret);
  });
});
