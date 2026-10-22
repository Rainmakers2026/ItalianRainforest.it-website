import { createHash } from 'node:crypto';
import { PROVINCES } from '@/lib/geo/territories';
import type { PublicPlayer } from './schema';

/**
 * DEMO ONLY. The public dataset has no geographic fields yet, so the map would be
 * empty. When IRF_GEO_DEMO=true, players investing in Italy and lacking a real
 * position receive a deterministic synthetic one so the map UX can be reviewed.
 *
 * Demo positions are flagged `source: 'demo'`, labelled in the UI, excluded from
 * downloads and must be switched off once Airtable exposes real locations.
 */
export const isGeoDemoEnabled = () => process.env.IRF_GEO_DEMO === 'true';

function rand(seed: string, salt: string) {
  const h = createHash('sha1').update(seed + salt).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

export function applyDemoGeo(players: PublicPlayer[]): PublicPlayer[] {
  return players.map((p) => {
    if (p.location?.lat != null) return p;
    if (!p.investmentCountries.includes('Italy')) return p;
    const prov = PROVINCES[Math.floor(rand(p.id, 'p') * PROVINCES.length)]!;
    const [minX, minY, maxX, maxY] = prov.bbox;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Stay near the middle of the province so points do not fall into the sea.
    const lng = cx + (rand(p.id, 'x') - 0.5) * (maxX - minX) * 0.3;
    const lat = cy + (rand(p.id, 'y') - 0.5) * (maxY - minY) * 0.3;
    return {
      ...p,
      location: { country: "Italy", region: prov.region, province: prov.slug, city: null, lat: +lat.toFixed(4), lng: +lng.toFixed(4), source: "demo" as const },
    };
  });
}
