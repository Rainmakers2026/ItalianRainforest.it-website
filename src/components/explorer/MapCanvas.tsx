'use client';
import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import type * as GeoJSON from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { ITALY_BBOX } from '@/lib/geo/territories';
import type { PublicPlayer } from '@/lib/data/schema';
import { CATEGORIES, CATEGORY_BY_KEY, type CategoryKey } from '@/lib/data/taxonomy';
import { TYPE_ICON, typeBadgeSvg } from '@/lib/data/typeIcons';
import type { Locale } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { useExplorer } from './ExplorerProvider';
import { REGION_BY_SLUG } from './labels';

const MAPLIBRE_VERSION = '6.15.0';
maplibregl.setWorkerUrl(`/vendor/maplibre-gl-worker-${MAPLIBRE_VERSION}.mjs`);

const COLOR_BY_CAT = [
  'match',
  ['get', 'cat'],
  ...CATEGORIES.flatMap((c) => [c.key, c.color]),
  '#A3ACBF',
] as unknown as ExpressionSpecification;
const CLUSTER_PROPS = Object.fromEntries(
  CATEGORIES.map((c) => [`c_${c.key}`, ['+', ['case', ['in', `|${c.key}|`, ['get', 'cats']], 1, 0]]]),
);
/** Cluster badge = its most represented player type ("c_k >= every other c_j"). */
const DOMINANT_CAT = [
  'case',
  ...CATEGORIES.flatMap((c) => [
    ['all', ...CATEGORIES.filter((o) => o.key !== c.key).map((o) => ['>=', ['get', `c_${c.key}`], ['get', `c_${o.key}`]])],
    c.key,
  ]),
  'unclassified',
] as unknown as ExpressionSpecification;
const DOMINANT_ICON = ['concat', 'type-', DOMINANT_CAT] as unknown as ExpressionSpecification;
/** From this zoom the players' own logos replace the player-type badges. */
const LOGO_ZOOM = 7;
/** Type badge sprite: 40 css px, drawn at 2× for sharp edges. */
const BADGE_PX = 40;
const loadSvg = (svg: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
/** White rounded pill (stretchable) behind the cluster counts. */
const PILL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="36" viewBox="0 0 44 36"><rect x="1.5" y="1.5" width="41" height="33" rx="16.5" fill="#fff" stroke="#14304F" stroke-opacity=".18" stroke-width="2"/></svg>';
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

/** Hover tooltip content, built with DOM APIs (never innerHTML: names come from the data). */
function tipFor(p: PublicPlayer, locale: Locale) {
  const cat = CATEGORY_BY_KEY[p.categories[0]!];
  const root = document.createElement('div');
  root.className = 'irf-tip-body';
  root.style.setProperty('--tip-color', cat.color);
  const name = document.createElement('strong');
  name.textContent = p.name;
  const type = document.createElement('span');
  type.textContent = cat.label[locale] + (p.categories.length > 1 ? ` +${p.categories.length - 1}` : '');
  root.append(name, type);
  return root;
}
/**
 * Players geocoded to the same spot (city or region centre) are fanned out on a small
 * golden-angle spiral so each one stays visible and clickable. Deterministic.
 */
function spread(players: PublicPlayer[]) {
  const groups = new Map<string, PublicPlayer[]>();
  for (const p of players) {
    const k = `${p.location!.lat!.toFixed(4)},${p.location!.lng!.toFixed(4)}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const out = new Map<string, [number, number]>();
  for (const list of groups.values()) {
    list.forEach((p, i) => {
      const { lat, lng } = p.location as { lat: number; lng: number };
      if (i === 0) return out.set(p.id, [lng, lat]);
      const r = 0.0032 * Math.sqrt(i);
      const a = i * 2.39996;
      out.set(p.id, [lng + (r * Math.cos(a)) / Math.cos((lat * Math.PI) / 180), lat + r * Math.sin(a)]);
    });
  }
  return out;
}

/** The player-type face of the medal (inline SVG, built with DOM APIs). */
function typeFace(key: CategoryKey) {
  const face = document.createElement('span');
  face.className = 'irf-coin-face irf-coin-front';
  face.setAttribute('aria-hidden', 'true');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', TYPE_ICON[key]);
  svg.append(path);
  face.append(svg);
  return face;
}
/**
 * Logo box inside the round badge: the largest rectangle of the logo's proportions that
 * fits the disc (so wide wordmarks stay legible), as % of the diameter.
 */
function logoBox(w: number | null, h: number | null) {
  const a = w && h ? w / h : 1;
  const d = 0.84;
  let bw = d / Math.sqrt(1 + 1 / (a * a));
  let bh = bw / a;
  if (bh > 0.64) (bh = 0.64), (bw = bh * a);
  return { w: `${(bw * 100).toFixed(1)}%`, h: `${(bh * 100).toFixed(1)}%` };
}
/**
 * Round logo badge (DOM, built without innerHTML), shaped as a medal: the front is the
 * navy player-type badge (same as the map sprite), which turns over to show the back —
 * the logo in colour, centred on white, ringed in the logo's own main colour. The name
 * appears above it on hover/focus.
 */
function logoMarker(p: PublicPlayer) {
  const logo = p.logo!;
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'irf-logo-marker';
  el.style.setProperty('--c', logo.color ?? '#1B3A5C');
  el.setAttribute('aria-label', p.name);
  const coin = document.createElement('span');
  coin.className = 'irf-coin';
  const back = document.createElement('span');
  // White artwork: its navy-recoloured variant; without one, a navy back keeps it readable.
  const pale = logo.tone === 'light';
  back.className = `irf-coin-face irf-coin-back${pale && !logo.onLight ? ' is-dark' : ''}`;
  const img = document.createElement('img');
  img.src = (pale && logo.onLight) || logo.src;
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  const box = logoBox(logo.w, logo.h);
  img.style.width = box.w;
  img.style.height = box.h;
  back.append(img);
  coin.append(typeFace(p.categories[0]!), back);
  const name = document.createElement('span');
  name.className = 'irf-logo-name';
  name.textContent = p.name;
  el.append(coin, name);
  // MapLibre positions the outer element with an inline transform: the badge animates inside it.
  const pin = document.createElement('div');
  pin.className = 'irf-logo-pin';
  pin.append(el);
  return { pin, el };
}
/** Logo badge diameter by zoom: grows as you zoom in. */
const logoSize = (z: number) => (z < 8 ? 46 : z < 9 ? 54 : z < 10.5 ? 64 : 72);
/** Rendered size of the type sprite at a zoom (see the "points" layer icon-size). */
const spriteSize = (z: number) => BADGE_PX * (z <= LOGO_ZOOM ? 0.66 : z >= 11 ? 0.8 : 0.66 + ((z - LOGO_ZOOM) / (11 - LOGO_ZOOM)) * 0.14);
/** Duration (ms) of the medal turning back on zoom-out (see globals.css). */
const FLIP_BACK_MS = 320;

function tipText(text: string) {
  const root = document.createElement('div');
  root.className = 'irf-tip-body irf-tip-cluster';
  root.textContent = text;
  return root;
}

/**
 * One label per city with players on the map: placed just south of the city's fan of
 * badges (see spread) so the name is not hidden under them. Bigger cities win collisions.
 */
const REGION_NAMES = new Set([...REGION_BY_SLUG.values()].flatMap((r) => [r.it.toLowerCase(), r.en.toLowerCase()]));
function cityLabels(players: PublicPlayer[]): GeoJSON.FeatureCollection {
  const cities = new Map<string, { name: string; n: number; spots: Map<string, { lng: number; lat: number; n: number }> }>();
  for (const p of players) {
    const l = p.location!;
    // City centre only (a region-level position, or a region name typed as city, is no city).
    if (!l.city || l.precision === 'region' || REGION_NAMES.has(l.city.toLowerCase())) continue;
    const key = l.city.toLowerCase();
    const c = cities.get(key) ?? { name: l.city, n: 0, spots: new Map() };
    c.n++;
    const k = `${l.lat!.toFixed(4)},${l.lng!.toFixed(4)}`;
    const spot = c.spots.get(k) ?? { lng: l.lng!, lat: l.lat!, n: 0 };
    spot.n++;
    c.spots.set(k, spot);
    cities.set(key, c);
  }
  return {
    type: 'FeatureCollection',
    features: [...cities.values()].map((c) => {
      const centre = [...c.spots.values()].sort((a, b) => b.n - a.n)[0]!;
      const r = 0.0032 * Math.sqrt(Math.max(centre.n - 1, 0));
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [centre.lng, centre.lat - r] },
        properties: { name: c.name, n: c.n },
      };
    }),
  };
}

export default function MapCanvas() {
  const { results, hoverCategory, highlightId, previewId, setPreviewId, openPlayer, filters, byId, t, locale, mapRef: sharedMapRef } = useExplorer();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const hovered = useRef<string | null>(null);
  // Latest callbacks for map event handlers registered once.
  const cb = useRef({ setPreviewId, openPlayer, byId });
  useEffect(() => {
    cb.current = { setPreviewId, openPlayer, byId };
  }, [setPreviewId, openPlayer, byId]);

  const located = useMemo(() => results.filter((p) => p.location?.lat != null && p.location?.lng != null), [results]);
  const coords = useMemo(() => spread(located), [located]);
  const fc = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: located.map((p) => ({
        type: 'Feature',
        id: p.id,
        geometry: { type: 'Point', coordinates: coords.get(p.id)! },
        properties: { id: p.id, cat: p.categories[0], cats: `|${p.categories.join('|')}|` },
      })),
    }),
    [located, coords],
  );
  const cities = useMemo(() => cityLabels(located), [located]);
  const [logosOn, setLogosOn] = useState(false);
  const locatedRef = useRef(located);
  useEffect(() => {
    locatedRef.current = located;
  }, [located]);

  // --- Init -------------------------------------------------------------------
  useEffect(() => {
    if (!container.current) return;
    let map: MLMap;
    try {
      const origin = window.location.origin;
      map = new maplibregl.Map({
        container: container.current,
        bounds: ITALY_BBOX,
        fitBoundsOptions: { padding: 24 },
        maxBounds: [
          [-16, 28],
          [40, 62],
        ],
        minZoom: 3.5,
        maxZoom: 13,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        cooperativeGestures: true,
        attributionControl: false,
        locale: {
          'NavigationControl.ZoomIn': t.map.zoomIn,
          'NavigationControl.ZoomOut': t.map.zoomOut,
          'CooperativeGesturesHandler.WindowsHelpText':
            locale === 'it' ? 'Usa Ctrl + rotella per ingrandire la mappa' : 'Use Ctrl + scroll to zoom the map',
          'CooperativeGesturesHandler.MacHelpText':
            locale === 'it' ? 'Usa ⌘ + rotella per ingrandire la mappa' : 'Use ⌘ + scroll to zoom the map',
          'CooperativeGesturesHandler.MobileHelpText':
            locale === 'it' ? 'Usa due dita per muovere la mappa' : 'Use two fingers to move the map',
        },
        style: {
          version: 8,
          glyphs: `${origin}/glyphs/{fontstack}/{range}.pbf`,
          sources: {
            europe: { type: 'geojson', data: `${origin}/geo/europe.json` },
            regions: { type: 'geojson', data: `${origin}/geo/italy-regions.json` },
            provinces: { type: 'geojson', data: `${origin}/geo/italy-provinces.json` },
            'region-labels': { type: 'geojson', data: `${origin}/geo/italy-region-labels.json` },
          },
          layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': '#DCE4F1' } },
            { id: 'europe', type: 'fill', source: 'europe', paint: { 'fill-color': '#EEF1F7' } },
            { id: 'europe-line', type: 'line', source: 'europe', paint: { 'line-color': '#D3DAE8', 'line-width': 0.6 } },
            { id: 'regions', type: 'fill', source: 'regions', paint: { 'fill-color': '#FFFFFF' } },
            {
              id: 'region-active',
              type: 'fill',
              source: 'regions',
              filter: ['==', ['get', 'slug'], ''],
              paint: { 'fill-color': '#4B61D1', 'fill-opacity': 0.06 },
            },
            {
              id: 'provinces-line',
              type: 'line',
              source: 'provinces',
              minzoom: 5.8,
              paint: { 'line-color': '#D9DFEB', 'line-width': 0.7 },
            },
            {
              id: 'regions-line',
              type: 'line',
              source: 'regions',
              paint: { 'line-color': '#C5CDE0', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 9, 1.3] },
            },
            {
              id: 'region-active-line',
              type: 'line',
              source: 'regions',
              filter: ['==', ['get', 'slug'], ''],
              paint: { 'line-color': '#4B61D1', 'line-width': 1.6 },
            },
            {
              id: 'province-active-line',
              type: 'line',
              source: 'provinces',
              filter: ['==', ['get', 'slug'], ''],
              paint: { 'line-color': '#4B61D1', 'line-width': 1.4, 'line-dasharray': [2, 1.2] },
            },
            // Region names on the country view; they give way to the city names on zoom-in.
            {
              id: 'region-labels',
              type: 'symbol',
              source: 'region-labels',
              maxzoom: 7.4,
              layout: {
                'text-field': ['get', 'name'],
                'text-font': ['irf-bold'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 4.5, 9, 6, 11.5, 7, 13],
                'text-transform': 'uppercase',
                'text-letter-spacing': 0.12,
                'text-max-width': 7,
                'text-padding': 2,
                // Moves around the cluster badges instead of hiding under them.
                'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
                'text-radial-offset': 1.4,
              },
              paint: {
                'text-color': '#6F7D99',
                'text-halo-color': 'rgba(255,255,255,0.92)',
                'text-halo-width': 1.4,
                'text-opacity': ['interpolate', ['linear'], ['zoom'], 6.8, 1, 7.4, 0],
              },
            },
          ],
        },
      });
    } catch (err) {
      console.error('[map] init failed', err);
      requestAnimationFrame(() => setFailed(true));
      return;
    }
    mapRef.current = map;
    sharedMapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: '© ISTAT / openpolis · Natural Earth · MapLibre' }),
      'bottom-right',
    );
    map.on('error', (e) => console.warn('[map]', e.error?.message));

    map.on('load', async () => {
      map.addSource('players', {
        type: 'geojson',
        data: EMPTY,
        cluster: true,
        clusterRadius: 34,
        clusterMaxZoom: 8,
        clusterProperties: CLUSTER_PROPS,
        promoteId: 'id',
      });
      map.addSource('highlight', { type: 'geojson', data: EMPTY });
      map.addSource('cities', { type: 'geojson', data: EMPTY });
      // Names of the cities where the listed players are, from the regional view inward.
      map.addLayer({
        id: 'city-labels',
        type: 'symbol',
        source: 'cities',
        minzoom: 6,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['irf-bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, ['step', ['get', 'n'], 10, 10, 11.5, 50, 13], 10, ['step', ['get', 'n'], 12.5, 10, 14, 50, 15.5]],
          'text-anchor': 'top',
          // Below the badges, which grow with the zoom.
          'text-offset': ['interpolate', ['linear'], ['zoom'], 6, ['literal', [0, 1.2]], 7, ['literal', [0, 2.2]], 9, ['literal', [0, 2.4]], 11, ['literal', [0, 2.7]]],
          'symbol-sort-key': ['-', 0, ['get', 'n']],
          'text-padding': 3,
          'text-max-width': 9,
        },
        paint: {
          'text-color': '#14304F',
          'text-halo-color': 'rgba(255,255,255,0.95)',
          'text-halo-width': 1.6,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 6.6, 1],
        },
      });

      // Player-type badges (sprites generated from the IRF pictograms).
      try {
        await Promise.all([
          ...CATEGORIES.map(async (c) => map.addImage(`type-${c.key}`, await loadSvg(typeBadgeSvg(c.key, BADGE_PX * 2)), { pixelRatio: 2 })),
          loadSvg(PILL_SVG).then((img) =>
            map.addImage('count-pill', img, { pixelRatio: 2, stretchX: [[18, 26]], stretchY: [[16, 20]], content: [12, 6, 32, 30] }),
          ),
        ]);
      } catch (err) {
        console.warn('[map] type badges unavailable', err);
      }

      // Country view: every group of players is one translucent navy badge of its main
      // player type, with the count in a white pill.
      map.addLayer({
        id: 'clusters',
        type: 'symbol',
        source: 'players',
        filter: ['has', 'point_count'],
        layout: {
          'icon-image': DOMINANT_ICON,
          'icon-size': ['step', ['get', 'point_count'], 0.85, 10, 0.98, 30, 1.12, 80, 1.28],
          'icon-allow-overlap': true,
          // Place names make way for the badges.
          'icon-ignore-placement': false,
        },
        paint: { 'icon-opacity': 1, 'icon-opacity-transition': { duration: 160 } },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'players',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['irf-bold'],
          'text-size': 11,
          // Top-right of the badge, which grows with the count.
          'text-offset': [
            'step',
            ['get', 'point_count'],
            ['literal', [1.25, -1.15]],
            10,
            ['literal', [1.4, -1.3]],
            30,
            ['literal', [1.6, -1.5]],
            80,
            ['literal', [1.8, -1.7]],
          ],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'icon-image': 'count-pill',
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [1, 4, 1, 4],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'text-color': '#14304F',
          'text-opacity-transition': { duration: 160 },
          'icon-opacity-transition': { duration: 160 },
        },
      });
      // Single players: their type badge; it fades out where the logo takes over
      // (feature-state "logo", set by syncLogos below).
      map.addLayer({
        id: 'points',
        type: 'symbol',
        source: 'players',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['concat', 'type-', ['get', 'cat']],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.6, LOGO_ZOOM, 0.66, 11, 0.8],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-opacity': ['case', ['boolean', ['feature-state', 'logo'], false], 0, 1],
          // Instant: the medal's front face takes the sprite's place pixel for pixel.
          'icon-opacity-transition': { duration: 0 },
        },
      });
      map.addLayer({
        id: 'highlight',
        type: 'circle',
        source: 'highlight',
        paint: {
          'circle-color': 'transparent',
          'circle-radius': 13,
          'circle-stroke-color': '#4B61D1',
          'circle-stroke-width': 2.5,
        },
      });

      const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '280px', className: 'irf-tip' });

      const setHover = (id: string | null) => {
        if (hovered.current === id) return;
        if (hovered.current) map.setFeatureState({ source: 'players', id: hovered.current }, { hover: false });
        hovered.current = id;
        if (id) map.setFeatureState({ source: 'players', id }, { hover: true });
      };

      map.on('mousemove', 'points', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!id || !canHover()) return;
        map.getCanvas().style.cursor = 'pointer';
        if (hovered.current !== id) {
          const p = cb.current.byId.get(id);
          const f = e.features?.[0];
          if (p && f) tip.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setDOMContent(tipFor(p, locale)).addTo(map);
          setHover(id);
          cb.current.setPreviewId(id);
          track('map_player_hover', { player: id });
        }
      });
      map.on('mouseleave', 'points', () => {
        map.getCanvas().style.cursor = '';
        tip.remove();
        setHover(null);
      });
      map.on('click', 'points', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        // Touch: first tap previews (bottom sheet); desktop: click opens the detail.
        if (canHover()) cb.current.openPlayer(id, 'map');
        else {
          setHover(id);
          cb.current.setPreviewId(id);
        }
      });
      map.on('click', 'clusters', async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const src = map.getSource('players') as GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
        map.easeTo({
          center: (f.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom: Math.min(zoom + 0.3, 12),
          duration: reducedMotion() ? 0 : 450,
        });
      });
      map.on('mousemove', 'clusters', (e) => {
        const f = e.features?.[0];
        if (!f || !canHover()) return;
        map.getCanvas().style.cursor = 'pointer';
        tip
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setDOMContent(tipText(fmt(t.map.cluster, { n: f.properties.point_count as number })))
          .addTo(map);
      });
      map.on('mouseleave', 'clusters', () => {
        map.getCanvas().style.cursor = '';
        tip.remove();
      });
      map.on('click', (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ['points', 'clusters'] });
        if (!hit.length && !canHover()) {
          setHover(null);
          cb.current.setPreviewId(null);
        }
      });
      // Logos on the map: once few enough single points are on screen, each shows its logo.
      const markers = new Map<string, maplibregl.Marker>();
      const setLogoState = (id: string, logo: boolean) => {
        try {
          map.setFeatureState({ source: 'players', id }, { logo });
        } catch {
          /* feature no longer in the source */
        }
      };
      /** Turns the medal back to its type face, then hands over to the map sprite. */
      const dropMarker = (id: string, m: maplibregl.Marker) => {
        markers.delete(id);
        if (reducedMotion()) {
          setLogoState(id, false);
          return void m.remove();
        }
        m.getElement().classList.add('is-leaving');
        window.setTimeout(() => {
          if (!markers.has(id)) setLogoState(id, false);
          m.remove();
        }, FLIP_BACK_MS);
      };
      /** Medal start size = the type sprite's, so the turn starts from the very same badge. */
      const setSizes = () => {
        const z = map.getZoom();
        container.current?.style.setProperty('--logo-size', `${logoSize(z)}px`);
        container.current?.style.setProperty('--coin-from', (spriteSize(z) / logoSize(z)).toFixed(3));
      };
      const syncLogos = () => {
        // Below LOGO_ZOOM the map speaks in player types only.
        const feats = map.getZoom() >= LOGO_ZOOM ? map.queryRenderedFeatures({ layers: ['points'] }) : [];
        // Greedy placement: a logo appears only where it doesn't cover another badge, so a
        // crowded view shows fewer logos (the coloured dot stays for the others) and every
        // zoom step reveals more. Logos already on screen keep their place (no flicker).
        const size = logoSize(map.getZoom());
        setSizes();
        const ids = new Set<string>();
        const placed: { x: number; y: number }[] = [];
        const ordered = [...feats].sort((a, b) => (markers.has(b.properties?.id) ? 1 : 0) - (markers.has(a.properties?.id) ? 1 : 0));
        for (const f of ordered) {
          const id = f.properties?.id as string;
          if (ids.has(id) || !cb.current.byId.get(id)?.logo) continue;
          const pt = map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]);
          if (placed.some((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < size + 4)) continue;
          placed.push(pt);
          ids.add(id);
        }
        for (const [id, m] of markers) if (!ids.has(id)) dropMarker(id, m);
        for (const f of feats) {
          const id = f.properties?.id as string;
          if (!ids.has(id) || markers.has(id)) continue;
          const p = cb.current.byId.get(id);
          if (!p?.logo) continue;
          const { pin, el } = logoMarker(p);
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (canHover()) cb.current.openPlayer(id, 'map');
            else cb.current.setPreviewId(id);
          });
          el.addEventListener('mouseenter', () => {
            if (canHover()) cb.current.setPreviewId(id);
          });
          setLogoState(id, true);
          markers.set(
            id,
            new maplibregl.Marker({ element: pin, anchor: 'center' })
              .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
              .addTo(map),
          );
        }
        setLogosOn(markers.size > 0);
      };
      map.on('idle', syncLogos);
      // Zooming back out past the threshold turns the logos back into type badges at once.
      map.on('zoomend', () => {
        if (map.getZoom() < LOGO_ZOOM && markers.size) syncLogos();
      });
      // Resize the badges live while zooming (placement is refreshed on idle).
      map.on('zoom', setSizes);
      setReady(true);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      sharedMapRef.current = null;
    };
    // Init once; translated strings are stable for the page lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Data -------------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    (mapRef.current?.getSource('players') as GeoJSONSource | undefined)?.setData(fc);
    (mapRef.current?.getSource('cities') as GeoJSONSource | undefined)?.setData(cities);
  }, [ready, fc, cities]);

  // --- Category hover: emphasise the category, dim everything else -------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const dim = (inCat: ExpressionSpecification, low: number): ExpressionSpecification | number =>
      hoverCategory ? ['case', inCat, 1, low] : 1;
    const inPoint: ExpressionSpecification = ['in', `|${hoverCategory}|`, ['get', 'cats']];
    const inCluster: ExpressionSpecification = ['>', ['get', `c_${hoverCategory}`], 0];
    map.setPaintProperty('points', 'icon-opacity', [
      'case',
      ['boolean', ['feature-state', 'logo'], false],
      0,
      dim(inPoint, 0.14),
    ] as ExpressionSpecification);
    map.setPaintProperty('clusters', 'icon-opacity', dim(inCluster, 0.18));
    map.setPaintProperty('cluster-count', 'text-opacity', dim(inCluster, 0.3));
    map.setPaintProperty('cluster-count', 'icon-opacity', dim(inCluster, 0.3));
    // A cluster holding the hovered type shows that type's badge.
    map.setLayoutProperty('clusters', 'icon-image', hoverCategory ? ['case', inCluster, `type-${hoverCategory}`, DOMINANT_ICON] : DOMINANT_ICON);
  }, [ready, hoverCategory]);

  // --- Highlight ring for the row hovered in the list or the previewed player --
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const id = highlightId ?? previewId;
    const p = id ? byId.get(id) : null;
    const data: GeoJSON.FeatureCollection =
      p?.location?.lat != null
        ? {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [p.location.lng!, p.location.lat] }, properties: {} }],
          }
        : EMPTY;
    (map.getSource('highlight') as GeoJSONSource | undefined)?.setData(data);
  }, [ready, highlightId, previewId, byId]);

  // --- Geographic filters → viewport -------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const region = filters.region ?? '';
    map.setFilter('region-active', ['==', ['get', 'slug'], region]);
    map.setFilter('region-active-line', ['==', ['get', 'slug'], region]);
    // A city zooms onto its players; otherwise the region, otherwise Italy.
    let bbox = ((region && REGION_BY_SLUG.get(region)?.bbox) || ITALY_BBOX) as [number, number, number, number];
    if (filters.city) {
      const pts = locatedRef.current.map((p) => [p.location!.lng!, p.location!.lat!] as const);
      if (pts.length) {
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        bbox = [Math.min(...xs) - 0.03, Math.min(...ys) - 0.02, Math.max(...xs) + 0.03, Math.max(...ys) + 0.02];
      }
    }
    map.fitBounds(bbox, { padding: 32, duration: reducedMotion() ? 0 : 650, maxZoom: filters.city ? 12 : 10 });
  }, [ready, filters.region, filters.city]);

  const resetView = () => mapRef.current?.fitBounds(ITALY_BBOX, { padding: 24, duration: reducedMotion() ? 0 : 650 });

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center bg-mist p-6 text-center text-sm font-semibold text-muted">
        {t.map.unavailable}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="absolute inset-0 h-full w-full" role="region" aria-label={t.map.mapLabel} />
      <button
        type="button"
        onClick={resetView}
        className="absolute top-[88px] right-[10px] z-10 inline-flex size-[29px] items-center justify-center rounded bg-white text-navy shadow-[0_0_0_2px_rgba(0,0,0,0.1)] hover:bg-mist"
        aria-label={t.map.resetView}
        title={t.map.resetView}
      >
        <Icon name="target" size={16} />
      </button>
      {ready && !logosOn && (
        <p className="pointer-events-none absolute top-2.5 left-2.5 z-10 hidden rounded-full bg-white/90 px-3 py-1 text-[0.75rem] font-semibold text-muted shadow-sm md:block">
          {t.map.logosHint}
        </p>
      )}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-mist/70">
          <span className="text-sm font-semibold text-muted">{t.map.loadingMap}</span>
        </div>
      )}
    </div>
  );
}
