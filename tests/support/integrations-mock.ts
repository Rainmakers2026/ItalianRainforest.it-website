/**
 * In-memory stand-ins for Brevo (API v3) and Airtable (Web API) — tests and e2e only, so no
 * email is sent and no Airtable record is written. They enforce what the real services
 * enforce for RAINFOREST RADAR: the API key, the documented request shapes, the Brevo
 * contact attributes that exist, and the Airtable field TYPES of the 17 + 17 fields
 * (typecast off), so a wrong mapping fails the tests.
 *
 *   /brevo/v3/contacts/doubleOptinConfirmation   POST
 *   /brevo/v3/contacts/{email}                   GET
 *   /brevo/v3/smtp/email                         POST
 *   /airtable/v0/{base}/{table}                  PATCH (upsert) · GET (filterByFormula) · DELETE
 *   /airtable/v0/meta/bases/{base}/tables        GET
 */

type Contact = { id: number; email: string; listIds: number[]; listUnsubscribed: number[]; emailBlacklisted: boolean; attributes: Record<string, unknown> };
type Rec = { id: string; createdTime: string; fields: Record<string, unknown> };
type FieldType = 'singleLineText' | 'email' | 'dateTime' | 'singleSelect' | 'checkbox' | 'multilineText';
type FieldDef = { type: FieldType; options?: string[] };

const SOURCE_FORMS = ['NEWSLETTER_SIGNUP', 'DOWNLOAD_REGISTRATION', 'EMBED_REQUEST', 'DATABASE_UPDATE_REQUEST'];
const T: Record<string, FieldDef> = {
  text: { type: 'singleLineText' },
  email: { type: 'email' },
  date: { type: 'dateTime' },
  check: { type: 'checkbox' },
  long: { type: 'multilineText' },
};
export const AIRTABLE_TABLES = {
  subscribers: {
    'SUPABASE ID': T.text!, 'FIRST NAME': T.text!, 'LAST NAME': T.text!, EMAIL: T.email!, 'REGISTRATION DATE': T.date!, SOURCE: T.text!,
    'SOURCE FORM': { type: 'singleSelect', options: SOURCE_FORMS }, LANGUAGE: { type: 'singleSelect', options: ['it', 'en'] }, 'NEWSLETTER CONSENT': T.check!,
    'CONSENT DATE': T.date!, 'CONSENT VERSION': T.text!, 'PRIVACY VERSION': T.text!, 'DOUBLE OPT-IN': T.check!, 'DOUBLE OPT-IN CONFIRMATION DATE': T.date!,
    STATUS: { type: 'singleSelect', options: ['PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED', 'BLOCKED'] }, 'BREVO CONTACT ID': T.text!, 'LAST BREVO SYNC': T.date!,
  } as Record<string, FieldDef>,
  unsubscribers: {
    'SUPABASE ID': T.text!, 'FIRST NAME': T.text!, 'LAST NAME': T.text!, EMAIL: T.email!, 'REGISTRATION DATE': T.date!, SOURCE: T.text!,
    'SOURCE FORM': { type: 'singleSelect', options: SOURCE_FORMS }, LANGUAGE: { type: 'singleSelect', options: ['it', 'en'] }, 'ORIGINAL CONSENT DATE': T.date!,
    'CONSENT VERSION': T.text!, 'PRIVACY VERSION': T.text!, 'UNSUBSCRIBE DATE': T.date!, 'UNSUBSCRIBE CHANNEL': { type: 'singleSelect', options: ['BREVO', 'WEBSITE', 'MANUAL'] },
    'UNSUBSCRIBE REASON': T.long!, STATUS: { type: 'singleSelect', options: ['UNSUBSCRIBED'] }, 'BREVO CONTACT ID': T.text!, 'LAST BREVO SYNC': T.date!,
  } as Record<string, FieldDef>,
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

export function createIntegrationsMock(o: { brevoKey: string; listId: number; attributes: string[]; airtablePat: string; baseId: string; subscribersTable: string; unsubscribersTable: string }) {
  let nextContactId = 1000;
  let nextRec = 0;
  const brevo = {
    contacts: new Map<string, Contact>(),
    doiRequests: [] as { email: string; includeListIds: number[]; templateId: number; redirectionUrl: string; attributes: Record<string, unknown> }[],
    emails: [] as { templateId: number; to: string; params: Record<string, unknown> }[],
    fail: { doi: 0, smtp: 0 },
  };
  const airtable = {
    records: { [o.subscribersTable]: [] as Rec[], [o.unsubscribersTable]: [] as Rec[] } as Record<string, Rec[]>,
    /** Field definitions per table id (tests can degrade a type to simulate the current base). */
    schema: { [o.subscribersTable]: { ...AIRTABLE_TABLES.subscribers }, [o.unsubscribersTable]: { ...AIRTABLE_TABLES.unsubscribers } } as Record<string, Record<string, FieldDef>>,
    fail: 0,
    requests: [] as string[],
  };
  const brevoErr = (status: number, code: string) => Response.json({ code, message: code }, { status });
  const atErr = (status: number, type: string) => Response.json({ error: { type, message: type } }, { status });

  /** Simulates the recipient clicking the confirmation link: Brevo adds the contact to the list. */
  function clickConfirmation(email: string): string {
    const req = [...brevo.doiRequests].reverse().find((r) => r.email === email);
    if (!req) throw new Error('mock: no double opt-in request for this email');
    const c = brevo.contacts.get(email) ?? { id: nextContactId++, email, listIds: [], listUnsubscribed: [], emailBlacklisted: false, attributes: {} };
    c.listIds = [...new Set([...c.listIds, ...req.includeListIds])];
    c.listUnsubscribed = c.listUnsubscribed.filter((l) => !req.includeListIds.includes(l));
    c.emailBlacklisted = false;
    Object.assign(c.attributes, req.attributes);
    brevo.contacts.set(email, c);
    return req.redirectionUrl;
  }

  function checkValue(def: FieldDef | undefined, name: string, v: unknown): string | null {
    if (!def) return `UNKNOWN_FIELD_NAME ${name}`;
    if (v === null || v === undefined) return null;
    switch (def.type) {
      case 'checkbox':
        return typeof v === 'boolean' ? null : `INVALID_VALUE_FOR_COLUMN ${name}`;
      case 'dateTime':
        return typeof v === 'string' && ISO.test(v) ? null : `INVALID_VALUE_FOR_COLUMN ${name}`;
      case 'email':
        return typeof v === 'string' && /^[^\s@]+@[^\s@]+$/.test(v) ? null : `INVALID_VALUE_FOR_COLUMN ${name}`;
      case 'singleSelect':
        return typeof v === 'string' && def.options!.includes(v) ? null : `INVALID_MULTIPLE_CHOICE_OPTIONS ${name}`;
      default:
        return typeof v === 'string' ? null : `INVALID_VALUE_FOR_COLUMN ${name}`;
    }
  }

  async function handleBrevo(req: Request, path: string): Promise<Response> {
    if (req.headers.get('api-key') !== o.brevoKey) return brevoErr(401, 'unauthorized');
    if (req.method === 'POST' && path === '/v3/contacts/doubleOptinConfirmation') {
      if (brevo.fail.doi > 0) return brevo.fail.doi--, brevoErr(503, 'service_unavailable');
      const b = (await req.json()) as (typeof brevo.doiRequests)[number];
      if (typeof b.email !== 'string' || !Array.isArray(b.includeListIds) || !b.includeListIds.length || typeof b.templateId !== 'number' || typeof b.redirectionUrl !== 'string') return brevoErr(400, 'missing_parameter');
      const unknown = Object.keys(b.attributes ?? {}).filter((k) => !o.attributes.includes(k));
      if (unknown.length) return brevoErr(400, 'invalid_parameter');
      brevo.doiRequests.push({ ...b, attributes: b.attributes ?? {} });
      return Response.json({}, { status: 201 });
    }
    const m = /^\/v3\/contacts\/([^/]+)$/.exec(path);
    if (req.method === 'GET' && m) {
      const c = brevo.contacts.get(decodeURIComponent(m[1]!));
      return c ? Response.json({ ...c, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), statistics: {} }) : brevoErr(404, 'document_not_found');
    }
    if (req.method === 'POST' && path === '/v3/smtp/email') {
      if (brevo.fail.smtp > 0) return brevo.fail.smtp--, brevoErr(503, 'service_unavailable');
      const b = (await req.json()) as { templateId?: number; to?: { email: string }[]; params?: Record<string, unknown> };
      if (typeof b.templateId !== 'number' || !b.to?.[0]?.email) return brevoErr(400, 'missing_parameter');
      brevo.emails.push({ templateId: b.templateId, to: b.to[0].email, params: b.params ?? {} });
      return Response.json({ messageId: `<mock-${brevo.emails.length}@relay.mock>` }, { status: 201 });
    }
    return brevoErr(404, 'not_found');
  }

  async function handleAirtable(req: Request, url: URL, path: string): Promise<Response> {
    airtable.requests.push(`${req.method} ${path}`);
    if (req.headers.get('authorization') !== `Bearer ${o.airtablePat}`) return atErr(401, 'AUTHENTICATION_REQUIRED');
    if (req.method === 'GET' && path === `/v0/meta/bases/${o.baseId}/tables`) {
      return Response.json({
        tables: Object.entries(airtable.schema).map(([id, fields]) => ({
          id,
          name: id === o.subscribersTable ? 'ISCRITTI ALLA NEWSLETTER' : 'DISISCRITTI DALLA NEWSLETTER',
          primaryFieldId: 'fld0',
          fields: Object.entries(fields).map(([name, d], i) => ({
            id: `fld${i}`,
            name,
            type: d.type,
            options: d.type === 'singleSelect' ? { choices: d.options!.map((c) => ({ name: c })) } : d.type === 'dateTime' ? { dateFormat: { name: 'european' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Rome' } : undefined,
          })),
        })),
      });
    }
    const m = /^\/v0\/([^/]+)\/([^/]+)$/.exec(path);
    if (!m || m[1] !== o.baseId || !(m[2]! in airtable.records)) return atErr(404, 'NOT_FOUND');
    if (airtable.fail > 0 && req.method !== 'GET') return airtable.fail--, atErr(503, 'SERVICE_UNAVAILABLE');
    const table = m[2]!;
    const rows = airtable.records[table]!;
    if (req.method === 'PATCH') {
      const b = (await req.json()) as { performUpsert?: { fieldsToMergeOn: string[] }; records: { fields: Record<string, unknown> }[]; typecast?: boolean };
      if (b.typecast) return atErr(422, 'TYPECAST_NOT_EXPECTED');
      const merge = b.performUpsert?.fieldsToMergeOn;
      if (!merge || merge.length !== 1 || merge[0] !== 'SUPABASE ID') return atErr(422, 'INVALID_REQUEST_UNKNOWN');
      const out: Rec[] = [];
      for (const r of b.records) {
        for (const [k, v] of Object.entries(r.fields)) {
          const e = checkValue(airtable.schema[table]![k], k, v);
          if (e) return atErr(422, e.split(' ')[0]!);
        }
        const existing = rows.filter((x) => x.fields['SUPABASE ID'] === r.fields['SUPABASE ID']);
        if (existing.length > 1) return atErr(422, 'MULTIPLE_MATCHES');
        const clean = Object.fromEntries(Object.entries(r.fields).filter(([, v]) => v !== null));
        if (existing[0]) {
          for (const [k, v] of Object.entries(r.fields)) v === null ? delete existing[0].fields[k] : (existing[0].fields[k] = v);
          out.push(existing[0]);
        } else {
          const rec = { id: `rec${String(++nextRec).padStart(14, '0')}`, createdTime: new Date().toISOString(), fields: clean };
          rows.push(rec);
          out.push(rec);
        }
      }
      return Response.json({ records: out });
    }
    if (req.method === 'GET') {
      const f = /^\{SUPABASE ID\}='([0-9a-f-]{36})'$/.exec(url.searchParams.get('filterByFormula') ?? '');
      return Response.json({ records: f ? rows.filter((r) => r.fields['SUPABASE ID'] === f[1]).map((r) => ({ id: r.id, fields: { 'SUPABASE ID': r.fields['SUPABASE ID'] } })) : [] });
    }
    if (req.method === 'DELETE') {
      const ids = url.searchParams.getAll('records[]');
      const found = ids.filter((id) => rows.some((r) => r.id === id));
      if (!found.length) return atErr(404, 'NOT_FOUND');
      airtable.records[table] = rows.filter((r) => !ids.includes(r.id));
      return Response.json({ records: found.map((id) => ({ id, deleted: true })) });
    }
    return atErr(405, 'METHOD_NOT_ALLOWED');
  }

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/brevo/')) return handleBrevo(req, url.pathname.slice('/brevo'.length));
    if (url.pathname.startsWith('/airtable/')) return handleAirtable(req, url, url.pathname.slice('/airtable'.length));
    return new Response('not found', { status: 404 });
  }

  const reset = () => {
    nextContactId = 1000;
    nextRec = 0;
    brevo.contacts.clear();
    brevo.doiRequests.length = 0;
    brevo.emails.length = 0;
    brevo.fail.doi = brevo.fail.smtp = 0;
    for (const k of Object.keys(airtable.records)) airtable.records[k] = [];
    airtable.schema = { [o.subscribersTable]: { ...AIRTABLE_TABLES.subscribers }, [o.unsubscribersTable]: { ...AIRTABLE_TABLES.unsubscribers } };
    airtable.fail = 0;
    airtable.requests.length = 0;
  };

  return { brevo, airtable, handle, clickConfirmation, reset };
}
