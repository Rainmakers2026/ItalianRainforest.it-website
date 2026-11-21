// Shared logo pipeline (import + scrape): trim, resize to max 640 px, WebP, tone detection
// and — for white/pale artwork — a navy variant that reads on white backgrounds.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/** Content hash used as the public file name (identical images are stored once). */
export const logoHash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

/**
 * Writes `<hash>.webp` (and `<hash>-d.webp` for light artwork) into `outDir`.
 * Returns the manifest entry { src, onLight, w, h, tone }.
 */
export async function processLogo(buf, outDir, hash = logoHash(buf)) {
  const img = sharp(buf, { animated: false, density: 300 }).ensureAlpha();
  let trimmed;
  try {
    trimmed = await img.clone().trim({ threshold: 8 }).raw().toBuffer({ resolveWithObject: true });
  } catch {
    trimmed = await img.clone().raw().toBuffer({ resolveWithObject: true });
  }
  const resized = sharp(trimmed.data, { raw: trimmed.info }).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true });
  const out = await resized.webp({ quality: 92, alphaQuality: 100, effort: 5 }).toBuffer({ resolveWithObject: true });
  // Tone: share of opaque pixels that are near-white. Light logos need a dark tile.
  const { data, info } = await sharp(out.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0,
    light = 0,
    transparent = 0,
    lumSum = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3];
    if (a < 40) {
      transparent++;
      continue;
    }
    opaque++;
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    lumSum += lum;
    if (lum > 200) light++;
  }
  const hasAlpha = transparent / (opaque + transparent) > 0.02;
  // Light artwork (white/pale logos on transparent): mostly pale pixels or a pale average.
  // A logo printed on its own opaque white plate reads fine on white: not "light".
  const plate = opaque / (opaque + transparent) > 0.55;
  const tone = hasAlpha && !plate && opaque > 0 && (light / opaque > 0.45 || lumSum / opaque > 185) ? 'light' : 'dark';
  await writeFile(path.join(outDir, `${hash}.webp`), out.data);
  let onLight = null;
  if (tone === 'light') {
    // Variant for white backgrounds: pale pixels become IRF navy, coloured accents are kept.
    const px = Buffer.from(data);
    for (let i = 0; i < px.length; i += info.channels) {
      const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      const sat = Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);
      if (lum > 150 && sat < 60) (px[i] = 0x1b), (px[i + 1] = 0x3a), (px[i + 2] = 0x5c);
    }
    await sharp(px, { raw: info }).webp({ quality: 92, alphaQuality: 100, effort: 5 }).toFile(path.join(outDir, `${hash}-d.webp`));
    onLight = `/logos/players/${hash}-d.webp`;
  }
  return { src: `/logos/players/${hash}.webp`, onLight, w: out.info.width, h: out.info.height, tone };
}
