// Label points of the Italian regions for the map (public/geo/italy-region-labels.json):
// for each region, the point of its largest polygon farthest from the border (grid
// search), so the name sits well inside the region.
//   node scripts/build-region-labels.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const geo = JSON.parse(await readFile(path.join(root, 'public/geo/italy-regions.json'), 'utf8'));

const area = (ring) => ring.reduce((s, [x, y], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return s + x * y2 - x2 * y; }, 0) / 2;
const inside = ([x, y], ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const segDist = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const edgeDist = (p, ring) => { let d = Infinity; for (let i = 0; i < ring.length - 1; i++) d = Math.min(d, segDist(p, ring[i], ring[i + 1])); return d; };

const features = geo.features.map((f) => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const ring = polys.map((p) => p[0]).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = [(x0 + x1) / 2, (y0 + y1) / 2], bestD = -1;
  const n = 60;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const p = [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * j) / n];
      if (!inside(p, ring)) continue;
      // Slight pull to the centre of the box so long regions keep the label central.
      const d = edgeDist(p, ring) - 0.04 * Math.hypot(p[0] - (x0 + x1) / 2, p[1] - (y0 + y1) / 2);
      if (d > bestD) (bestD = d), (best = p);
    }
  return { type: 'Feature', properties: { slug: f.properties.slug, name: f.properties.name }, geometry: { type: 'Point', coordinates: best.map((v) => +v.toFixed(4)) } };
});
await writeFile(path.join(root, 'public/geo/italy-region-labels.json'), JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`${features.length} region labels`);
