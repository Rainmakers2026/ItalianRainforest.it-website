/**
 * Consolidated permanent rules (CLAUDE.md "Public data rules", PRD § "Consolidated rules",
 * update 5/6) — prevail over any earlier instruction:
 *   master: everything preserved (startups included) · public dataset, interface, APIs:
 *   no startups, no reserved fields or values · CSV / XLSX: no startups, reserved headers
 *   present with completely empty cells (the only structural exception) · private by
 *   default for new master columns · CSV / formula injection guards.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildPublicDataset, fieldMap, readFields, RESERVED_FIELDS, type Lookups, type RawRecord } from '@/lib/data/normalize';
import { buildExport, exportTable, neutralizeFormula, PUBLIC_EXPORT_COLUMNS, publicColumnsOnly, RESERVED_EXPORT_COLUMNS, toCsv } from '@/lib/export';
import { toXlsx } from '@/lib/xlsx';

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
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
const sheetXml = (zip: Buffer) => {
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
};

const [header, ...masterRows] = parseCsv(readFileSync('data/source/irf-database.csv', 'utf8').replace(/^﻿/, '')).filter((r) => r.length > 1);
const col = (n: string) => header!.findIndex((h) => h.trim().toUpperCase() === n);
const snapshot = JSON.parse(readFileSync('data/snapshot/irf-records.json', 'utf8')) as { records: RawRecord[] };
const lookups: Lookups = {
  logos: {
    ...(JSON.parse(readFileSync('data/snapshot/logos-scraped.json', 'utf8')) as { logos: Lookups['logos'] }).logos,
    ...(JSON.parse(readFileSync('data/snapshot/logos.json', 'utf8')) as { logos: Lookups['logos'] }).logos,
  },
  geo: JSON.parse(readFileSync('data/snapshot/geocode-cache.json', 'utf8')) as Lookups['geo'],
};
const { players } = buildPublicDataset(snapshot.records, lookups);
const schema = (JSON.parse(readFileSync('data/snapshot/export-schema.json', 'utf8')) as { columns: string[] }).columns;

/** Distinctive reserved values of the master (emails, phone numbers, reference names). */
const reservedValues = new Set<string>();
for (const r of masterRows) {
  for (const e of (r[col('EMAIL')] ?? '').split(/[;,\s]+/)) if (/@.+\./.test(e)) reservedValues.add(e.toLowerCase());
  for (const ph of (r[col('PHONE')] ?? '').split(/;/)) {
    const digits = ph.replace(/\D/g, '');
    if (digits.length >= 8) reservedValues.add(digits);
  }
  for (const ref of (r[col('REFERENCE')] ?? '').split(/;/)) if (ref.trim().length > 8) reservedValues.add(ref.trim().toLowerCase());
}

describe('the Rainmakers OS master is preserved', () => {
  it('still holds every startup and every reserved value (read-only source)', () => {
    expect(masterRows.filter((r) => (r[col('MAIN TYPE')] ?? '').trim().toUpperCase() === 'STARTUP').length).toBeGreaterThan(100);
    expect(reservedValues.size).toBeGreaterThan(100);
  });
});

describe('private by default: new master columns', () => {
  it('the public allowlist is an explicit, approved list (never extended automatically)', () => {
    expect([...PUBLIC_EXPORT_COLUMNS].sort()).toEqual(
      ['ADDRESS', 'CITY', 'COMPANY NAME', 'GOOGLE MAPS LINK', 'INDUSTRY', 'LOGO', 'MAIN TYPE', 'PLAYER TYPE', 'REGION', 'SHORT DESCRIPTION', 'STATUS', 'WEBSITE'].sort(),
    );
    for (const c of RESERVED_EXPORT_COLUMNS) expect(PUBLIC_EXPORT_COLUMNS).not.toContain(c);
  });

  it('a new master column becomes an empty header in CSV and XLSX', () => {
    const cols = [...schema.slice(0, 5), 'NEW PRIVATE FIELD', ...schema.slice(5), 'Another New Column'];
    const f = buildExport(players, cols, new URLSearchParams('scope=all'));
    expect(f.columns).toEqual(cols);
    for (const name of ['NEW PRIVATE FIELD', 'Another New Column']) {
      const i = cols.indexOf(name);
      expect(f.rows.every((r) => r[i] === '')).toBe(true);
    }
    const csvHeader = toCsv(f.columns, f.rows).replace(/^﻿/, '').split('\r\n')[0];
    expect(csvHeader).toBe(cols.join(','));
    expect(sheetXml(toXlsx(f.columns, f.rows))['xl/worksheets/sheet1.xml']).toContain('NEW PRIVATE FIELD');
  });

  it('a live source is read through the allowlist only, never reserved or unknown columns', () => {
    const live = [...schema, 'NEW PRIVATE FIELD'];
    for (const fields of [readFields(null), readFields(live)]) {
      for (const f of fields) expect(RESERVED_FIELDS as readonly string[]).not.toContain(f.toUpperCase());
      expect(fields).not.toContain('NEW PRIVATE FIELD');
    }
    expect(readFields(live)).toContain('COMPANY NAME');
  });

  it('AIRTABLE_FIELD_MAP cannot point a public field at a reserved column', () => {
    const m = fieldMap(JSON.stringify({ description: 'PHONE', website: ' email ', city: 'Secondary Type', name: 'Company' }));
    expect(m.description).toBe('SHORT DESCRIPTION');
    expect(m.website).toBe('WEBSITE');
    expect(m.city).toBe('CITY');
    expect(m.name).toBe('Company');
    expect(Object.values(fieldMap()).map((v) => v.toUpperCase())).not.toContain('EMAIL');
  });
});

describe('CSV / formula injection', () => {
  const payloads = ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\t=x', '\r=x', '  =HYPERLINK("x")', '＝1+1', '=cmd|\' /C calc\'!A0'];

  it('every dangerous cell is neutralised in the CSV', () => {
    for (const p of payloads) expect(neutralizeFormula(p).startsWith("'")).toBe(true);
    expect(neutralizeFormula('Acme Ventures')).toBe('Acme Ventures');
    const csv = toCsv(['COMPANY NAME'], payloads.map((p) => [p]));
    for (const r of parseCsv(csv.replace(/^﻿/, '')).slice(1)) expect(r[0]!.startsWith("'")).toBe(true);
  });

  it('XLSX cells are text only (no formula element, text format, quotePrefix)', () => {
    const x = sheetXml(toXlsx(['COMPANY NAME'], payloads.map((p) => [p])));
    expect(x['xl/worksheets/sheet1.xml']).not.toMatch(/<f[ >]/);
    expect(x['xl/styles.xml']).toMatch(/numFmtId="49"[^>]*quotePrefix="1"/);
  });
});

describe('reserved information is not retrievable from any public surface', () => {
  const csvAll = buildExport(players, schema, new URLSearchParams('scope=all'));

  it('public dataset and API payload: no startup, no reserved key or value', () => {
    const payload = JSON.stringify({ players });
    for (const k of [...RESERVED_FIELDS, 'hasGatedContacts', 'gated']) expect(payload).not.toContain(k);
    const low = payload.toLowerCase();
    expect([...reservedValues].filter((v) => low.includes(v))).toEqual([]);
    expect(players.some((p) => (p.mainType ?? '').trim().toUpperCase() === 'STARTUP')).toBe(false);
  });

  it('CSV and XLSX: reserved headers present, cells completely empty, no reserved value', () => {
    for (const c of RESERVED_EXPORT_COLUMNS) {
      const i = csvAll.columns.indexOf(c);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(csvAll.rows.every((r) => r[i] === '')).toBe(true);
    }
    const text = (toCsv(csvAll.columns, csvAll.rows) + sheetXml(toXlsx(csvAll.columns, csvAll.rows))['xl/worksheets/sheet1.xml']).toLowerCase();
    expect([...reservedValues].filter((v) => text.includes(v))).toEqual([]);
  });

  it('the map PDF list (JSON) carries no reserved header: the exception is for CSV / XLSX only', () => {
    const t = publicColumnsOnly(csvAll.columns, csvAll.rows);
    for (const c of RESERVED_EXPORT_COLUMNS) expect(t.columns).not.toContain(c);
    expect(t.columns).toContain('COMPANY NAME');
    expect(t.rows[0]).toHaveLength(t.columns.length);
  });

  it('APIs return no contact details and no master data', () => {
    const contact = readFileSync('src/app/api/contact-request/route.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(contact).not.toMatch(/contacts|getGatedContacts|EMAIL|REVEAL_GATED/);
    const playersApi = readFileSync('src/app/api/players/route.ts', 'utf8');
    expect(playersApi).toMatch(/players: ds\.players, updatedAt: ds\.updatedAt, hasDemoGeo: ds\.hasDemoGeo/);
    for (const f of files('src/app').filter((n) => /\.(ts|tsx)$/.test(n))) expect(readFileSync(f, 'utf8'), f).not.toMatch(/data\/source|irf-database|getExportColumns\(\)\s*\)/);
  });

  it('public assets contain no reserved header or value', () => {
    for (const f of files('public').filter((n) => /\.(json|csv|txt|js|mjs|html|svg|xml|webmanifest|css)$/i.test(n))) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/SECONDARY TYPE|INFORMATION SOURCE/);
      const low = t.toLowerCase();
      expect([...reservedValues].filter((v) => !/^\d+$/.test(v) && low.includes(v)), f).toEqual([]);
    }
  });
});
