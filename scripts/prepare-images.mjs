// Prepares the editorial images supplied by Rainmakers. The artwork is NOT changed:
//   1.webp  (Italy with the players)        → public/images/how-italy.webp   (already transparent, copied as is)
//   4.webp  (tree / why)                     → public/images/why-tree.webp    (copied as is; edges blended in CSS)
//   3.webp  (ecosystem diagram, Italian)     → public/images/ecosystem-it.webp
//   2.webp  (ecosystem diagram, English)     → public/images/ecosystem-en.webp
// For the two diagrams only the white background *outside* the artwork is removed
// (flood fill from the borders + colour-to-alpha on anti-aliased edges), so the
// white centre circle and every label stay untouched.
// Usage: node scripts/prepare-images.mjs <dir-with-1..4.webp>
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src) throw new Error('Usage: node scripts/prepare-images.mjs <source-dir>');
const out = new URL('../public/images/', import.meta.url);
await mkdir(out, { recursive: true });

await copyFile(path.join(src, '1.webp'), new URL('how-italy.webp', out));
await copyFile(path.join(src, '4.webp'), new URL('why-tree.webp', out));

async function removeOuterWhite(file, target) {
  const { data, info } = await sharp(await readFile(path.join(src, file)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const isBg = (i) => {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const min = Math.min(r, g, b),
      max = Math.max(r, g, b);
    return min > 150 && max - min < 40; // near-white, low chroma
  };
  // The circular diagram sits on the left: find its bounding box (coloured pixels in the
  // left 70%) and protect everything inside the outer ring — the thin white separators
  // would otherwise let the fill reach the white centre circle.
  let minX = W,
    maxX = 0,
    minY = H,
    maxY = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W * 0.7; x++)
      if (!isBg((y * W + x) * 4)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2,
    radius = Math.min(maxX - minX, maxY - minY) / 2 - 3;
  const protectedPx = (p) => Math.hypot((p % W) - cx, ((p / W) | 0) - cy) < radius;

  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    const i = p * 4;
    if (!isBg(i) || protectedPx(p)) continue;
    seen[p] = 1;
    // Colour-to-alpha against white: pure white → transparent, light anti-aliasing → partial.
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const a = (255 - min) / 255;
    if (a <= 0.004) data[i + 3] = 0;
    else {
      for (let c = 0; c < 3; c++) data[i + c] = Math.round((data[i + c] - 255 * (1 - a)) / a);
      data[i + 3] = Math.round(a * 255);
    }
    const x = p % W,
      y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  const buf = await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toBuffer();
  await writeFile(new URL(target, out), buf);
}

await removeOuterWhite('3.webp', 'ecosystem-it.webp');
await removeOuterWhite('2.webp', 'ecosystem-en.webp');
console.log('images ready');
