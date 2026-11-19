// Prepares the "Italy network" artwork (a navy blob, already on a transparent
// background) for the floating "Why" visual: trims the empty margin, resizes
// for 2× screens and encodes it as WebP. Output: public/images/why-map.webp.
// Usage: node scripts/prepare-why-map.mjs <source-image>
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const src = process.argv[2];
if (!src) throw new Error('Usage: node scripts/prepare-why-map.mjs <source-image>');
const OUT = fileURLToPath(new URL('../public/images/why-map.webp', import.meta.url));
const OUT_WIDTH = 1200;

const trimmed = await sharp(src).ensureAlpha().trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
const res = await sharp(trimmed.data)
  .resize({ width: OUT_WIDTH, withoutEnlargement: true })
  .webp({ quality: 80, alphaQuality: 90, smartSubsample: true, effort: 6 })
  .toFile(OUT);
console.log('why-map.webp', res.width, '×', res.height, Math.round(res.size / 1024), 'KB', {
  trimmed: [trimmed.info.width, trimmed.info.height],
  offset: [-(trimmed.info.trimOffsetLeft ?? 0), -(trimmed.info.trimOffsetTop ?? 0)],
});
