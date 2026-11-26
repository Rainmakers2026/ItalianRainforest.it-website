/**
 * Download formats (CLAUDE.md "Downloads" 7–8, PRD § "Formats and file names"):
 * CSV UTF-8 and XLSX, same publishability, structure, privacy and filtering rules,
 * names Italian_Rainforest_Database[_Filtered]_YYYY-MM-DD.{csv,xlsx} (generation date).
 */
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildPublicDataset, type Lookups, type RawRecord } from '@/lib/data/normalize';
import { buildExport, exportFilename, generationDate, RESERVED_EXPORT_COLUMNS, toCsv } from '@/lib/export';
import { toXlsx } from '@/lib/xlsx';

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

/** All files of a zip container, uncompressed. */
function unzip(zip: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = zip.readUInt32LE(end + 16);
  for (let n = zip.readUInt16LE(end + 10); n > 0; n--) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const nameLen = zip.readUInt16LE(p + 28);
    const extra = zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    const off = zip.readUInt32LE(p + 42);
    const size = zip.readUInt32LE(p + 20);
    const start = off + 30 + zip.readUInt16LE(off + 26) + zip.readUInt16LE(off + 28);
    out.set(name, inflateRawSync(zip.subarray(start, start + size)).toString('utf8'));
    p += 46 + nameLen + extra;
  }
  return out;
}
const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
/** Sheet rows as { columnLetter: text } (only the cells present in the file). */
function sheetRows(xml: string): Record<string, string>[] {
  return [...xml.matchAll(/<row r="\d+">(.*?)<\/row>/g)].map((m) =>
    Object.fromEntries([...m[1]!.matchAll(/<c r="([A-Z]+)\d+"[^>]*><is><t[^>]*>(.*?)<\/t><\/is><\/c>/g)].map((c) => [c[1]!, unxml(c[2]!)])),
  );
}
const letter = (i: number) => String.fromCharCode(65 + i);

describe('file names', () => {
  const at = new Date('2026-11-26T10:00:00Z');
  it('complete and filtered, CSV and XLSX', () => {
    expect(exportFilename('all', 'csv', at)).toBe('Italian_Rainforest_Database_2026-11-26.csv');
    expect(exportFilename('all', 'xlsx', at)).toBe('Italian_Rainforest_Database_2026-11-26.xlsx');
    expect(exportFilename('filtered', 'csv', at)).toBe('Italian_Rainforest_Database_Filtered_2026-11-26.csv');
    expect(exportFilename('filtered', 'xlsx', at)).toBe('Italian_Rainforest_Database_Filtered_2026-11-26.xlsx');
  });
  it('the date is the generation date (Italian time), not the database date', () => {
    expect(generationDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(exportFilename('all', 'csv')).toContain(generationDate());
  });
});

describe('CSV UTF-8', () => {
  it('BOM + CRLF for Excel, master header, accents preserved', () => {
    const f = buildExport(players, schema, new URLSearchParams('scope=all'));
    const csv = toCsv(f.columns, f.rows);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')[0]).toBe('﻿' + schema.join(','));
    expect(Buffer.from(csv, 'utf8').toString('utf8')).toBe(csv);
  });
});

describe('XLSX', () => {
  const f = buildExport(players, schema, new URLSearchParams('scope=filtered&region=lombardia'));
  const files = unzip(toXlsx(f.columns, f.rows));
  const rows = sheetRows(files.get('xl/worksheets/sheet1.xml')!);

  it('is a complete OOXML workbook', () => {
    for (const p of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml'])
      expect(files.has(p), p).toBe(true);
    expect(files.get('xl/worksheets/sheet1.xml')).toMatch(/state="frozen"/);
  });

  it('master header in row 1, one row per filtered player', () => {
    expect(Object.values(rows[0]!)).toEqual(schema);
    expect(rows).toHaveLength(f.rows.length + 1);
  });

  it('same values as the CSV; reserved columns completely empty (no cell at all)', () => {
    for (let r = 0; r < f.rows.length; r++) {
      for (let c = 0; c < schema.length; c++) expect(rows[r + 1]![letter(c)] ?? '').toBe(f.rows[r]![c]);
    }
    for (const col of RESERVED_EXPORT_COLUMNS) {
      const L = letter(schema.indexOf(col));
      expect(rows.slice(1).every((r) => !(L in r))).toBe(true);
    }
  });

  it('text only: no formula, number or date cell, even for "=..." values', () => {
    const x = unzip(toXlsx(['COMPANY NAME', 'MAIN TYPE'], [['=HYPERLINK("http://x")', 'VC'], ['0123', '']]));
    const sheet = x.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).not.toMatch(/<f>|t="n"|t="d"|t="s"/);
    expect(sheetRows(sheet)[1]!.A).toBe('=HYPERLINK("http://x")');
    expect(sheetRows(sheet)[2]!.A).toBe('0123');
  });

  it('an empty result still has the master header', () => {
    const e = unzip(toXlsx(schema, []));
    expect(sheetRows(e.get('xl/worksheets/sheet1.xml')!)).toHaveLength(1);
  });
});
