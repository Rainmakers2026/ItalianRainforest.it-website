/**
 * Integration tests (update 6/6): the real route handlers of the public APIs, on the real
 * data provider, called with real `Request` objects.
 *   - snapshot source: /api/download (GET + POST, CSV / XLSX / map list), /api/players,
 *     /api/contact-request — complete vs filtered, exact counts, no pagination, master
 *     structure, reserved columns empty, no reserved data, CSV ↔ XLSX consistency;
 *   - live source (Airtable, simulated with a stubbed fetch): a Rainmakers OS update with
 *     new startups, new columns, reserved values and duplicates — the rules still hold.
 */
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PublicPlayer } from '@/lib/data/schema';
import { applyFilters, parseFilters } from '@/lib/filters';

vi.mock('server-only', () => ({}));

// ---------- helpers ----------------------------------------------------------------
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
  return rows;
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
const unescapeXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
/** The sheet as a grid (missing cells = ''), from the inline-string cells. */
function sheetGrid(xml: string, width: number): string[][] {
  return [...xml.matchAll(/<row r="\d+">(.*?)<\/row>/g)].map(([, cells]) => {
    const r = Array<string>(width).fill('');
    for (const [, ref, v] of cells!.matchAll(/<c r="([A-Z]+\d+)"[^>]*><is><t[^>]*>(.*?)<\/t><\/is><\/c>/g)) r[colIndex(ref!)] = unescapeXml(v!);
    return r;
  });
}
const csvRows = (t: string) => parseCsv(t.replace(/^﻿/, '')).filter((r) => r.length > 1);

const ORIGIN = 'http://localhost:3000';
const get = (q: string) => new Request(`${ORIGIN}/api/download?${q}`, { headers: { 'x-forwarded-for': `10.0.${Math.random()}` } });
const post = (body: object, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/download`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'localhost:3000', origin: ORIGIN, 'x-forwarded-for': `10.1.${Math.random()}`, ...headers },
    body: JSON.stringify(body),
  });
const lead = {
  consent: true,
  locale: 'it',
  elapsed: 3000,
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'Lead',
  company: '',
  get requestId() {
    return crypto.randomUUID();
  },
  origin: { page: '/it', section: 'database', cta: 'dialog_all_csv' },
};

const RESERVED = ['REFERENCE', 'INFORMATION SOURCE', 'SECONDARY TYPE', 'PHONE', 'EMAIL'];
const schema = (JSON.parse(readFileSync('data/snapshot/export-schema.json', 'utf8')) as { columns: string[] }).columns;

/** Reserved values of the master (emails, phones, references): must appear nowhere. */
const masterRows = csvRows(readFileSync('data/source/irf-database.csv', 'utf8'));
const mHeader = masterRows[0]!.map((h) => h.trim().toUpperCase());
const reservedValues = new Set<string>();
for (const r of masterRows.slice(1)) {
  for (const e of (r[mHeader.indexOf('EMAIL')] ?? '').split(/[;,\s]+/)) if (/@.+\./.test(e)) reservedValues.add(e.toLowerCase());
  for (const ref of (r[mHeader.indexOf('REFERENCE')] ?? '').split(/;/)) if (ref.trim().length > 8) reservedValues.add(ref.trim().toLowerCase());
}
const leaks = (text: string) => [...reservedValues].filter((v) => text.toLowerCase().includes(v));

// ---------- snapshot source (the default) ---------------------------------------------
describe('public APIs on the snapshot source (route handlers)', () => {
  let download: typeof import('@/app/api/download/route');
  let playersApi: typeof import('@/app/api/players/route');
  let contact: typeof import('@/app/api/contact-request/route');
  let players: PublicPlayer[];

  beforeAll(async () => {
    for (const k of ['AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_TABLE', 'LEAD_WEBHOOK_URL', 'AIRTABLE_LEADS_TOKEN']) delete process.env[k];
    process.env.DOWNLOAD_REQUIRES_EMAIL = 'false';
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.resetModules();
    download = await import('@/app/api/download/route');
    playersApi = await import('@/app/api/players/route');
    contact = await import('@/app/api/contact-request/route');
    players = ((await (await playersApi.GET()).json()) as { players: PublicPlayer[] }).players;
  });
  afterAll(() => vi.restoreAllMocks());

  it('/api/players: public players only, no startup, no reserved key or value, no duplicate', async () => {
    const res = await playersApi.GET();
    const text = await res.clone().text();
    expect(players.length).toBeGreaterThan(500);
    expect(players.some((p) => (p.mainType ?? '').trim().toUpperCase() === 'STARTUP')).toBe(false);
    for (const k of [...RESERVED, 'hasGatedContacts', 'gated']) expect(text).not.toContain(k);
    // No reserved key in any player object (free-text descriptions may use the words).
    const keys = new Set(players.flatMap((p) => [...Object.keys(p), ...Object.keys(p.location ?? {})]).map((k) => k.toLowerCase()));
    for (const k of ['reference', 'informationsource', 'secondarytype', 'phone', 'email', 'contacts']) expect(keys.has(k)).toBe(false);
    expect(leaks(text)).toEqual([]);
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length);
    expect(new Set(players.map((p) => p.name.toLowerCase().replace(/\s+/g, ' ').trim())).size).toBe(players.length);
    // MAIN TYPE is the only classification: one category per player.
    expect(players.every((p) => p.categories.length === 1 && !!p.mainType)).toBe(true);
    // Publishable VENTURE BUILDER/STARTUP STUDIO players are included.
    expect(players.filter((p) => p.mainType === 'VENTURE BUILDER/STARTUP STUDIO').length).toBeGreaterThan(10);
  });

  it('complete download (GET scope=all): every public player, master structure, CSV filename', async () => {
    const res = await download.GET(get('scope=all&format=csv'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('x-export-scope')).toBe('all');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="Italian_Rainforest_Database_\d{4}-\d{2}-\d{2}\.csv"$/);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM (Excel)
    const text = bytes.toString('utf8');
    expect(text).toContain('\r\n');
    const [header, ...rows] = csvRows(text);
    expect(header).toEqual(schema);
    expect(rows).toHaveLength(players.length);
    expect(Number(res.headers.get('x-row-count'))).toBe(players.length);
    expect(new Set(rows.map((r) => r[0])).size).toBe(rows.length);
    for (const c of RESERVED) {
      const i = header!.indexOf(c);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(rows.every((r) => r[i] === '')).toBe(true);
    }
    expect(rows.some((r) => r[header!.indexOf('MAIN TYPE')]!.trim().toUpperCase() === 'STARTUP')).toBe(false);
    expect(leaks(text)).toEqual([]);
  });

  const combos = [
    'region=lombardia',
    'category=vc',
    'q=milano',
    'region=lombardia&city=Milano',
    'category=vc,incubator&region=lombardia',
    'category=incubator&region=lombardia&q=milano&status=unverified',
    'category=venture-builder,startup-studio',
    'industry=Fintech',
    'q=zzzz-no-match',
  ];

  it.each(combos)('filtered download = filtered results, all filters at once, no pagination (%s)', async (q) => {
    const expected = applyFilters(players, parseFilters(new URLSearchParams(q)));
    // Pagination parameters of the table are ignored by the export.
    const res = await download.GET(get(`${q}&scope=filtered&format=csv&page=2&pageSize=10`));
    expect(res.headers.get('x-export-scope')).toBe('filtered');
    expect(res.headers.get('content-disposition')).toMatch(/Italian_Rainforest_Database_Filtered_\d{4}-\d{2}-\d{2}\.csv/);
    const [header, ...rows] = csvRows(await res.text());
    expect(header).toEqual(schema);
    expect(rows.map((r) => r[0])).toEqual(expected.map((p) => p.name.replace(/^[\s ]*[=+\-@＝＋－＠]/, "'$&")));
    expect(Number(res.headers.get('x-row-count'))).toBe(expected.length);
  });

  it('zero results never fall back to the complete database', async () => {
    const res = await download.GET(get('q=zzzz-no-match&format=xlsx'));
    expect(res.headers.get('x-row-count')).toBe('0');
    const grid = sheetGrid(unzip(Buffer.from(await res.arrayBuffer()))['xl/worksheets/sheet1.xml']!, schema.length);
    expect(grid).toEqual([schema]);
  });

  it('with no filter the two modes coincide', async () => {
    const a = await (await download.GET(get('scope=all'))).text();
    const b = await (await download.GET(get('scope=filtered'))).text();
    expect(b).toBe(a);
  });

  it('CSV and XLSX carry exactly the same table (same rows, columns, values, empty reserved cells)', async () => {
    for (const q of ['scope=all', 'region=lombardia&category=vc,incubator']) {
      const csv = csvRows(await (await download.GET(get(`${q}&format=csv`))).text());
      const res = await download.GET(get(`${q}&format=xlsx`));
      expect(res.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers.get('content-disposition')).toMatch(/\.xlsx"$/);
      const parts = unzip(Buffer.from(await res.arrayBuffer()));
      const grid = sheetGrid(parts['xl/worksheets/sheet1.xml']!, schema.length);
      // The CSV adds an apostrophe to formula-like cells; the XLSX keeps them as text.
      expect(grid).toEqual(csv.map((r) => r.map((v) => (/^'[\s ]*[=+\-@＝＋－＠]|^'[\t\r\n]/.test(v) ? v.slice(1) : v))));
    }
  });

  it('XLSX metadata: only the workbook parts, no document properties, no formula, fixed dates', async () => {
    const buf = Buffer.from(await (await download.GET(get('scope=all&format=xlsx'))).arrayBuffer());
    const parts = unzip(buf);
    expect(Object.keys(parts).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'].sort(),
    );
    const all = Object.values(parts).join('\n');
    expect(all).not.toMatch(/<f[ >]|docProps|dc:creator|<comment|definedName/);
    expect(leaks(all)).toEqual([]);
    // Every zip entry has the fixed DOS date 1980-01-01 (no build-time metadata).
    for (let p = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])); p >= 0; p = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), p + 4)) {
      expect(buf.readUInt16LE(p + 10)).toBe(0);
      expect(buf.readUInt16LE(p + 12)).toBe(33);
    }
  });

  it('POST (email-gated download) returns the same file as GET', async () => {
    const q = 'region=lombardia&category=vc';
    const res = await download.POST(post({ ...lead, format: 'csv', query: q }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(await (await download.GET(get(`${q}&format=csv`))).text());
    expect((await download.POST(post({ ...lead, format: 'json', query: q }))).status).toBe(400);
    expect((await download.POST(post({ ...lead, format: 'csv', query: q }, { origin: 'https://evil.example' }))).status).toBe(403);
  });

  it('GET is refused when the download requires an email', async () => {
    process.env.DOWNLOAD_REQUIRES_EMAIL = 'true';
    try {
      expect((await download.GET(get('scope=all'))).status).toBe(405);
    } finally {
      process.env.DOWNLOAD_REQUIRES_EMAIL = 'false';
    }
  });

  it('the map PDF list (JSON) has the public columns only: no reserved header', async () => {
    const res = await download.GET(get('region=lombardia&format=table'));
    const t = (await res.json()) as { columns: string[]; rows: string[][] };
    for (const c of RESERVED) expect(t.columns).not.toContain(c);
    expect(t.rows).toHaveLength(applyFilters(players, parseFilters(new URLSearchParams('region=lombardia'))).length);
    expect(leaks(JSON.stringify(t))).toEqual([]);
  });

  it('/api/contact-request records the request and returns no contact detail', async () => {
    const req = new Request(`${ORIGIN}/api/contact-request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost:3000', origin: ORIGIN, 'x-forwarded-for': '10.2.0.1' },
      body: JSON.stringify({ consent: true, locale: 'it', elapsed: 3000, email: 'test@example.com', firstName: 'Ada', lastName: 'Rossi', message: 'Vorrei un contatto', playerId: players[0]!.id }),
    });
    const res = await contact.POST(req);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(body)).toEqual({ ok: true });
    expect(body).not.toMatch(/contacts|phone|reference/i);
    expect(leaks(body)).toEqual([]);
  });
});

// ---------- live source: a Rainmakers OS update ---------------------------------------
describe('rules persist after a Rainmakers OS update (live Airtable source, stubbed)', () => {
  const NEW_COLUMNS = ['COMPANY NAME', 'WEBSITE', 'REFERENCE', 'SHORT DESCRIPTION', 'INFORMATION SOURCE', 'MAIN TYPE', 'SECONDARY TYPE', 'ADDRESS', 'REGION', 'CITY', 'EMAIL', 'PHONE', 'INDUSTRY', 'STATUS', 'GOOGLE MAPS LINK', 'LOGO', 'BOARD NOTES', 'REVENUE 2026'];
  const SECRET = { REFERENCE: 'Mario Segreto', 'INFORMATION SOURCE': 'fonte-riservata-xyz', 'SECONDARY TYPE': 'STARTUP', PHONE: '+39 02 9999 8888', EMAIL: 'segreto@riservato.it', 'BOARD NOTES': 'nota-privata-123', 'REVENUE 2026': '9.876.543' };
  const rec = (id: string, name: string, mainType: string, extra: Record<string, unknown> = {}) => ({
    id,
    createdTime: '2026-11-26T00:00:00.000Z',
    fields: { 'COMPANY NAME': name, WEBSITE: `https://${id}.example`, 'MAIN TYPE': mainType, REGION: 'Lombardia', CITY: 'Milano', STATUS: 'ACTIVE', 'SHORT DESCRIPTION': `${name} description`, ...SECRET, ...extra },
  });
  const records = [
    rec('recA', 'Alpha Ventures', 'VC'),
    rec('recB', 'Beta Startup', 'STARTUP'),
    rec('recC', 'Gamma Srl', '  startup '),
    rec('recD', 'Delta Studio', 'VENTURE BUILDER/STARTUP STUDIO'),
    rec('recE', 'Epsilon Bank', 'BANCHE PER STARTUP'),
    rec('recF', 'Alpha Ventures', 'VC'), // duplicate of recA
    rec('recG', '=HYPERLINK("http://evil.example","x")', 'VC'),
    rec('recH', 'Eta Incubator', 'INCUBATOR/ACCELERATOR', { CITY: 'Roma', REGION: 'Lazio' }),
    rec('recI', 'Theta Closed', 'VC', { STATUS: 'INACTIVE' }),
  ];
  const requested: string[] = [];
  let download: typeof import('@/app/api/download/route');
  let playersApi: typeof import('@/app/api/players/route');

  beforeAll(async () => {
    Object.assign(process.env, { AIRTABLE_TOKEN: 'test-token', AIRTABLE_BASE_ID: 'appTEST', AIRTABLE_TABLE: 'Rainmakers OS', DOWNLOAD_REQUIRES_EMAIL: 'false' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      requested.push(url);
      if ((init?.method ?? 'GET') !== 'GET') throw new Error('write attempted');
      if (url.includes('/meta/bases/')) return Response.json({ tables: [{ id: 'tblX', name: 'Rainmakers OS', fields: NEW_COLUMNS.map((name) => ({ name })) }] });
      // A misbehaving source that returns every column, reserved ones included.
      return Response.json({ records });
    });
    vi.resetModules();
    download = await import('@/app/api/download/route');
    playersApi = await import('@/app/api/players/route');
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const k of ['AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_TABLE']) delete process.env[k];
  });

  it('only allowlisted fields are requested from the source (read-only GET)', async () => {
    await playersApi.GET();
    const list = requested.filter((u) => !u.includes('/meta/'));
    expect(list.length).toBeGreaterThan(0);
    const fields = new URL(list[0]!).searchParams.getAll('fields[]').map((f) => f.toUpperCase());
    expect(fields).toContain('COMPANY NAME');
    for (const f of [...RESERVED, 'BOARD NOTES', 'REVENUE 2026']) expect(fields).not.toContain(f);
  });

  it('public dataset: startups (exact, any case/spaces) and inactive dropped, enablers kept, no duplicate, no secret', async () => {
    const res = await playersApi.GET();
    const text = await res.clone().text();
    const { players } = (await res.json()) as { players: PublicPlayer[] };
    expect(players.map((p) => p.name).sort()).toEqual(['=HYPERLINK("http://evil.example","x")', 'Alpha Ventures', 'Delta Studio', 'Epsilon Bank', 'Eta Incubator'].sort());
    for (const v of Object.values(SECRET).filter((v) => v !== 'STARTUP')) expect(text).not.toContain(v);
    for (const k of [...RESERVED, 'BOARD NOTES', 'REVENUE 2026']) expect(text).not.toContain(k);
  });

  it('files follow the updated master: new headers present and empty, reserved empty, injection neutralised', async () => {
    const csv = await (await download.GET(get('scope=all&format=csv'))).text();
    const [header, ...rows] = csvRows(csv);
    expect(header).toEqual(NEW_COLUMNS);
    expect(rows).toHaveLength(5);
    for (const c of [...RESERVED, 'BOARD NOTES', 'REVENUE 2026']) {
      const i = header!.indexOf(c);
      expect(rows.every((r) => r[i] === '')).toBe(true);
    }
    for (const v of Object.values(SECRET).filter((v) => v !== 'STARTUP')) expect(csv).not.toContain(v);
    expect(rows.some((r) => r[0] === `'=HYPERLINK("http://evil.example","x")`)).toBe(true);
    expect(rows.map((r) => r[header!.indexOf('MAIN TYPE')])).not.toContain('STARTUP');

    const parts = unzip(Buffer.from(await (await download.GET(get('scope=all&format=xlsx'))).arrayBuffer()));
    const grid = sheetGrid(parts['xl/worksheets/sheet1.xml']!, NEW_COLUMNS.length);
    expect(grid[0]).toEqual(NEW_COLUMNS);
    expect(grid).toHaveLength(6);
    expect(parts['xl/worksheets/sheet1.xml']).not.toMatch(/<f[ >]/);
    for (const v of Object.values(SECRET).filter((v) => v !== 'STARTUP')) expect(Object.values(parts).join()).not.toContain(v);
  });

  it('filtered download on the live source honours every filter', async () => {
    const [, ...rows] = csvRows(await (await download.GET(get('region=lombardia&category=vc&format=csv'))).text());
    expect(rows.map((r) => r[0]).sort()).toEqual(["'=HYPERLINK(\"http://evil.example\",\"x\")", 'Alpha Ventures'].sort());
  });
});
