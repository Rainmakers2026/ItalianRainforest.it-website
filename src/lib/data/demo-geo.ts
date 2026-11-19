import type { PublicPlayer } from './schema';

/**
 * DEMO ONLY (kept for design reviews). With IRF_GEO_DEMO=true nothing is invented any
 * more: the dataset now carries real positions (geocoded from the database addresses).
 * The hook stays so the UI flag `hasDemoGeo` keeps working if a future source lacks them.
 */
export const isGeoDemoEnabled = () => process.env.IRF_GEO_DEMO === 'true';

export function applyDemoGeo(players: PublicPlayer[]): PublicPlayer[] {
  return players;
}
