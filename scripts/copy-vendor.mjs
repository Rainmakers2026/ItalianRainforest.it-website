// MapLibre 6 loads its worker relative to import.meta.url, which does not survive
// bundling. Ship the worker as a static, versioned file and point MapLibre at it.
import { copyFile, mkdir, readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('node_modules/maplibre-gl/package.json', root), 'utf8'));
await mkdir(new URL('public/vendor/', root), { recursive: true });
await copyFile(
  new URL('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', root),
  new URL(`public/vendor/maplibre-gl-worker-${pkg.version}.mjs`, root),
);
console.log(`maplibre worker ${pkg.version} copied`);
