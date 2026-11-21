// Fetches the logo of every player that has a website but no logo, from its own site.
//
//   node scripts/scrape-logos.mjs [--only "Name A,Name B"] [--skip "Name C"] [--sheet out.png]
//
// Candidates, best first: <img>/<svg> marked as logo in the header, schema.org "logo",
// apple-touch-icon / large icons, og:image. The first one that decodes into a usable
// image wins. Results go to data/snapshot/logos-scraped.json (merged by the data layer
// and by import-irf-csv.mjs, never overriding curated logos) and public/logos/players.
// --sheet writes a contact sheet to review the results by eye.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { logoHash, processLogo } from './lib/logo-image.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const list = (s) => new Set((s ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const only = list(arg('--only'));
const skip = list(arg('--skip'));
const sheet = arg('--sheet');

// Websites in the database that are not the organisation's own site (directories,
// search results, a different company): scraping them would publish the wrong logo.
const NOT_OWN_SITE = /google\.[a-z.]+\/search|assolombarda\.it|aecm\.eu|innovationbridge\.info|innoveneto\.org|meta\.com|opstart\.it\/it\/thebestequity|haier-europe\.com\/press-release/i;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
/** Node's fetch first; curl as fallback (some servers reset Node's TLS handshake). */
async function get(url, accept = 'text/html,*/*') {
  try {
    return await nodeGet(url, accept);
  } catch (err) {
    if (/^HTTP [45]\d\d$/.test(err.message) && !/HTTP 429|HTTP 403/.test(err.message)) throw err;
    return curlGet(url, accept);
  }
}
// Git for Windows ships an OpenSSL curl; the system (Schannel) one fails on some servers.
const CURL = [process.env.CURL, 'C:/Program Files/Git/mingw64/bin/curl.exe'].find((p) => p && existsSync(p)) ?? 'curl';
function curlGet(url, accept) {
  return new Promise((resolve, reject) => {
    execFile(
      CURL,
      ['-sSL', '-m', '25', '-H', `Accept: ${accept}`, '-w', '\n%{http_code} %{content_type} %{url_effective}', url],
      { encoding: 'buffer', maxBuffer: 30 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(new Error(`curl: ${err.message.split('\n')[0]}`));
        const cut = stdout.lastIndexOf(10);
        const parts = stdout.subarray(cut + 1).toString().trim().split(' ');
        const [code, final, type] = [parts[0], parts.at(-1), parts.slice(1, -1).join(' ')];
        if (!/^2/.test(code)) return reject(new Error(`HTTP ${code}`));
        resolve({ url: final || url, type: type ?? '', buf: stdout.subarray(0, cut) });
      },
    );
  });
}
async function nodeGet(url, accept) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept, 'accept-language': 'it,en;q=0.8' }, redirect: 'follow', signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { url: r.url, type: r.headers.get('content-type') ?? '', buf: Buffer.from(await r.arrayBuffer()) };
  } finally {
    clearTimeout(t);
  }
}

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(2).find((x) => x != null) ?? null;
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Ranked candidate list: { kind: 'url', url } | { kind: 'svg', svg }. */
function candidates(html, base, name) {
  const out = [];
  // Brand tokens (company name + site host): a logo that names the organisation itself
  // beats one of its portfolio companies or partners shown in the page header.
  const STOP = /^(srl|spa|sgr|the|di|della|del|and|group|italia|italy|www|com|it|eu|net|org|io|capital|ventures?|partners)$/i;
  const tokens = [...new Set(`${name} ${new URL(base).hostname}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.test(w)))];
  const own = (s) => tokens.some((w) => s.toLowerCase().includes(w));
  const add = (score, c) => out.push({ score: score + (c.url && own(c.url.split('?')[0]) ? 30 : 0), ...c });
  const abs = (u) => {
    try {
      return new URL(decode(u.trim()), base).toString();
    } catch {
      return null;
    }
  };
  const headerEnd = (() => {
    const m = html.search(/<\/header>/i);
    return m > 0 ? m : Math.min(html.length, 60000);
  })();
  // 1. <img> mentioning "logo" (class, id, alt, src) — inside the header ranks higher.
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = attr(tag, 'src') ?? attr(tag, 'data-src') ?? attr(tag, 'data-lazy-src') ?? attr(tag, 'srcset')?.split(/[ ,]/)[0];
    if (!src || (src.startsWith('data:') && src.length < 300)) continue; // lazy-load placeholders
    const hay = `${attr(tag, 'class') ?? ''} ${attr(tag, 'id') ?? ''} ${attr(tag, 'alt') ?? ''} ${src}`.toLowerCase();
    // Context: the enclosing element often carries the "logo" class (<a class="logo"><img>).
    const before = html.slice(Math.max(0, m.index - 300), m.index).toLowerCase();
    const near = /logo|brand|navbar-brand|site-title/.test(before.slice(-200));
    if (!/logo|brand/.test(hay) && !near) continue;
    if (/partner|client|sponsor|footer|payment|cookie|flag|award|badge|certif/.test(hay)) continue;
    // "<other-company>-logo.png": a portfolio or partner logo, not the organisation's own.
    const file = (src.split('?')[0].split('/').pop() ?? '').toLowerCase();
    const prefix = file.match(/^([a-z0-9]+)[-_ ]?logo/)?.[1];
    if (prefix && !own(prefix) && !/^(site|main|header|brand|default|custom|white|black|dark|light|colou?r(ed)?|new|small|big|retina|mobile)$/.test(prefix)) continue;
    const u = abs(src);
    if (u) add((m.index < headerEnd ? 100 : 60) + (/logo/.test(hay) ? 10 : 0) + (own(hay) ? 15 : 0) - m.index / 1e6, { kind: 'url', url: u });
  }
  // 2. Inline <svg> marked as logo.
  // Scanned from every "<svg" (not one regex pass): an unclosed sprite earlier in the
  // page must not swallow the logo.
  for (const start of html.matchAll(/<svg\b/gi)) {
    const at = start.index;
    const end = html.indexOf('</svg>', at);
    if (end < 0) continue;
    let svg = html.slice(at, end + 6);
    const open = svg.slice(0, svg.indexOf('>') + 1).toLowerCase();
    const before = html.slice(Math.max(0, at - 200), at).toLowerCase();
    if (!/logo/.test(open) && !/logo|brand/.test(before)) continue;
    if (svg.length < 400) continue; // icons (hamburger, search) are tiny
    if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    add((at < headerEnd ? (/logo/.test(before) ? 112 : 95) : 50) - at / 1e6, { kind: 'svg', svg });
  }
  // 3. schema.org logo.
  for (const m of html.matchAll(/"logo"\s*:\s*(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/gi)) {
    const u = abs(m[1].replace(/\\\//g, '/'));
    if (u) add(80, { kind: 'url', url: u });
  }
  // 4. Large icons, then og:image (often a banner: last resort).
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(m[0], 'rel') ?? '').toLowerCase();
    const href = attr(m[0], 'href');
    if (!href) continue;
    const sizes = Number((attr(m[0], 'sizes') ?? '').split('x')[0]) || 0;
    if (rel.includes('apple-touch-icon')) add(40, { kind: 'url', url: abs(href) });
    else if (rel.includes('icon') && (sizes >= 120 || /\.svg/i.test(href))) add(35, { kind: 'url', url: abs(href) });
  }
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const p = (attr(m[0], 'property') ?? attr(m[0], 'name') ?? '').toLowerCase();
    if (p === 'og:image' || p === 'og:logo') {
      const u = abs(attr(m[0], 'content') ?? '');
      if (u && /logo/i.test(u)) add(70, { kind: 'url', url: u });
      else if (u) add(20, { kind: 'url', url: u });
    }
  }
  const seen = new Set();
  return out
    .filter((c) => (c.kind === 'svg' ? true : c.url && !seen.has(c.url) && seen.add(c.url)))
    .sort((a, b) => b.score - a.score);
}

/** Decodes a candidate; rejects images that are too small, too square-ish banners, etc. */
async function load(c) {
  let buf;
  if (c.kind === 'svg') buf = Buffer.from(c.svg);
  else {
    const r = await get(c.url, 'image/avif,image/webp,image/svg+xml,image/*,*/*');
    if (/text\/html/.test(r.type)) throw new Error('html');
    buf = r.buf;
  }
  const meta = await sharp(buf, { density: 300 }).metadata();
  if (!meta.width || !meta.height) throw new Error('undecodable');
  if (Math.max(meta.width, meta.height) < 48) throw new Error('too small');
  const ratio = meta.width / meta.height;
  if (c.score < 30 && ratio > 1.6 && meta.width > 900) throw new Error('banner'); // og:image photo/banner
  return buf;
}

// ---------- run ----------
const records = JSON.parse(await readFile(path.join(root, 'data/snapshot/irf-records.json'), 'utf8')).records;
const curated = JSON.parse(await readFile(path.join(root, 'data/snapshot/logos.json'), 'utf8')).logos;
const outPath = path.join(root, 'data/snapshot/logos-scraped.json');
const scraped = existsSync(outPath) ? JSON.parse(await readFile(outPath, 'utf8')).logos : {};
const outDir = path.join(root, 'public/logos/players');
await mkdir(outDir, { recursive: true });

const todo = records.filter((r) => {
  const name = r.fields['COMPANY NAME'].toLowerCase();
  if (only.size) return only.has(name);
  return !curated[r.id] && !scraped[r.id] && r.fields.WEBSITE && !skip.has(name) && !NOT_OWN_SITE.test(r.fields.WEBSITE);
});
console.log(`${todo.length} players to scrape`);
const done = [];
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (todo.length) {
      const r = todo.shift();
      const name = r.fields['COMPANY NAME'];
      let site = r.fields.WEBSITE.trim();
      if (!/^https?:/i.test(site)) site = `https://${site}`;
      try {
        const page = await get(site);
        const cs = candidates(page.buf.toString('utf8'), page.url, name);
        let hit = null;
        for (const c of cs.slice(0, 8)) {
          try {
            const buf = await load(c);
            hit = { buf, from: c.kind === 'svg' ? 'inline svg' : c.url };
            break;
          } catch {
            /* next candidate */
          }
        }
        if (!hit) throw new Error(`no usable logo (${cs.length} candidates)`);
        // Rasterise SVGs before hashing/processing so tone detection sees real pixels.
        const raster = await sharp(hit.buf, { density: 300 }).resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        const entry = await processLogo(raster, outDir, logoHash(raster));
        scraped[r.id] = { ...entry, scrapedFrom: hit.from };
        done.push({ name, file: path.join(outDir, path.basename(entry.src)), tone: entry.tone });
        console.log(`ok   ${name}  ←  ${hit.from}`);
      } catch (err) {
        console.log(`miss ${name}  (${site}): ${err.message}`);
      }
    }
  }),
);
await writeFile(
  outPath,
  JSON.stringify({ _about: "Player logos scraped from the players' websites, keyed by record id. Generated by scripts/scrape-logos.mjs; review before publishing.", logos: scraped }, null, 1),
);
console.log(`${done.length} logos scraped → data/snapshot/logos-scraped.json`);

if (sheet && done.length) {
  // Contact sheet: logo on white (and on navy for light artwork) with the name beneath.
  const W = 260,
    H = 150,
    cols = 5;
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const tiles = await Promise.all(
    done
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (d, i) => {
        const logo = await sharp(d.file).resize({ width: W - 30, height: H - 50, fit: 'inside' }).png().toBuffer();
        const lm = await sharp(logo).metadata();
        const bg = d.tone === 'light' ? '#1b3a5c' : '#ffffff';
        const label = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${bg}" stroke="#ccc"/><text x="${W / 2}" y="${H - 12}" font-family="Arial" font-size="13" text-anchor="middle" fill="${d.tone === 'light' ? '#fff' : '#333'}">${esc(d.name.slice(0, 34))}</text></svg>`,
        );
        const tile = await sharp(label)
          .composite([{ input: logo, left: Math.round((W - lm.width) / 2), top: Math.round((H - 30 - lm.height) / 2) }])
          .png()
          .toBuffer();
        return { input: tile, left: (i % cols) * W, top: Math.floor(i / cols) * H };
      }),
  );
  await sharp({ create: { width: cols * W, height: Math.ceil(done.length / cols) * H, channels: 3, background: '#eee' } })
    .composite(tiles)
    .png()
    .toFile(sheet);
  console.log(`contact sheet → ${sheet}`);
}
