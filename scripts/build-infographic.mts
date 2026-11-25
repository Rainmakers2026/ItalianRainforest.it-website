// Builds the downloadable Italian Rainforest infographic (high-resolution PNG, IT + EN):
// every enabler of the database, one logo each, grouped in panels by player type and
// by kind of enabler (the Italian Rainforest taxonomy).
//   node scripts/build-infographic.mts
// Run after scripts/import-irf-csv.mjs. Output: public/infographic/italian-rainforest-infografica-{it,en}.png
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CATEGORY_BY_KEY, CATEGORY_FAMILIES, categoryFromSource, type CategoryKey } from '../src/lib/data/taxonomy.ts';
import itDict from '../src/lib/i18n/dictionaries/it.ts';
import enDict from '../src/lib/i18n/dictionaries/en.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
type Logo = { src: string; onLight?: string | null; w: number; h: number; tone: 'light' | 'dark' };
type Rec = { id: string; fields: Record<string, unknown> };

const snap = JSON.parse(await readFile(path.join(root, 'data/snapshot/irf-records.json'), 'utf8')) as { exportDate: string; records: Rec[] };
// The snapshot is the public dataset (startups and inactive organisations already left
// out by the importer): one tile per player, under its single MAIN TYPE.
const players = snap.records
  .map((r) => {
    const mainType = r.fields['MAIN TYPE'] ?? (r.fields['PLAYER TYPE'] as string[] | undefined)?.[0];
    const type = typeof mainType === 'string' ? categoryFromSource(mainType) : null;
    return { name: String(r.fields['COMPANY NAME']), type: type ?? ('unclassified' as CategoryKey), logo: (r.fields.LOGO as Logo | undefined) ?? null };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));

// ---- layout (px) ----
const W = 4200;
const M = 110; // outer margin
const TILE_W = 168;
const TILE_H = 84;
const GAP = 14;
const PAD = 30; // panel inner padding
const HEAD = 70; // panel title band
const PITCH_X = TILE_W + GAP;
const PITCH_Y = TILE_H + GAP;
const INNER = W - M * 2;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type Panel = { key: CategoryKey; items: typeof players; cols: number; x: number; y: number; w: number; h: number; title?: string };
const titleWidth = (p: Panel) => (p.title ?? '').length * 21 + 40;
/** Panel width: its logo columns, but never narrower than its title. */
const panelW = (p: Panel) => Math.max(p.cols * PITCH_X - GAP + PAD * 2, titleWidth(p) + 120);

function layoutFamily(panels: Panel[], top: number): number {
  const maxCols = Math.floor((INNER - PAD * 2 + GAP) / PITCH_X);
  const rows: Panel[][] = [];
  let row: Panel[] = [];
  let used = 0;
  for (const p of panels) {
    const n = p.items.length;
    p.cols = n <= 6 ? n : Math.min(maxCols, n > maxCols * 2 ? maxCols : Math.ceil(Math.sqrt(n * 2.6)));
    const w = panelW(p);
    if (row.length && used + w + 40 > INNER) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(p);
    used += w + 40;
  }
  if (row.length) rows.push(row);
  let y = top;
  for (const r of rows) {
    // Spare width in the row: widen the tallest panels (fewer rows of logos), never pad them.
    const width = () => r.reduce((s, p) => s + panelW(p), 0) + 40 * (r.length - 1);
    for (;;) {
      const tall = r.filter((p) => Math.ceil(p.items.length / p.cols) > 1);
      if (!tall.length) break;
      const p = tall.reduce((a, b) => (Math.ceil(a.items.length / a.cols) >= Math.ceil(b.items.length / b.cols) ? a : b));
      p.cols++;
      if (width() > INNER) {
        p.cols--;
        break;
      }
    }
    // Each panel is as wide and as tall as its logos (plus title): no empty areas inside.
    let x = M;
    let h = 0;
    for (const p of r) {
      p.w = panelW(p);
      p.h = Math.ceil(p.items.length / p.cols) * PITCH_Y - GAP + PAD * 2 + HEAD - 18;
      p.x = x;
      p.y = y;
      x += p.w + 40;
      h = Math.max(h, p.h);
    }
    y += h + 56;
  }
  return y;
}

async function build(locale: 'it' | 'en') {
  const t = locale === 'it' ? itDict : enDict;
  const svg: string[] = [];
  const composites: sharp.OverlayOptions[] = [];
  let y = M + 250;
  const families = CATEGORY_FAMILIES.map((f) => ({ f, keys: f.categories as readonly CategoryKey[] }));
  const allPanels: { family: (typeof families)[number]['f']; panels: Panel[]; top: number }[] = [];
  for (const { f, keys } of families) {
    const panels: Panel[] = keys
      .map((k) => {
        const items = players.filter((p) => p.type === k);
        return { key: k, items, cols: 1, x: 0, y: 0, w: 0, h: 0, title: `${CATEGORY_BY_KEY[k].label[locale]} · ${items.length}` };
      })
      .filter((p) => p.items.length);
    if (!panels.length) continue;
    const top = y + 70;
    y = layoutFamily(panels, top);
    allPanels.push({ family: f, panels, top: top - 70 });
    y += 30;
  }
  const rest = players.filter((p) => p.type === 'other' || p.type === 'unclassified');
  if (rest.length) {
    const panels: Panel[] = [{ key: 'other', items: rest, cols: 1, x: 0, y: 0, w: 0, h: 0, title: `${CATEGORY_BY_KEY.other.label[locale]} · ${rest.length}` }];
    const top = y + 70;
    y = layoutFamily(panels, top);
    allPanels.push({ family: { key: 'other', color: '#6B7690' } as never, panels, top: top - 70 });
  }
  const H = y + 150;

  // Header
  svg.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  svg.push(`<rect x="0" y="0" width="${W}" height="18" fill="#4b61d1"/>`);
  svg.push(`<text x="${M}" y="${M + 110}" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="132" fill="#14304f" letter-spacing="-3">ITALIAN RAINFOREST</text>`);
  svg.push(
    `<text x="${M + 4}" y="${M + 178}" font-family="Arial, Helvetica, sans-serif" font-size="46" fill="#4b5876">${esc(t.infographic.lead)}</text>`,
  );
  for (const { family, panels, top } of allPanels) {
    const label = family.key === 'other' ? t.what.otherGroup : t.what.families[family.key as keyof typeof t.what.families];
    svg.push(`<rect x="${M}" y="${top + 8}" width="14" height="44" rx="4" fill="${family.color}"/>`);
    svg.push(
      `<text x="${M + 34}" y="${top + 46}" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="46" fill="${family.color}" letter-spacing="1">${esc(label.toUpperCase())}</text>`,
    );
    for (const p of panels) {
      const c = CATEGORY_BY_KEY[p.key];
      const title = `${c.label[locale]} · ${p.items.length}`;
      const titleW = title.length * 21 + 40;
      svg.push(`<rect x="${p.x}" y="${p.y + 22}" width="${p.w}" height="${p.h - 22}" rx="40" fill="#ffffff" stroke="${c.color}" stroke-width="7"/>`);
      svg.push(`<rect x="${p.x + 46}" y="${p.y}" width="${titleW}" height="46" fill="#ffffff"/>`);
      svg.push(
        `<text x="${p.x + 66}" y="${p.y + 36}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="38" fill="#14304f">${esc(title)}</text>`,
      );
      const x0 = p.x + PAD + (p.w - (p.cols * PITCH_X - GAP) - PAD * 2) / 2;
      const y0 = p.y + HEAD + 6;
      for (const [i, it] of p.items.entries()) {
        const tx = Math.round(x0 + (i % p.cols) * PITCH_X);
        const ty = Math.round(y0 + Math.floor(i / p.cols) * PITCH_Y);
        // No frame around the logos; pale (white) artwork is recoloured dark navy to read on white.
        const pale = it.logo?.tone === 'light';
        if (it.logo) {
          const buf = await sharp(path.join(root, 'public', (pale && it.logo.onLight) || it.logo.src))
            .resize({ width: TILE_W - 12, height: TILE_H - 8, fit: 'inside' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
            .then(async ({ data, info }) => {
              const png = await sharp(data, { raw: info }).png().toBuffer();
              return { data: png, info };
            });
          composites.push({
            input: buf.data,
            left: tx + Math.round((TILE_W - buf.info.width) / 2),
            top: ty + Math.round((TILE_H - buf.info.height) / 2),
          });
        } else {
          // No logo in the database: the name, in two lines at most.
          const words = it.name.split(/\s+/);
          const lines: string[] = [''];
          for (const w of words) {
            if ((lines[lines.length - 1] + ' ' + w).trim().length > 16 && lines.length < 2) lines.push(w);
            else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
          }
          lines.forEach((l, li) =>
            svg.push(
              `<text x="${tx + TILE_W / 2}" y="${ty + TILE_H / 2 + (li - (lines.length - 1) / 2) * 22 + 7}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="19" fill="#14304f">${esc(l.length > 20 ? l.slice(0, 19) + '…' : l)}</text>`,
            ),
          );
        }
      }
    }
  }
  const date = new Date(snap.exportDate).toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  svg.push(
    `<text x="${M}" y="${H - 60}" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#6b7690">${esc(`italianrainforest.it · ${t.hero.cardUpdated.replace('{date}', date)} · ${t.infographic.note}`)}</text>`,
  );

  const base = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('')}</svg>`)).png().toBuffer();
  const logo = await sharp(path.join(root, 'public/brand/irf-logo-blue.png')).resize({ height: 190 }).toBuffer({ resolveWithObject: true });
  composites.push({ input: logo.data, left: W - M - logo.info.width, top: M - 10 });
  await mkdir(path.join(root, 'public/infographic'), { recursive: true });
  const out = path.join(root, `public/infographic/italian-rainforest-infografica-${locale}.png`);
  const full = await sharp(base).composite(composites).png({ compressionLevel: 9, palette: false }).toBuffer();
  await writeFile(out, full);
  // Printable PDF: the same artwork as one page at 300 dpi.
  const jpeg = await sharp(full).flatten({ background: '#ffffff' }).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toBuffer();
  await writeFile(out.replace(/\.png$/, '.pdf'), pdfWithImage(jpeg, W, H, `Italian Rainforest · ${t.infographic.eyebrow}`));
  console.log(locale, `${W}×${H}`, players.length, 'players');
}

/** Minimal single-page PDF wrapping a JPEG (DCTDecode), page sized at 300 dpi. */
function pdfWithImage(jpeg: Buffer, w: number, h: number, title: string): Buffer {
  const pw = ((w * 72) / 300).toFixed(2);
  const ph = ((h * 72) / 300).toFixed(2);
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  const ascii = title.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '');
  const objs: (string | Buffer)[][] = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`],
    [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream'],
    [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`],
    [`<< /Title (${ascii}) /Producer (Italian Rainforest) >>`],
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets: number[] = [];
  let len = parts[0]!.length;
  objs.forEach((o, i) => {
    offsets.push(len);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), ...o.map((x) => (typeof x === 'string' ? Buffer.from(x, 'latin1') : x)), Buffer.from('\nendobj\n')]);
    parts.push(chunk);
    len += chunk.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${len}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

await build('it');
await build('en');
