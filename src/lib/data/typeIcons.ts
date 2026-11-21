import { CATEGORY_BY_KEY, type CategoryKey } from './taxonomy';

/**
 * Pictograms of the player types (24×24 stroke paths, IRF line style). Used by the map
 * as translucent navy badges on the country view, before the players' own logos appear.
 */
export const TYPE_ICON: Record<CategoryKey, string> = {
  // sprout: growing people
  programs: 'M12 21v-8m0 0c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5Zm0 2.5c0-3.2-2.5-5.5-6-5.5 0 3.2 2.5 5.5 6 5.5Z',
  // graduation cap
  training: 'M2 9.5 12 4.5l10 5-10 5-10-5Zm4 2.2v4.6c3.3 2.6 8.7 2.6 12 0v-4.6M22 9.5v5.5',
  // rocket
  incubator:
    'M5.5 15.5c-1.7 1.4-2.3 3.6-2.3 5.3 1.7 0 3.9-.6 5.3-2.3M9 15l-3-3c1.6-5 5.7-8.8 14-9 -.2 8.3-4 12.4-9 14l-2-2Zm6-5.5h.01',
  // stacked building blocks
  'venture-builder': 'M3.5 13.5h7.5V21H3.5zM13 13.5h7.5V21H13zM8.25 3h7.5v7.5h-7.5z',
  // lab flask
  'science-park': 'M9 3h6m-5 0v6.2L4.6 18.4A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.6L14 9.2V3M7 15h10',
  // rising chart
  vc: 'M3 18 9 12l4 4 8-8.5M15.5 7.5H21V13',
  // corporate tower with growth arrow
  cvc: 'M3 21V8l7-4v17m0-10h6v10M2 21h20M6.5 10h.01M6.5 14h.01M6.5 18h.01M14 3h6v6m0-6-5 5',
  // person with halo (angel)
  angels: 'M8 4.2C8 3.3 9.8 2.7 12 2.7s4 .6 4 1.5-1.8 1.5-4 1.5-4-.6-4-1.5ZM12 14a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM5 21.3c.6-3.5 3.4-5.6 7-5.6s6.4 2.1 7 5.6',
  // crowd
  crowdfunding:
    'M9 11.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM2.8 20.5c.4-3.4 3-5.6 6.2-5.6s5.8 2.2 6.2 5.6M15.8 5.3a3.2 3.2 0 0 1 0 6M18 14.9c1.9.8 3 2.8 3.2 5.6',
  // family house
  'family-office': 'M3 11.2 12 4l9 7.2M5.5 9.6V20.5h13V9.6M10 20.5v-5.2h4v5.2',
  // institution
  institution: 'M3 21h18M5 21V10.5m4.67 10.5V10.5m4.66 10.5V10.5M19 21V10.5M2 10.5 12 4l10 6.5',
  // network of nodes
  associations:
    'M12 7.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM5 21.7a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Zm14 0a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM12 7.5V12m0 0-5.2 4.8M12 12l5.2 4.8',
  // megaphone
  media: 'M3 9.5v5h3.2l8.3 5V4.5l-8.3 5H3Zm15-1.7a5.5 5.5 0 0 1 0 8.4M20.5 5.5a9 9 0 0 1 0 13',
  // laptop on a shared desk
  coworking: 'M5 5.5h14v9.5H5zM2 18.5h20M9.5 18.5v-1h5v1',
  // dots
  other: 'M6 12h.01M12 12h.01M18 12h.01',
  // question mark
  unclassified: 'M9.3 9a2.7 2.7 0 1 1 3.8 2.5c-.7.3-1.1 1-1.1 1.7v.8M12 17.5h.01',
};

/** IRF navy used for the translucent type badges. */
export const TYPE_BADGE_NAVY = '20, 48, 79';

/**
 * Round type badge as an SVG string (map sprite): translucent IRF navy disc, thin ring in
 * the player-type colour, white pictogram. `px` is the rendered size in device pixels.
 */
export function typeBadgeSvg(key: CategoryKey, px: number) {
  const color = CATEGORY_BY_KEY[key].color;
  const heavy = key === 'other' || key === 'unclassified';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 40 40">
<circle cx="20" cy="20" r="18.2" fill="rgb(${TYPE_BADGE_NAVY})" fill-opacity="0.84" stroke="${color}" stroke-width="2.2"/>
<circle cx="20" cy="20" r="19.4" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="1"/>
<g transform="translate(9.2 9.2) scale(0.9)" fill="none" stroke="#fff" stroke-width="${heavy ? 3.4 : 1.9}" stroke-linecap="round" stroke-linejoin="round"><path d="${TYPE_ICON[key]}"/></g>
</svg>`;
}
