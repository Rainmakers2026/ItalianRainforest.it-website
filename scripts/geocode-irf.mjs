// Geocodes the imported IRF records with OpenStreetMap Nominatim (1 request/second,
// results cached in data/snapshot/geocode-cache.json so re-runs only ask for new rows).
//   node scripts/geocode-irf.mjs && node scripts/import-irf-csv.mjs
// Precision ladder: address (only when the address agrees with REGION) → city → region.
// Only public organisation addresses are sent; no user data.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snap = JSON.parse(await readFile(path.join(root, 'data/snapshot/irf-records.json'), 'utf8'));
const cachePath = path.join(root, 'data/snapshot/geocode-cache.json');
const queryCachePath = path.join(root, 'data/snapshot/geocode-queries.json');
const cache = existsSync(cachePath) ? JSON.parse(await readFile(cachePath, 'utf8')) : {};
const qcache = existsSync(queryCachePath) ? JSON.parse(await readFile(queryCachePath, 'utf8')) : {};
const UA = 'ItalianRainforest-data-import/2.0 (open data project)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(params) {
  const key = JSON.stringify(params);
  if (key in qcache) return qcache[key];
  const u = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'it', addressdetails: '1', ...params });
  await sleep(1100);
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`https://nominatim.openstreetmap.org/search?${u}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'it' } });
      if (res.ok) break;
    } catch {}
    await sleep(3000);
  }
  const json = res?.ok ? await res.json() : [];
  const hit = json[0] ? { lat: +(+json[0].lat).toFixed(5), lng: +(+json[0].lon).toFixed(5), state: json[0].address?.state ?? null } : null;
  qcache[key] = hit;
  return hit;
}

const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const sameRegion = (hit, region) => !region || !hit?.state || norm(hit.state).includes(norm(region).slice(0, 6)) || norm(region).includes(norm(hit.state).slice(0, 6));

let n = 0;
for (const r of snap.records) {
  const f = r.fields;
  if (!f.REGION) continue;
  const sig = [f.ADDRESS, f['ADDRESS CHECK'], f.CITY, f.REGION].join('|');
  if (cache[r.id]?.sig === sig) continue;
  let hit = null, precision = null;
  if (f.ADDRESS && f['ADDRESS CHECK'] === 'ok') {
    hit = await search({ q: f.ADDRESS.replace(/,?\s*Italy$/i, '') });
    if (hit && sameRegion(hit, f.REGION)) precision = 'address'; else hit = null;
  }
  if (!hit && f.CITY) {
    hit = await search({ city: f.CITY, state: f.REGION });
    if (!hit) hit = await search({ q: `${f.CITY}, ${f.REGION}` });
    if (hit && sameRegion(hit, f.REGION)) precision = 'city'; else hit = null;
  }
  if (!hit) {
    hit = await search({ state: f.REGION });
    precision = hit ? 'region' : null;
  }
  cache[r.id] = { sig, lat: hit?.lat ?? null, lng: hit?.lng ?? null, precision };
  if (++n % 20 === 0) {
    await writeFile(cachePath, JSON.stringify(cache, null, 1));
    await writeFile(queryCachePath, JSON.stringify(qcache));
    console.log(`${n} geocoded…`);
  }
}
await writeFile(cachePath, JSON.stringify(cache, null, 1));
await writeFile(queryCachePath, JSON.stringify(qcache));
const vals = Object.values(cache);
console.log(`done: ${vals.filter((v) => v.precision === 'address').length} address, ${vals.filter((v) => v.precision === 'city').length} city, ${vals.filter((v) => v.precision === 'region').length} region, ${vals.filter((v) => !v.precision).length} none`);
