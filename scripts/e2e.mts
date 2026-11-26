/**
 * End-to-end validation (update 6/6) against the PRODUCTION build (`next build` first):
 * starts `next start`, then checks over real HTTP and in a real (headless) Chrome:
 *   - pages, embeds, Open Graph image, sitemap, APIs and every JS chunk the browser loads:
 *     no startup, no reserved field name or value;
 *   - downloads (the production default: email-gated POST): complete and filtered, CSV and
 *     XLSX, every filter at once, exported rows = filtered results, master structure,
 *     reserved columns empty, CSV ↔ XLSX identical, file names;
 *   - the "Scarica database" dialog: counts, default choice, zero results, real downloads;
 *   - the Rainmakers OS master (data/source) is byte-identical before and after;
 *   - form submissions → Supabase, against a SIMULATED Supabase (tests/support/supabase-mock.ts
 *     served on a local port, fictitious data): every form and gated action lands in its
 *     table with its provenance, no duplicates, no success when the write fails, the
 *     service key never reaches a page, a chunk or the server log. No test lead is sent
 *     to any real system.
 * Any exposure of a startup or of reserved information fails the run (blocking for deploy).
 *
 *   npm run build && npm run test:e2e        (Chrome is needed for the UI part)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { applyFilters, parseFilters } from '../src/lib/filters.ts';
import type { PublicPlayer } from '../src/lib/data/schema.ts';
import en from '../src/lib/i18n/dictionaries/en.ts';
import it from '../src/lib/i18n/dictionaries/it.ts';
import { createIntegrationsMock } from '../tests/support/integrations-mock.ts';
import { createSupabaseMock } from '../tests/support/supabase-mock.ts';

// The map and database explorer is in English on both locales (src/app/[locale]/page.tsx).
const UI = en.database;
const BTN = JSON.stringify(UI.downloadDatabase);
const CONFIRM = JSON.stringify(UI.downloadDialog.confirm.split('{')[0]);

const PORT = Number(process.env.E2E_PORT ?? 3210);
const BASE = `http://localhost:${PORT}`;
const RESERVED = ['REFERENCE', 'INFORMATION SOURCE', 'SECONDARY TYPE', 'PHONE', 'EMAIL'];
const CHROME = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => existsSync(p));

let failures = 0;
let passes = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};
const section = (s: string) => console.log(`\n${s}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** fetch with one retry: an idle keep-alive socket can be closed by the server meanwhile. */
const nativeFetch = globalThis.fetch;
const fetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
  try {
    return await nativeFetch(input, init);
  } catch {
    await wait(200);
    return nativeFetch(input, init);
  }
};

// ---------- helpers ------------------------------------------------------------------
function parseCsv(t: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') (f += '"'), i++;
        else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(f), (f = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(f), rows.push(row), (row = []), (f = '');
    } else f += c;
  }
  if (f || row.length) row.push(f), rows.push(row);
  return rows.filter((r) => r.length > 1);
}
function unzip(zip: Buffer): Record<string, string> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = zip.readUInt32LE(end + 16);
  const out: Record<string, string> = {};
  for (let n = zip.readUInt16LE(end + 10); n > 0; n--) {
    const nameLen = zip.readUInt16LE(p + 28);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    const off = zip.readUInt32LE(p + 42);
    const start = off + 30 + zip.readUInt16LE(off + 26) + zip.readUInt16LE(off + 28);
    out[name] = inflateRawSync(zip.subarray(start, start + zip.readUInt32LE(p + 20))).toString('utf8');
    p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return out;
}
const colIndex = (ref: string) => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const xlsxGrid = (buf: Buffer, width: number) =>
  [...unzip(buf)['xl/worksheets/sheet1.xml']!.matchAll(/<row r="\d+">(.*?)<\/row>/g)].map(([, cells]) => {
    const r = Array<string>(width).fill('');
    for (const [, ref, v] of cells!.matchAll(/<c r="([A-Z]+\d+)"[^>]*><is><t[^>]*>(.*?)<\/t><\/is><\/c>/g)) r[colIndex(ref!)] = unxml(v!);
    return r;
  });
const stripGuard = (v: string) => (/^'[\s\u00A0]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|^'[\t\r\n]/.test(v) ? v.slice(1) : v);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const hashDir = (dir: string) => {
  const h = createHash('sha256');
  const walk = (d: string): string[] => readdirSync(d).sort().flatMap((n) => (statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n)) : [path.join(d, n)]));
  for (const f of walk(dir)) h.update(f).update(readFileSync(f));
  return h.digest('hex');
};

// ---------- master: reserved values and startups (read-only) ---------------------------
const master = parseCsv(readFileSync('data/source/irf-database.csv', 'utf8').replace(/^\uFEFF/, ''));
const mh = master[0]!.map((h) => h.trim().toUpperCase());
const reservedValues = new Set<string>();
const startupNames = new Set<string>();
const enablerNames = new Set<string>();
for (const r of master.slice(1)) {
  for (const e of (r[mh.indexOf('EMAIL')] ?? '').split(/[;,\s]+/)) if (/@.+\./.test(e)) reservedValues.add(e.toLowerCase());
  for (const ref of (r[mh.indexOf('REFERENCE')] ?? '').split(/;/)) if (ref.trim().length > 8) reservedValues.add(ref.trim().toLowerCase());
  for (const ph of (r[mh.indexOf('PHONE')] ?? '').split(/;/)) if (ph.replace(/\D/g, '').length >= 9) reservedValues.add(ph.trim());
  const name = (r[mh.indexOf('COMPANY NAME')] ?? '').trim().toLowerCase();
  if ((r[mh.indexOf('MAIN TYPE')] ?? '').replace(/\s+/g, ' ').trim().toUpperCase() === 'STARTUP') startupNames.add(name);
  else enablerNames.add(name);
}
for (const n of enablerNames) startupNames.delete(n); // same name used by an enabler too
const leaks = (t: string) => {
  const low = t.toLowerCase();
  return [...reservedValues].filter((v) => low.includes(v.toLowerCase()));
};
const reservedNameLeaks = (t: string) => RESERVED.filter((c) => t.includes(`"${c}"`) || t.includes(`'${c}'`) || t.includes(`\`${c}\``));

// ---------- server ---------------------------------------------------------------------
if (!existsSync('.next/BUILD_ID')) {
  console.error('No production build: run `npm run build` first.');
  process.exit(1);
}
const masterHashBefore = hashDir('data/source');

// ---------- simulated Supabase (never the real project) --------------------------------
const MOCK_PORT = PORT + 1;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
const MOCK_KEY = `e2e-fake-service-role-${randomUUID()}`;
const supa = createSupabaseMock(MOCK_KEY);
// Simulated Brevo + Airtable for RAINFOREST RADAR (no email sent, no Airtable write).
const RADAR = {
  brevoKey: `xkeysib-e2e-${randomUUID()}`,
  listId: 7,
  pat: `pat-e2e-${randomUUID()}`,
  baseId: 'appE2ESYNCBASE001',
  subs: 'tblE2ESUBSCRIBE01',
  unsubs: 'tblE2EUNSUBSCRB01',
  webhook: `e2e-webhook-${randomUUID()}`,
  cron: `e2e-cron-${randomUUID()}`,
  token: `e2e-token-secret-${randomUUID()}`,
};
const ext = createIntegrationsMock({ brevoKey: RADAR.brevoKey, listId: RADAR.listId, attributes: ['FIRSTNAME', 'LASTNAME', 'LANGUAGE', 'SUPABASE_ID', 'SOURCE', 'SOURCE_FORM'], airtablePat: RADAR.pat, baseId: RADAR.baseId, subscribersTable: RADAR.subs, unsubscribersTable: RADAR.unsubs });
const mockServer = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(MOCK_URL + req.url, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
    const r = /^\/(brevo|airtable)\//.test(req.url ?? '') ? await ext.handle(request) : await supa.handle(request);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});
await new Promise<void>((r) => mockServer.listen(MOCK_PORT, '127.0.0.1', () => r()));
const tbl = (t: string) => supa.tables[t]!;
/** Request id of the stored sign-up of the "already signed up" browser visitor. */
const REG_ID = randomUUID();

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(PORT),
  // Never send test leads anywhere (no staging base, no webhook): only the local mock.
  AIRTABLE_LEADS_TOKEN: '',
  AIRTABLE_LEADS_BASE_ID: '',
  AIRTABLE_LEADS_TABLE: '',
  LEAD_WEBHOOK_URL: '',
  SUPABASE_URL: MOCK_URL,
  SUPABASE_SERVICE_ROLE_KEY: MOCK_KEY,
  PRIVACY_POLICY_VERSION: 'draft-2026-11',
  NEWSLETTER_CONSENT_VERSION: '',
  BREVO_API_KEY: RADAR.brevoKey,
  BREVO_API_BASE: `${MOCK_URL}/brevo`,
  BREVO_LIST_ID: String(RADAR.listId),
  BREVO_DOI_TEMPLATE_ID: '11',
  BREVO_WELCOME_TEMPLATE_ID_IT: '21',
  BREVO_WELCOME_TEMPLATE_ID_EN: '22',
  BREVO_WEBHOOK_SECRET: RADAR.webhook,
  BREVO_CONTACT_ATTRIBUTES: 'FIRSTNAME,LASTNAME,LANGUAGE,SUPABASE_ID,SOURCE,SOURCE_FORM',
  AIRTABLE_SYNC_PAT: RADAR.pat,
  AIRTABLE_SYNC_BASE_ID: RADAR.baseId,
  AIRTABLE_NEWSLETTER_SUBSCRIBERS_TABLE_ID: RADAR.subs,
  AIRTABLE_NEWSLETTER_UNSUBSCRIBERS_TABLE_ID: RADAR.unsubs,
  AIRTABLE_API_BASE: `${MOCK_URL}/airtable`,
  NEWSLETTER_TOKEN_SECRET: RADAR.token,
  NEWSLETTER_CRON_SECRET: RADAR.cron,
  NEWSLETTER_PUBLIC_URL: BASE,
};
const server: ChildProcess = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout!.on('data', (d) => (serverLog += d));
server.stderr!.on('data', (d) => (serverLog += d));
let chrome: ChildProcess | null = null;
const cleanup = () => {
  server.kill();
  chrome?.kill();
  mockServer.close();
};
/** The service key, the mock URL or the key's variable name must never reach the browser. */
const secretLeaks = (t: string) =>
  [MOCK_KEY, 'SUPABASE_SERVICE_ROLE_KEY', `127.0.0.1:${MOCK_PORT}`, RADAR.brevoKey, RADAR.pat, RADAR.webhook, RADAR.cron, RADAR.token, 'BREVO_API_KEY', 'AIRTABLE_SYNC_PAT'].filter((s) => t.includes(s));
process.on('exit', cleanup);

for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`${BASE}/api/players`)).ok) break;
  } catch {
    /* not up yet */
  }
  await wait(500);
}

/** Each HTTP check is its own client, so the per-client rate limit is not shared with the browser. */
let client = 0;
const nextIp = () => `10.99.${Math.floor(++client / 250)}.${client % 250}`;
const E2E_ORIGIN = { page: '/it', section: 'database', cta: 'e2e_http' };
let downloadsOk = 0;
const post = async (body: object, ip = nextIp()) => {
  const res = await fetch(`${BASE}/api/download`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': ip },
    body: JSON.stringify({ email: 'e2e@example.com', firstName: 'E2E', lastName: 'Test', company: '', consent: true, locale: 'it', company_url: '', elapsed: 5000, requestId: randomUUID(), origin: E2E_ORIGIN, ...body }),
  });
  // The map PDF list ("table") is not a download by itself: the PDF is recorded by the browser.
  if (res.ok && (body as { format?: string }).format !== 'table') downloadsOk++;
  return res;
};
const postForm = (route: string, body: object, ip = nextIp()) =>
  fetch(`${BASE}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': ip }, body: JSON.stringify(body) });

try {
  // ---------- 1. public surfaces ------------------------------------------------------
  section('1. Public surfaces: no startup, no reserved field or value');
  const playersRes = await fetch(`${BASE}/api/players`);
  const playersText = await playersRes.text();
  const { players } = JSON.parse(playersText) as { players: PublicPlayer[] };
  check(playersRes.ok && players.length > 500, `/api/players responds (${players.length} public players)`);
  check(!players.some((p) => (p.mainType ?? '').replace(/\s+/g, ' ').trim().toUpperCase() === 'STARTUP'), 'no MAIN TYPE = STARTUP in the public dataset');
  const leakedStartups = players.filter((p) => startupNames.has(p.name.trim().toLowerCase())).map((p) => p.name);
  check(leakedStartups.length === 0, 'no startup of the master appears among the public players', leakedStartups.slice(0, 5).join(', '));
  check(players.filter((p) => p.mainType === 'VENTURE BUILDER/STARTUP STUDIO').length > 10, `VENTURE BUILDER/STARTUP STUDIO included (${players.filter((p) => p.mainType === 'VENTURE BUILDER/STARTUP STUDIO').length})`);
  check(new Set(players.map((p) => p.name.toLowerCase().replace(/\s+/g, ' ').trim())).size === players.length, 'no duplicate player');
  check(players.every((p) => p.categories.length === 1), 'MAIN TYPE is the only classification (one type per player)');
  check(leaks(playersText).length === 0 && reservedNameLeaks(playersText).length === 0, '/api/players: no reserved name or value', leaks(playersText).slice(0, 3).join(', '));

  const pages = ['/it', '/en', '/it/embed/map', '/it/embed/database', '/en/embed/map', '/sitemap.xml', '/robots.txt', '/it/privacy'];
  const scripts = new Set<string>();
  for (const p of pages) {
    const res = await fetch(BASE + p);
    const html = await res.text();
    check(res.ok, `${p} responds ${res.status}`);
    check(leaks(html).length === 0 && reservedNameLeaks(html).length === 0, `${p}: no reserved name or value in HTML / RSC payload`, [...leaks(html), ...reservedNameLeaks(html)].slice(0, 3).join(', '));
    const leaked = [...startupNames].filter((n) => n.length > 5 && html.toLowerCase().includes(`"name":"${n}"`));
    check(leaked.length === 0, `${p}: no startup in the page payload`, leaked.slice(0, 3).join(', '));
    check(secretLeaks(html).length === 0, `${p}: no Supabase key, URL or key name in the page`, secretLeaks(html).join(', '));
    for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)) scripts.add(src!);
  }
  const og = await fetch(`${BASE}/it/opengraph-image`);
  check(og.ok && (og.headers.get('content-type') ?? '').startsWith('image/'), '/it/opengraph-image renders');
  let chunkLeaks: string[] = [];
  for (const s of scripts) {
    const t = await (await fetch(new URL(s, BASE))).text();
    chunkLeaks = chunkLeaks.concat(leaks(t), reservedNameLeaks(t).map((n) => `${n} in ${s}`), secretLeaks(t).map((n) => `Supabase secret in ${s}`));
  }
  check(scripts.size > 3 && chunkLeaks.length === 0, `JS chunks loaded by the browser (${scripts.size}): no reserved name or value`, chunkLeaks.slice(0, 3).join(', '));
  for (const f of ['/data/source/irf-database.csv', '/irf-database.csv', '/data/snapshot/irf-records.json']) {
    check((await fetch(BASE + f)).status === 404, `master / snapshot not served: ${f}`);
  }
  const contact = await fetch(`${BASE}/api/contact-request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email: 'e2e@example.com', firstName: 'E2E', lastName: 'Test', consent: true, locale: 'it', elapsed: 5000, playerId: players[0]!.id }),
  });
  const contactBody = await contact.text();
  check(!/contacts|phone|reference|@(?!example\.com)/i.test(contactBody) && leaks(contactBody).length === 0, `/api/contact-request returns no contact detail (${contact.status} ${contactBody})`);

  // ---------- 2. downloads over HTTP --------------------------------------------------
  section('2. Downloads (production default: email-gated POST)');
  check((await fetch(`${BASE}/api/download?scope=all`)).status === 405, 'GET without sign-up is refused (405)');
  const schema = (JSON.parse(readFileSync('data/snapshot/export-schema.json', 'utf8')) as { columns: string[] }).columns;
  const combos = ['scope=all', '', 'region=lombardia', 'category=vc,incubator&region=lombardia', 'q=milano&region=lombardia&city=Milano', 'category=venture-builder,startup-studio', 'industry=Fintech&status=unverified', 'q=zzzz-no-match'];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  for (const q of combos) {
    const all = q === 'scope=all';
    const expected = all ? players : applyFilters(players, parseFilters(new URLSearchParams(q)));
    const csvRes = await post({ format: 'csv', query: `${q}&page=3&pageSize=25` });
    const csvBuf = Buffer.from(await csvRes.arrayBuffer());
    const csv = parseCsv(csvBuf.toString('utf8').replace(/^\uFEFF/, ''));
    const xlsxRes = await post({ format: 'xlsx', query: q });
    const xlsx = xlsxGrid(Buffer.from(await xlsxRes.arrayBuffer()), schema.length);
    const label = q || '(no filter)';
    const name = (r: Response) => /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1];
    const stem = all ? 'Italian_Rainforest_Database' : 'Italian_Rainforest_Database_Filtered';
    check(csvRes.ok && xlsxRes.ok, `[${label}] CSV and XLSX respond`);
    check(name(csvRes) === `${stem}_${today}.csv` && name(xlsxRes) === `${stem}_${today}.xlsx`, `[${label}] file names ${name(csvRes)}, ${name(xlsxRes)}`);
    check(csvBuf[0] === 0xef && csvBuf[1] === 0xbb && csvBuf[2] === 0xbf, `[${label}] CSV is UTF-8 with BOM`);
    check(sameJson(csv[0], schema) && sameJson(xlsx[0], schema), `[${label}] header = master schema (${schema.length} columns, same order)`);
    check(csv.length - 1 === expected.length && sameJson(csv.slice(1).map((r) => stripGuard(r[0]!)), expected.map((p) => p.name)), `[${label}] exported rows = filtered results (${expected.length}), no pagination`);
    check(Number(csvRes.headers.get('x-row-count')) === expected.length, `[${label}] x-row-count = ${expected.length}`);
    check(sameJson(xlsx, csv.map((r) => r.map(stripGuard))), `[${label}] CSV and XLSX identical`);
    const emptyReserved = RESERVED.every((c) => csv.slice(1).every((r) => r[schema.indexOf(c)] === ''));
    check(emptyReserved, `[${label}] reserved columns present with completely empty cells`);
    check(!csv.slice(1).some((r) => r[schema.indexOf('MAIN TYPE')]!.trim().toUpperCase() === 'STARTUP'), `[${label}] no STARTUP row`);
    check(leaks(csvBuf.toString('utf8')).length === 0, `[${label}] no reserved value in the file`);
  }
  const fullA = await (await post({ format: 'csv', query: 'scope=all' })).text();
  const fullB = await (await post({ format: 'csv', query: 'scope=filtered' })).text();
  check(fullA === fullB, 'with no filter the complete and filtered files coincide');
  const table = (await (await post({ format: 'table', query: 'region=lombardia' })).json()) as { columns: string[]; rows: string[][] };
  check(RESERVED.every((c) => !table.columns.includes(c)) && leaks(JSON.stringify(table)).length === 0, 'map PDF list (JSON): public columns only');
  const statuses: number[] = [];
  for (let i = 0; i < 22; i++) statuses.push((await post({ format: 'table', query: 'q=zzzz-no-match' }, '10.250.0.1')).status);
  check(statuses.slice(0, 20).every((x) => x === 200) && statuses.slice(20).every((x) => x === 429), 'rate limit: the 21st download in 10 minutes from one client gets 429');
  const dl = tbl('download_registrations');
  check(dl.length === downloadsOk && dl.every((r) => r.entry_type === 'EVENT' && r.privacy_policy_version === 'draft-2026-11'), `every served download recorded once in download_registrations (${dl.length} = ${downloadsOk})`);
  check(new Set(dl.map((r) => r.request_id)).size === dl.length, 'download events: no duplicate request_id');
  const csvAll = dl.find((r) => r.download_scope === 'ALL' && r.file_format === 'CSV');
  check(!!csvAll && csvAll.row_count === players.length && csvAll.request_type === 'DOWNLOAD_CSV', `complete CSV recorded with its exact row count (${String(csvAll?.row_count)})`);

  // ---------- 2b. forms → Supabase over HTTP ------------------------------------------
  section('2b. Form submissions → Supabase (simulated, fictitious data)');
  supa.reset();
  const person = { firstName: 'E2E', lastName: 'Tester', email: 'E2E.Form@Example.com ', company: '', consent: true, company_url: '', elapsed: 5000 };
  const reg = { ...person, locale: 'en', marketing: true, reason: 'download_xlsx', entry: 'registration', requestId: randomUUID(), origin: { page: '/en', section: 'map', cta: 'panel_filtered_xlsx' } };
  check((await postForm('/api/signup', reg)).status === 200 && (await postForm('/api/signup', reg)).status === 200, 'download sign-up (sent twice) answers 200');
  const regRows = tbl('download_registrations');
  check(regRows.length === 1 && regRows[0]!.entry_type === 'REGISTRATION' && regRows[0]!.request_type === 'DOWNLOAD_XLSX' && regRows[0]!.email === 'e2e.form@example.com', 'download sign-up → one REGISTRATION row (retry not duplicated, email normalised)');
  check(regRows[0]!.page_path === '/en' && regRows[0]!.page_section === 'map' && regRows[0]!.cta === 'panel_filtered_xlsx' && regRows[0]!.locale === 'en', 'provenance stored: page, section, CTA, real language');
  const nl = tbl('newsletter_subscribers');
  check(nl.length === 1 && nl[0]!.source_form === 'DOWNLOAD_REGISTRATION' && nl[0]!.subscription_status === 'PENDING', 'explicit newsletter consent → newsletter_subscribers (PENDING)');
  const emb = { ...person, locale: 'it', marketing: false, reason: 'embed', embedKind: 'map', embedLocale: 'it', entry: 'registration', requestId: randomUUID(), origin: { page: '/it', section: 'share_map', cta: 'unlock_button' } };
  check((await postForm('/api/signup', emb)).status === 200, 'embed sign-up answers 200');
  const embEvent = { ...emb, entry: 'event', requestId: randomUUID(), registrationId: emb.requestId, origin: { ...emb.origin, cta: 'copy_button' } };
  check((await postForm('/api/signup', embEvent)).status === 200, 'embed copy event answers 200');
  const sic = tbl('sharing_is_caring_registrations');
  check(sic.length === 2 && sic[0]!.entry_type === 'REGISTRATION' && sic[1]!.entry_type === 'EVENT' && sic[1]!.registration_id === emb.requestId && sic[0]!.embed_kind === 'MAP', 'embed → sharing_is_caring_registrations: registration + event, linked');
  check(tbl('newsletter_subscribers').length === 1, 'no newsletter row without the explicit consent');
  const sug = { email: 'e2e.suggest@example.com', consent: true, marketing: false, locale: 'it', company_url: '', elapsed: 5000, type: 'new', organization: 'E2E Example Hub', website: '', details: 'A fictitious player for the end-to-end test.', requestId: randomUUID(), origin: { page: '/it', section: 'update', cta: 'contact_new' } };
  check((await postForm('/api/suggest', sug)).status === 200, 'suggest an update answers 200');
  const upd = tbl('database_update_requests');
  check(upd.length === 1 && upd[0]!.change_type === 'NEW' && upd[0]!.review_status === 'PENDING' && upd[0]!.cta === 'contact_new' && upd[0]!.website === null, 'suggest → database_update_requests (change type, moderation, provenance)');
  const bot = await postForm('/api/suggest', { ...sug, requestId: randomUUID(), company_url: 'http://spam.example' });
  check(bot.status === 200 && tbl('database_update_requests').length === 1, 'honeypot: fake success, nothing stored');
  check((await postForm('/api/signup', { ...reg, requestId: 'not-a-uuid' })).status === 400, 'invalid payload refused (400)');
  supa.state.failOn = '*';
  const failS = await postForm('/api/signup', { ...reg, requestId: randomUUID() });
  const failU = await postForm('/api/suggest', { ...sug, requestId: randomUUID() });
  const failD = await post({ format: 'csv', query: 'scope=all' });
  check(failS.status === 503 && failU.status === 503 && failD.status === 503 && !failD.headers.get('content-disposition'), 'database unavailable: 503 everywhere, no fake success, no file');
  supa.state.failOn = null;
  check(supa.calls.every((c) => c.status !== 401 && c.status !== 404), 'every Supabase call authenticated with the server key, on known tables');
  const contactCalls = supa.calls.length;
  await postForm('/api/contact-request', { ...person, locale: 'it', playerId: players[0]!.id });
  check(supa.calls.length === contactCalls, '/api/contact-request is not connected to Supabase');

  // ---------- 3. the dialog in a real browser -----------------------------------------
  section('3. "Download database" dialog in headless Chrome (real downloads)');
  if (!CHROME) {
    check(false, 'Chrome not found (set CHROME_PATH)');
  } else {
    const dlDir = path.join(tmpdir(), `irf-e2e-${Date.now()}`);
    mkdirSync(path.join(dlDir, 'profile', 'Default'), { recursive: true });
    // Allow several automatic downloads from the test origin (Chrome asks after the first).
    writeFileSync(path.join(dlDir, 'profile', 'Default', 'Preferences'), JSON.stringify({ profile: { default_content_setting_values: { automatic_downloads: 1 } }, download: { prompt_for_download: false } }));
    chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9334', '--window-size=1280,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${path.join(dlDir, 'profile')}`, 'about:blank']);
    for (let i = 0; i < 40; i++) {
      try {
        if ((await nativeFetch('http://127.0.0.1:9334/json/version')).ok) break;
      } catch {
        await wait(500);
      }
    }
    let ws: WebSocket | null = null;
    let id = 0;
    const pending = new Map<number, (v: unknown) => void>();
    const send = (method: string, params: object = {}) =>
      new Promise<unknown>((r) => {
        const i = ++id;
        pending.set(i, r);
        ws!.send(JSON.stringify({ id: i, method, params }));
      });
    /**
     * Each scenario in a new tab: Chrome allows one automatic download per tab and then
     * asks before "multiple downloads" (a browser rule, not the site's).
     */
    const openTab = async (url: string, signedUp = true) => {
      ws?.close();
      const t = (await (await nativeFetch('http://127.0.0.1:9334/json/new?about:blank', { method: 'PUT' })).json()) as { webSocketDebuggerUrl: string };
      ws = new WebSocket(t.webSocketDebuggerUrl);
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(String(e.data)) as { id?: number; result?: unknown; error?: unknown };
        if (m.id && pending.has(m.id)) pending.get(m.id)!(m.result ?? m.error), pending.delete(m.id);
      });
      await new Promise((r) => ws!.addEventListener('open', r));
      await send('Page.enable');
      await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, eventsEnabled: true });
      // A visitor who already signed up (production default: downloads are email-gated),
      // or a new visitor (no stored profile: the sign-up form opens first).
      await send('Page.addScriptToEvaluateOnNewDocument', {
        source: signedUp
          ? `try { localStorage.setItem('irf-lead-v1', JSON.stringify({ firstName: 'E2E', lastName: 'Test', email: 'e2e@example.com', company: '', registrationId: '${REG_ID}', at: new Date().toISOString() })); } catch {}`
          : `try { localStorage.removeItem('irf-lead-v1'); } catch {}`,
      });
      await send('Page.navigate', { url });
    };
    const js = async <T,>(expr: string): Promise<T> => ((await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })) as { result?: { value?: T } })?.result?.value as T;
    const until = async (expr: string, ms = 20000) => {
      for (let t = 0; t < ms; t += 250) {
        if (await js<boolean>(expr)) return true;
        await wait(250);
      }
      return false;
    };
    const openDialog = async () => {
      await js(`document.querySelector('dialog[open]')?.close()`);
      const ok = await until(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${BTN})`, 30000);
      // Retry the click until the explorer is hydrated and the dialog opens.
      for (let i = 0; ok && i < 20; i++) {
        await js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${BTN}); b.scrollIntoView({ block: 'center' }); b.click(); })()`);
        if (await until(`!!document.querySelector('dialog[open]')`, 1000)) return true;
      }
      return false;
    };
    const radios = () => js<{ value: string; checked: boolean; disabled: boolean }[]>(`[...document.querySelectorAll('dialog[open] input[type=radio]')].map((r) => ({ value: r.value, checked: r.checked, disabled: r.disabled }))`);
    const dialogText = () => js<string>(`document.querySelector('dialog[open]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
    const nf = (n: number) => UI.downloadDialog.players.replace('{n}', new Intl.NumberFormat('en').format(n));
    const download = async (format: 'csv' | 'xlsx') => {
      const before = new Set(readdirSync(dlDir));
      await js(`document.querySelector('dialog[open] input[type=radio][value=${format}]').click()`);
      await wait(200);
      await js(`(() => { window.__dl = []; const f = window.fetch; window.fetch = async (...a) => { const r = await f(...a); window.__dl.push(r.status + ' ' + String(a[0]).slice(0, 80) + ' ' + (a[1]?.body ?? '').slice(0, 200)); return r; }; })()`);
      await js(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim().startsWith(${CONFIRM})).click()`);
      for (let t = 0; t < 30000; t += 250) {
        const f = readdirSync(dlDir).filter((n) => !before.has(n) && /^Italian_Rainforest_.*\.(csv|xlsx)$/.test(n));
        if (f.length) {
          await wait(300);
          return { name: f[0]!, buf: readFileSync(path.join(dlDir, f[0]!)) };
        }
        await wait(250);
      }
      console.log('    download not received; requests:', await js(`JSON.stringify(window.__dl)`), 'files:', readdirSync(dlDir).join(', '));
      return null;
    };
    const rowsOf = (file: { name: string; buf: Buffer }) =>
      file.name.endsWith('.csv') ? parseCsv(file.buf.toString('utf8').replace(/^\uFEFF/, '')) : xlsxGrid(file.buf, schema.length);

    // a) no filter
    supa.reset();
    await openTab(`${BASE}/it#database`);
    check(await openDialog(), `dialog opens from the ${BTN} button`);
    let r = await radios();
    check(r.find((x) => x.value === 'all')?.checked === true, 'no filter: complete database preselected');
    check((await dialogText()).includes(`${nf(players.length)}`), `dialog shows the complete count (${nf(players.length)})`);
    let file = await download('csv');
    check(!!file && file.name === `Italian_Rainforest_Database_${today}.csv` && rowsOf(file).length - 1 === players.length, `complete CSV downloaded: ${file?.name} (${file ? rowsOf(file).length - 1 : 0} rows)`);
    const ev = tbl('download_registrations');
    check(
      ev.length === 1 && ev[0]!.entry_type === 'EVENT' && ev[0]!.registration_id === REG_ID && ev[0]!.request_type === 'DOWNLOAD_BULK' && ev[0]!.row_count === players.length,
      `UI download recorded once as EVENT linked to the sign-up (${ev.length} row)`,
    );
    check(ev[0]?.page_path === '/it' && ev[0]?.page_section === 'database' && ev[0]?.cta === 'dialog_all_csv' && ev[0]?.locale === 'it', `real provenance from the UI: ${ev[0]?.page_path} · ${ev[0]?.page_section} · ${ev[0]?.cta} · ${ev[0]?.locale} (explorer in English)`);

    // b) several filters at once, from the URL
    const q = 'category=vc,incubator&region=lombardia';
    const expected = applyFilters(players, parseFilters(new URLSearchParams(q)));
    await openTab(`${BASE}/it?${q}#database`);
    check(await openDialog(), `dialog opens with filters (${q})`);
    r = await radios();
    check(r.find((x) => x.value === 'filtered')?.checked === true, 'active filters: filtered download preselected');
    check((await dialogText()).includes(`${nf(expected.length)}`), `dialog shows the filtered count (${expected.length})`);
    file = await download('xlsx');
    const grid = file ? rowsOf(file) : [];
    check(
      !!file && file.name === `Italian_Rainforest_Database_Filtered_${today}.xlsx` && grid.length - 1 === expected.length && sameJson(grid.slice(1).map((x) => x[0]), expected.map((p) => p.name)),
      `filtered XLSX downloaded: ${file?.name} (${grid.length - 1} rows = ${expected.length} results on screen)`,
    );
    check(sameJson(grid[0], schema) && RESERVED.every((c) => grid.slice(1).every((x) => x[schema.indexOf(c)] === '')), 'XLSX from the UI: master header, reserved cells empty');

    // c) search typed in the UI, combined with the URL filters
    await openTab(`${BASE}/it?${q}#database`);
    await until(`!!document.querySelector('input[role="combobox"]')`, 30000);
    await js(`(() => { const i = document.querySelector('input[role="combobox"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'milano'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await wait(1500);
    const expectedQ = applyFilters(players, parseFilters(new URLSearchParams(`${q}&q=milano`)));
    check(await openDialog(), 'dialog opens with filters + search');
    check((await dialogText()).includes(`${nf(expectedQ.length)}`), `filters + search: dialog count = ${expectedQ.length}`);
    file = await download('csv');
    check(!!file && rowsOf(file).length - 1 === expectedQ.length, `filters + search CSV: ${file ? rowsOf(file).length - 1 : 0} rows = ${expectedQ.length}`);

    // d) zero results
    await openTab(`${BASE}/it?q=zzzz-no-match#database`);
    check(await openDialog(), 'dialog opens with zero results');
    r = await radios();
    check(r.find((x) => x.value === 'filtered')?.disabled === true && r.find((x) => x.value === 'all')?.checked === true, 'zero results: filtered disabled, complete selected');
    check((await dialogText()).includes(UI.downloadDialog.noResults), 'zero results: explanatory message');

    // e) a NEW visitor on /en: the sign-up form opens first, then the download runs
    supa.reset();
    await openTab(`${BASE}/en#database`, false);
    check(await openDialog(), 'new visitor: download dialog opens');
    await js(`document.querySelector('dialog[open] input[type=radio][value=xlsx]').click()`);
    await wait(200);
    await js(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim().startsWith(${CONFIRM})).click()`);
    const gateOpen = await until(`!!document.querySelector('dialog[open] input[name=firstName]')`, 10000);
    check(gateOpen, 'new visitor: the one-time sign-up form opens');
    if (gateOpen) {
      await wait(1800); // a person takes time to type (anti-bot: < 1.5 s is ignored)
      const before = new Set(readdirSync(dlDir));
      await js(`(() => {
        const f = document.querySelector('dialog[open] input[name=firstName]').form;
        f.querySelector('[name=firstName]').value = 'Gate';
        f.querySelector('[name=lastName]').value = 'Visitor';
        f.querySelector('[name=email]').value = 'gate.visitor@example.com';
        f.querySelector('[name=consent]').click();
        f.querySelector('[name=marketing]').click();
        f.querySelector('button[type=submit]').click();
      })()`);
      let got = '';
      for (let t = 0; t < 30000 && !got; t += 250) {
        got = readdirSync(dlDir).find((n) => !before.has(n) && /^Italian_Rainforest_.*\.xlsx$/.test(n)) ?? '';
        if (!got) await wait(250);
      }
      check(!!got, `after sign-up the file is downloaded (${got})`);
      const g = tbl('download_registrations');
      const regRow = g.find((x) => x.entry_type === 'REGISTRATION');
      const evRow = g.find((x) => x.entry_type === 'EVENT');
      check(g.length === 2 && !!regRow && !!evRow && evRow.registration_id === regRow.request_id, `sign-up → REGISTRATION + download EVENT linked (${g.length} rows)`);
      check(regRow?.locale === 'en' && regRow?.page_path === '/en' && regRow?.page_section === 'database' && regRow?.cta === 'dialog_all_xlsx' && regRow?.request_type === 'DOWNLOAD_BULK', `sign-up provenance: ${regRow?.page_path} · ${regRow?.page_section} · ${regRow?.cta} · ${regRow?.locale}`);
      const n = tbl('newsletter_subscribers');
      check(n.length === 1 && n[0]!.email === 'gate.visitor@example.com' && n[0]!.source_form === 'DOWNLOAD_REGISTRATION', 'newsletter box ticked in the sign-up → newsletter_subscribers');
    }

    // f) "Suggest an update" on /en, opened from the Contact section
    supa.reset();
    await openTab(`${BASE}/en#update`);
    await until(`!!document.querySelector('#update form')`, 30000);
    await wait(2500);
    await js(`(() => {
      const f = document.querySelector('#update form');
      f.querySelector('input[type=radio][value=correction]').click();
      const org = f.querySelector('[name=organization]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(org, 'E2E Example Hub');
      org.dispatchEvent(new Event('input', { bubbles: true }));
      f.querySelector('[name=details]').value = 'The website of this fictitious player changed.';
      f.querySelector('[name=email]').value = 'e2e.update@example.com';
      f.querySelector('[name=consent]').click();
    })()`);
    await wait(300);
    await js(`document.querySelector('#update form button[type=submit]').click()`);
    const stored = await until(`document.querySelector('#update [role=status]') !== null`, 15000);
    const u = tbl('database_update_requests');
    check(stored && u.length === 1, `update form: success shown and one row stored (${u.length})`);
    check(u[0]?.change_type === 'CORRECTION' && u[0]?.organization_name === 'E2E Example Hub' && u[0]?.locale === 'en' && u[0]?.page_section === 'update' && u[0]?.cta === 'update_form', `update form provenance: ${u[0]?.change_type} · ${u[0]?.page_path} · ${u[0]?.cta} · ${u[0]?.locale}`);
    check(tbl('newsletter_subscribers').length === 0, 'update form without newsletter box: no subscriber');

    // h) Regression of the four pre-newsletter fixes (signed-up visitor)
    const mapReadyJs = `!![...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(UI.downloadFiltered)}) && b.offsetParent && !b.disabled)`;
    const openMenuItem = async (item: string) => {
      await js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(UI.downloadFiltered)}) && x.offsetParent); b.scrollIntoView({ block: 'center' }); b.click(); })()`);
      await until(`!!document.querySelector('[role=menu]')`, 3000);
      await js(`[...document.querySelectorAll('[role=menu] [role=menuitem]')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(item)})).click()`);
    };
    const waitFile = async (before: Set<string>, re: RegExp, ms = 45000) => {
      for (let t = 0; t < ms; t += 250) {
        const f = readdirSync(dlDir).find((n) => !before.has(n) && re.test(n) && !n.endsWith('.crdownload'));
        if (f) return f;
        await wait(250);
      }
      return '';
    };
    const pdfEvents = () => tbl('download_registrations').filter((r) => r.request_type === 'MAP_PDF');
    const pngEvents = () => tbl('download_registrations').filter((r) => r.request_type === 'MAP_PNG');
    // Fix 1 — desktop map PDF: one EVENT only once the file exists; none when it cannot be generated.
    supa.reset();
    await openTab(`${BASE}/it?region=lombardia#map`);
    await until(mapReadyJs, 45000);
    await js(`document.querySelector('.maplibregl-canvas')?.scrollIntoView({ block: 'center' })`);
    await wait(6000);
    let before = new Set(readdirSync(dlDir));
    await openMenuItem(UI.formats.mapPdf);
    const pdf = await waitFile(before, /^italian-rainforest-map-.*\.pdf$/);
    await wait(1500);
    const expectedRows = applyFilters(players, parseFilters(new URLSearchParams('region=lombardia'))).length;
    check(!!pdf && pdfEvents().length === 1 && pdfEvents()[0]!.row_count === expectedRows && String(pdfEvents()[0]!.filter_query).includes('region=lombardia'), `fix 1: map PDF downloaded (${pdf}) → one MAP_PDF event with ${String(pdfEvents()[0]?.row_count)} rows = ${expectedRows}`);
    await js(`HTMLCanvasElement.prototype.toBlob = function (cb) { cb(null); }`); // the map image cannot be produced
    const spy = `(() => { window.__req = []; const f = window.__origFetch ?? window.fetch; window.__origFetch = f; window.fetch = async (...a) => { const r = await f(...a); window.__req.push(r.status + ' ' + String(a[0]).replace(location.origin, '').slice(0, 40) + ' ' + (await r.clone().text()).slice(0, 60)); return r; }; })()`;
    await js(spy);
    // No pause on purpose: the "done" timer of the previous download must not hide this error.
    before = new Set(readdirSync(dlDir));
    await openMenuItem(UI.formats.mapPdf);
    await until(`document.querySelector('[data-download-status=error]') !== null`, 15000);
    await wait(1500);
    check(pdfEvents().length === 1 && !(await waitFile(before, /\.pdf$/, 2000)), 'fix 1: map image failure → no MAP_PDF event, no file');
    const statuses = await js<string>(`[...document.querySelectorAll('[data-download-status]')].map((s) => s.dataset.downloadStatus + (s.offsetParent ? ':visible' : ':hidden') + ' ' + s.textContent.trim()).join(' | ')`);
    check(/error:visible/.test(statuses) && statuses.includes(en.download.error), 'fix 1: the error is shown to the visitor', `${statuses} · requests: ${await js<string>(`JSON.stringify(window.__req)`)}`);
    // Fix 2 — compact mobile toolbar: preparing / done / error states visible.
    supa.reset();
    await openTab(`${BASE}/it#map`);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await until(mapReadyJs, 45000);
    await js(`document.querySelector('.maplibregl-canvas')?.scrollIntoView({ block: 'center' })`);
    await wait(6000);
    before = new Set(readdirSync(dlDir));
    await openMenuItem(UI.formats.mapPng);
    const sawBusy = await until(`document.querySelector('[data-download-status=busy]')?.offsetParent !== null && !!document.querySelector('[data-download-status=busy]')`, 8000);
    const png = await waitFile(before, /^italian-rainforest-map-.*\.png$/);
    const done = await until(`(() => { const s = document.querySelector('[data-download-status=done]'); return !!s && !!s.offsetParent && s.textContent.includes(${JSON.stringify(en.download.success)}); })()`, 8000);
    check(sawBusy && done && !!png && pngEvents().length === 1, `fix 2: phone toolbar shows "${en.download.preparing}" then "${en.download.success}" (${png})`);
    await js(`HTMLCanvasElement.prototype.toBlob = function (cb) { cb(null); }`);
    await wait(3800); // the "done" note clears
    await openMenuItem(UI.formats.mapPng);
    const err = await until(`(() => { const s = document.querySelector('[data-download-status=error]'); return !!s && !!s.offsetParent && s.textContent.includes(${JSON.stringify(en.download.error)}); })()`, 15000);
    check(err && pngEvents().length === 1, `fix 2: phone toolbar shows "${en.download.error}"; failed PNG not recorded`);
    await send('Emulation.clearDeviceMetricsOverride');
    // Fix 3 — embed code language = page language (IT / EN), still switchable.
    for (const [loc, other] of [['it', 'en'], ['en', 'it']] as const) {
      supa.reset();
      await openTab(`${BASE}/${loc}#map-embed`);
      await until(`!!document.querySelector('#map-embed textarea')`, 45000);
      const pressed = await js<string>(`[...document.querySelectorAll('#map-embed button[aria-pressed=true]')].map((b) => b.textContent.trim().toLowerCase()).join()`);
      const code = await js<string>(`document.querySelector('#map-embed textarea').value`);
      check(pressed === loc && code.includes(`/${loc}/embed/map`), `fix 3: on /${loc} the embed code defaults to ${loc.toUpperCase()} (${pressed}, ${code.match(/\/(it|en)\/embed\/map/)?.[0]})`);
      await js(`[...document.querySelectorAll('#map-embed button')].find((b) => b.textContent.trim().toLowerCase() === '${other}').click()`);
      await js(spy);
      await wait(300);
      await js(`[...document.querySelectorAll('#map-embed button')].find((b) => b.textContent.trim() === ${JSON.stringify(en.share.copy)}).click()`);
      const copiedOk = await until(`[...document.querySelectorAll('#map-embed button')].some((b) => b.textContent.includes(${JSON.stringify(en.share.copied)}))`, 10000);
      const row = tbl('sharing_is_caring_registrations')[0];
      if (!row) console.log('    embed debug:', copiedOk, await js<string>(`JSON.stringify({ req: window.__req, buttons: [...document.querySelectorAll('#map-embed button')].map((b) => b.textContent.trim()) })`), 'supabase calls:', supa.calls.slice(-3).map((c) => `${c.method} ${c.table} ${c.status}`).join(', '));
      check((await js<string>(`document.querySelector('#map-embed textarea').value`)).includes(`/${other}/embed/map`) && row?.embed_locale === other && row?.locale === loc, `fix 3: switched to ${other.toUpperCase()} on /${loc} → code and event (embed_locale ${String(row?.embed_locale)}, page locale ${String(row?.locale)})`);
    }

    // g) RAINFOREST RADAR form on /en (desktop), then the layout on a phone
    supa.reset();
    ext.reset();
    await openTab(`${BASE}/en#newsletter`, false);
    await until(`!!document.querySelector('#newsletter form [name=firstName]')`, 30000);
    await wait(2500);
    const a11y = await js<{ unlabeled: number; checked: number; required: number }>(`(() => {
      const f = document.querySelector('#newsletter form');
      const inputs = [...f.querySelectorAll('input:not([name=company_url])')];
      return {
        unlabeled: inputs.filter((i) => !(i.labels && i.labels.length)).length,
        checked: [...f.querySelectorAll('input[type=checkbox]')].filter((c) => c.checked).length,
        required: inputs.filter((i) => i.required).length,
      };
    })()`);
    check(a11y.unlabeled === 0 && a11y.checked === 0 && a11y.required === 5, `RADAR form: every field labelled, no checkbox preselected, 5 required (${JSON.stringify(a11y)})`);
    const twoCols = await js<boolean>(`(() => { const s = document.querySelector('#newsletter .container-irf'); const [a, b] = s.children; return b.getBoundingClientRect().left > a.getBoundingClientRect().right - 1; })()`);
    check(twoCols, 'RADAR section: two columns on desktop (text | form)');
    await js(`document.querySelector('#newsletter form button[type=submit]').click()`);
    await wait(300);
    check((await js<number>(`document.querySelectorAll('#newsletter [id$=-err]').length`)) === 5 && tbl('newsletter_subscribers').length === 0, 'RADAR form: empty submit → 5 field errors, nothing sent');
    await js(`(() => {
      const f = document.querySelector('#newsletter form');
      f.querySelector('[name=firstName]').value = 'E2E';
      f.querySelector('[name=lastName]').value = 'Radar';
      f.querySelector('[name=email]').value = 'e2e.radar@example.com';
      f.querySelector('[name=privacy]').click();
      f.querySelector('[name=newsletter]').click();
      f.querySelector('button[type=submit]').click();
    })()`);
    const ok = await until(`document.querySelector('#newsletter [role=status]')?.textContent.includes(${JSON.stringify(en.newsletter.successTitle)})`, 15000);
    const row = tbl('newsletter_subscribers')[0];
    check(ok && ext.brevo.doiRequests.length === 1, `RADAR form (EN): "${en.newsletter.successTitle}" shown after Brevo accepted the double opt-in`);
    check(row?.source_form === 'NEWSLETTER_SIGNUP' && row?.locale === 'en' && row?.subscription_status === 'PENDING' && row?.cta === 'newsletter_form' && row?.page_path === '/en', `RADAR form row: ${row?.source_form} · ${row?.locale} · ${row?.subscription_status} · ${row?.page_path}`);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await openTab(`${BASE}/it#newsletter`, false);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await until(`!!document.querySelector('#newsletter form [name=firstName]')`, 30000);
    await wait(800);
    const stacked = await js<{ stacked: boolean; overflow: boolean }>(`(() => { const s = document.querySelector('#newsletter .container-irf'); const [a, b] = s.children; return { stacked: b.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 1, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 }; })()`);
    check(stacked.stacked && !stacked.overflow, `RADAR section on a phone: stacked, no horizontal scroll (${JSON.stringify(stacked)})`);

    ws!.close();
    chrome.kill();
    await wait(1000);
    try {
      rmSync(dlDir, { recursive: true, force: true });
    } catch {
      /* Chrome may still hold its profile: left in the temp folder */
    }
  }

  // ---------- 4. master integrity -----------------------------------------------------
  // ---------- 5. RAINFOREST RADAR over HTTP (simulated Brevo + Airtable) ----------------
  section('5. RAINFOREST RADAR: double opt-in, welcome, Airtable, unsubscription');
  for (const [p, d] of [['/it', it], ['/en', en]] as const) {
    const html = await (await fetch(BASE + p)).text();
    check(html.includes('id="newsletter"') && html.includes(d.newsletter.headline.replace(/’/g, '’')) && html.includes('#newsletter'), `${p}: RAINFOREST RADAR section, headline and #newsletter links`);
  }
  supa.reset();
  ext.reset();
  const radarEmail = 'e2e.radar.http@example.com';
  const radarForm = { firstName: 'E2E', lastName: 'Radar', email: radarEmail, privacy: true, newsletter: true, locale: 'it', company_url: '', elapsed: 5000, requestId: randomUUID(), origin: { page: '/it', section: 'newsletter', cta: 'newsletter_form' } };
  check((await postForm('/api/newsletter', { ...radarForm, newsletter: false })).status === 400, 'newsletter consent is mandatory in the dedicated form (400)');
  check((await postForm('/api/newsletter', radarForm)).status === 200, 'dedicated form → 200 after Brevo accepted the double opt-in');
  const r0 = tbl('newsletter_subscribers')[0];
  const doi = ext.brevo.doiRequests[0];
  check(r0?.subscription_status === 'PENDING' && r0?.newsletter_name === 'RAINFOREST RADAR' && r0?.source_form === 'NEWSLETTER_SIGNUP', 'Supabase: PENDING, RAINFOREST RADAR, NEWSLETTER_SIGNUP');
  check(!!doi && doi.includeListIds.join() === String(RADAR.listId) && doi.redirectionUrl.startsWith(`${BASE}/api/newsletter/confirm?l=it&t=`), 'Brevo: double opt-in on the RADAR list only, signed confirmation link');
  check(ext.airtable.records[RADAR.subs]!.length === 0 && ext.brevo.emails.length === 0, 'not confirmed yet: no welcome, nothing in Airtable');
  ext.clickConfirmation(radarEmail);
  const conf = await fetch(doi!.redirectionUrl, { redirect: 'manual' });
  check(conf.status === 303 && conf.headers.get('location') === '/it?newsletter=confirmed#newsletter', `confirmation link → ${conf.status} ${conf.headers.get('location')}`);
  const r1 = tbl('newsletter_subscribers')[0];
  check(r1?.subscription_status === 'SUBSCRIBED' && r1?.double_opt_in_confirmed === true && !!r1?.brevo_contact_id, 'Supabase: SUBSCRIBED after the verified confirmation');
  check(ext.brevo.emails.length === 1 && ext.brevo.emails[0]!.templateId === 21, 'Italian welcome email sent once');
  const ar = ext.airtable.records[RADAR.subs]![0];
  check(!!ar && Object.keys(ar.fields).length === 17 && ar.fields['DOUBLE OPT-IN'] === true && ar.fields['BREVO CONTACT ID'] === String(r1?.brevo_contact_id), `Airtable ISCRITTI: 17 typed fields (${ar ? Object.keys(ar.fields).length : 0})`);
  await fetch(doi!.redirectionUrl, { redirect: 'manual' });
  check(ext.brevo.emails.length === 1 && ext.airtable.records[RADAR.subs]!.length === 1, 'link opened again: no second welcome, no duplicate record');
  const hookPost = (body: unknown, auth: string) => fetch(`${BASE}/api/newsletter/brevo-webhook`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(body) });
  const ev = { event: 'unsubscribe', email: radarEmail, id: 42, list_id: [RADAR.listId], ts: Math.floor(Date.now() / 1000) + 2 };
  check((await hookPost(ev, 'Bearer wrong')).status === 401, 'webhook without the right bearer token → 401');
  check((await hookPost(ev, `Bearer ${RADAR.webhook}`)).status === 200, 'authenticated unsubscribe webhook → 200');
  const r2 = tbl('newsletter_subscribers')[0];
  check(r2?.subscription_status === 'UNSUBSCRIBED' && r2?.unsubscribe_channel === 'BREVO', 'Supabase: UNSUBSCRIBED, channel BREVO');
  check(ext.airtable.records[RADAR.unsubs]!.length === 1 && ext.airtable.records[RADAR.subs]!.length === 0, 'Airtable: in DISISCRITTI, removed from ISCRITTI after verification');
  await hookPost(ev, `Bearer ${RADAR.webhook}`);
  check(ext.airtable.records[RADAR.unsubs]!.length === 1 && tbl('newsletter_consent_events').filter((e) => e.event_type === 'UNSUBSCRIBED').length === 1, 'duplicate webhook: no change');
  check((await postForm('/api/newsletter', { ...radarForm, requestId: randomUUID() })).status === 200 && tbl('newsletter_subscribers')[0]?.subscription_status === 'UNSUBSCRIBED', 're-subscription request: still UNSUBSCRIBED until the new double opt-in');
  const rec = await fetch(`${BASE}/api/newsletter/reconcile`, { headers: { authorization: `Bearer ${RADAR.cron}` } });
  check(rec.ok && (await fetch(`${BASE}/api/newsletter/reconcile`)).status === 401, 'reconciliation: runs with the cron secret, 401 without');

  section('4. Rainmakers OS master integrity');
  check(hashDir('data/source') === masterHashBefore, 'data/source byte-identical after the run (never modified)');
  check(secretLeaks(serverLog).filter((s) => s !== 'SUPABASE_SERVICE_ROLE_KEY').length === 0 && !/e2e[.\w]*@example\.com/i.test(serverLog), 'server log: no Supabase key, no submitted email');
} catch (err) {
  check(false, 'unexpected error', (err as Error).stack ?? String(err));
} finally {
  cleanup();
}

if (failures || /Error|⨯/.test(serverLog)) console.log(`\nserver log:\n${serverLog.slice(-3000)}`);
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
