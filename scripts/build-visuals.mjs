// Generates the editorial illustrations from the real ISTAT cartography.
//   public/visuals/why.svg  — "Italy as a living network" (PERCHÉ / WHY)
//   public/visuals/how.svg  — regions, clusters and international links (COME / HOW)
// Illustrations only: node positions are province centroids, not player data.
import mapshaper from 'mapshaper';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
await mkdir(new URL('public/visuals/', root), { recursive: true });

const regionsSrc = await readFile(new URL('data/geo/italy-regions.json', root), 'utf8');
const provincesSrc = await readFile(new URL('public/geo/italy-provinces.json', root), 'utf8');

async function simplified(src, pct) {
  const out = await mapshaper.applyCommands(
    `-i in.json -simplify ${pct}% keep-shapes -filter-islands min-area=60km2 -o out.json format=geojson precision=0.01`,
    { 'in.json': src },
  );
  return JSON.parse(out['out.json'].toString());
}
const regions = await simplified(regionsSrc, 12);
const provinces = JSON.parse(provincesSrc);

// Equirectangular projection centred on Italy.
const LNG0 = 6.5,
  LAT0 = 47.2,
  K = 52,
  COS = Math.cos((42 * Math.PI) / 180);
const proj = ([lng, lat], ox = 0, oy = 0) => [(lng - LNG0) * COS * K + ox, (LAT0 - lat) * K + oy];
const r1 = (n) => Math.round(n * 10) / 10;

function pathOf(geom, ox, oy) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys
    .map((poly) => poly.map((ring) => 'M' + ring.map((c) => proj(c, ox, oy).map(r1).join(' ')).join('L') + 'Z').join(''))
    .join('');
}

function centroid(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let best = null,
    bestA = 0;
  for (const poly of polys) {
    const ring = poly[0];
    let a = 0,
      cx = 0,
      cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i],
        [x1, y1] = ring[i + 1];
      const f = x0 * y1 - x1 * y0;
      a += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
    if (Math.abs(a) > bestA) {
      bestA = Math.abs(a);
      best = [cx / (3 * a), cy / (3 * a)];
    }
  }
  return best;
}

// Deterministic pseudo-random for decorative jitter.
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const W = 640,
  H = 590,
  OX = 40,
  OY = 12;
const nodes = provinces.features.map((f) => proj(centroid(f.geometry), OX, OY));
// Extra secondary nodes around each province centre, for density.
const minor = nodes.flatMap(([x, y]) => Array.from({ length: 2 }, () => [x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 26]));

function nearestEdges(points, k) {
  const edges = new Set();
  points.forEach((p, i) => {
    points
      .map((q, j) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2])
      .filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1])
      .slice(0, k)
      .forEach(([j, d]) => d < 95 ** 2 && edges.add(i < j ? `${i}-${j}` : `${j}-${i}`));
  });
  return [...edges].map((e) => e.split('-').map(Number));
}

const italyPath = regions.features.map((f) => pathOf(f.geometry, OX, OY)).join('');
const regionPaths = regions.features.map((f) => `<path d="${pathOf(f.geometry, OX, OY)}"/>`).join('');

const reduced = `@media (prefers-reduced-motion: reduce){*{animation:none!important;opacity:1!important;stroke-dashoffset:0!important}}`;

// ---------------------------------------------------------------- WHY (on white)
{
  const edges = nearestEdges(nodes, 3);
  const external = [
    [600, 120],
    [610, 380],
    [30, 520],
    [600, 545],
    [40, 230],
  ];
  const links = [
    [0, 5],
    [1, 40],
    [2, 85],
    [3, 75],
    [4, 2],
  ]; // external idx -> node idx
  const lines = edges
    .map(([a, b], i) => {
      const [x1, y1] = nodes[a],
        [x2, y2] = nodes[b];
      return `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" style="animation-delay:${(i % 40) * 40}ms"/>`;
    })
    .join('');
  const dots = nodes
    .map(
      ([x, y], i) =>
        `<circle cx="${r1(x)}" cy="${r1(y)}" r="${i % 7 === 0 ? 4.2 : 2.8}" class="${i % 7 === 0 ? 'hub' : 'n'}" style="animation-delay:${400 + (i % 30) * 35}ms"/>`,
    )
    .join('');
  const minorDots = minor.map(([x, y]) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="1.3"/>`).join('');
  const ext = external
    .map(([x, y], i) => {
      const [nx, ny] = nodes[links[i][1]];
      const mx = (x + nx) / 2,
        my = Math.min(y, ny) - 40;
      return `<path class="arc" d="M${r1(nx)} ${r1(ny)}Q${r1(mx)} ${r1(my)} ${x} ${y}"/><circle class="ring" cx="${x}" cy="${y}" r="14"/><circle class="ext" cx="${x}" cy="${y}" r="4"/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<style>
.land{fill:#F3F5FC;stroke:#C7D0EA;stroke-width:1}
.edges line{stroke:#4B61D1;stroke-opacity:.38;stroke-width:.9;stroke-dasharray:120;stroke-dashoffset:120;animation:draw 1.6s cubic-bezier(.22,1,.36,1) forwards}
.minor circle{fill:#7B92E8;opacity:.55}
.n{fill:#4B61D1;opacity:0;animation:pop .6s ease-out forwards}
.hub{fill:#14304F;opacity:0;animation:pop .6s ease-out forwards}
.arc{fill:none;stroke:#1F8FB8;stroke-width:1.2;stroke-dasharray:3 5;opacity:.8}
.ring{fill:none;stroke:#1F8FB8;stroke-opacity:.35;stroke-width:1}
.ext{fill:#1F8FB8}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes pop{to{opacity:1}}
${reduced}
</style>
<path class="land" d="${italyPath}"/>
<g class="minor">${minorDots}</g>
<g class="edges">${lines}</g>
${ext}
<g>${dots}</g>
</svg>`;
  await writeFile(new URL('public/visuals/why.svg', root), svg);
}

// ---------------------------------------------------------------- HOW (on savoia blue)
{
  const palette = ['#FFFFFF', '#9FE3F5', '#C9D3FF', '#FFD08A', '#B9F0D0', '#FFB3CF'];
  const hubs = [12, 14, 22, 38, 59, 62, 72, 81, 84, 104]; // indices of province nodes used as visual hubs
  const clusters = hubs
    .map((h, i) => {
      const [x, y] = nodes[h] ?? nodes[i];
      const pts = Array.from({ length: 9 }, (_, j) => {
        const a = (j / 9) * Math.PI * 2 + rnd();
        const d = 6 + rnd() * 12;
        return `<circle cx="${r1(x + Math.cos(a) * d)}" cy="${r1(y + Math.sin(a) * d)}" r="2.4" fill="${palette[(i + j) % palette.length]}"/>`;
      }).join('');
      return `<g class="cl" style="animation-delay:${200 + i * 120}ms"><circle class="halo" cx="${r1(x)}" cy="${r1(y)}" r="26"/>${pts}</g>`;
    })
    .join('');
  const sparse = nodes.map(([x, y]) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="1.6"/>`).join('');
  const intl = [
    [610, 90],
    [615, 330],
    [30, 560],
    [612, 548],
  ];
  const arcs = intl
    .map(([x, y], i) => {
      const [nx, ny] = nodes[hubs[i * 2]];
      return `<path class="arc" style="animation-delay:${900 + i * 200}ms" d="M${r1(nx)} ${r1(ny)}Q${r1((x + nx) / 2)} ${r1(Math.min(y, ny) - 60)} ${x} ${y}"/><circle class="pulse" cx="${x}" cy="${y}" r="10"/><circle cx="${x}" cy="${y}" r="3.5" fill="#9FE3F5"/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<style>
.reg path{fill:rgba(255,255,255,.07);stroke:rgba(255,255,255,.45);stroke-width:.8}
.sp circle{fill:#fff;opacity:.45}
.halo{fill:rgba(255,255,255,.08);stroke:rgba(255,255,255,.35);stroke-width:.8}
.cl{opacity:0;animation:in .8s ease-out forwards}
.arc{fill:none;stroke:#9FE3F5;stroke-width:1.2;stroke-dasharray:3 5;opacity:0;animation:in .8s ease-out forwards}
.pulse{fill:none;stroke:#9FE3F5;stroke-opacity:.5}
@keyframes in{to{opacity:1}}
${reduced}
</style>
<g class="reg">${regionPaths}</g>
<g class="sp">${sparse}</g>
${clusters}
${arcs}
</svg>`;
  await writeFile(new URL('public/visuals/how.svg', root), svg);
}
console.log('visuals written');
