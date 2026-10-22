// Read-only snapshot of the dataset published by the legacy Italian Rainforest site.
// The legacy page embeds the public Airtable records in its React Server Components payload.
// This script performs a single HTTP GET and never contacts Airtable directly.
import { writeFile, mkdir } from 'node:fs/promises';

const SOURCE = process.env.LEGACY_SOURCE_URL ?? 'https://italian-innovation-map.vercel.app/en';
const OUT = new URL('../data/snapshot/legacy-records.json', import.meta.url);

const res = await fetch(SOURCE, { method: 'GET', headers: { 'user-agent': 'ItalianRainforest-snapshot/2.0' } });
if (!res.ok) throw new Error(`GET ${SOURCE} failed: ${res.status}`);
const html = await res.text();

const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
let flight = '';
for (const m of html.matchAll(re)) flight += JSON.parse(m[1]);

const marker = '{"records":[';
const start = flight.indexOf(marker);
if (start < 0) throw new Error('records payload not found in legacy page');
const arrStart = start + marker.length - 1;

let depth = 0,
  inStr = false,
  esc = false,
  end = -1;
for (let i = arrStart; i < flight.length; i++) {
  const c = flight[i];
  if (inStr) {
    if (esc) esc = false;
    else if (c === '\\') esc = true;
    else if (c === '"') inStr = false;
    continue;
  }
  if (c === '"') inStr = true;
  else if (c === '[' || c === '{') depth++;
  else if (c === ']' || c === '}') {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
const records = JSON.parse(flight.slice(arrStart, end));
const lastUpdate = /"lastUpdate(?:Date)?":"(\d{2}\/\d{2}\/\d{4})"/.exec(flight)?.[1] ?? null;

await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify({ source: SOURCE, fetchedAt: new Date().toISOString(), legacyLastUpdate: lastUpdate, records }, null, 1),
);
console.log(`Saved ${records.length} records (legacy last update: ${lastUpdate ?? 'n/a'})`);
