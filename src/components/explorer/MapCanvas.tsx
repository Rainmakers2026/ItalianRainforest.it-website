'use client';
import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import type * as GeoJSON from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { ITALY_BBOX } from '@/lib/geo/territories';
import type { PublicPlayer } from '@/lib/data/schema';
import { CATEGORIES, CATEGORY_BY_KEY } from '@/lib/data/taxonomy';
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

/** Logo marker (DOM, built without innerHTML). */
/**
 * Round logo badge (DOM, built without innerHTML): the logo in colour on a white disc —
 * light artwork on navy — ringed in the player-type colour, with the name in a label
 * that appears above it on hover/focus.
 */
function logoMarker(p: PublicPlayer) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `irf-logo-marker${p.logo!.tone === 'light' ? ' is-dark' : ''}`;
  el.style.setProperty('--c', CATEGORY_BY_KEY[p.categories[0]!].color);
  el.setAttribute('aria-label', p.name);
  const img = document.createElement('img');
  img.src = p.logo!.src;
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  const name = document.createElement('span');
  name.className = 'irf-logo-name';
  name.textContent = p.name;
  el.append(img, name);
  // MapLibre positions the outer element with an inline transform: the badge animates inside it.
  const pin = document.createElement('div');
  pin.className = 'irf-logo-pin';
  pin.append(el);
  return { pin, el };
}
/** Badge diameter by zoom: tiny on the country view, bigger as you zoom in. */
const logoSize = (z: number) => (z < 6 ? 22 : z < 7.5 ? 26 : z < 9 ? 32 : z < 11 ? 40 : 46);

function tipText(text: string) {
  const root = document.createElement('div');
  root.className = 'irf-tip-body irf-tip-cluster';
  root.textContent = text;
  return root;
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

    map.on('load', () => {
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

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'players',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#14304F',
          'circle-radius': ['step', ['get', 'point_count'], 13, 10, 16, 30, 20, 80, 25],
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
          'circle-opacity': 0.92,
          'circle-opacity-transition': { duration: 160 },
          'circle-stroke-opacity-transition': { duration: 160 },
        },
      });
      map.addLayer({
        id: 'cluster-halo',
        type: 'circle',
        source: 'players',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'transparent',
          'circle-radius': ['step', ['get', 'point_count'], 19, 10, 23, 30, 28, 80, 34],
          'circle-stroke-color': '#4B61D1',
          'circle-stroke-width': 1,
          'circle-stroke-opacity': 0.25,
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'players',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['irf-bold'],
          'text-size': 12,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#FFFFFF', 'text-opacity-transition': { duration: 160 } },
      });
      map.addLayer({
        id: 'points',
        type: 'circle',
        source: 'players',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': COLOR_BY_CAT,
          'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 9, 6.5],
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.5, 1.6],
          'circle-radius-transition': { duration: 150 },
          'circle-opacity-transition': { duration: 160 },
          'circle-stroke-opacity-transition': { duration: 160 },
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
      const syncLogos = () => {
        const feats = map.queryRenderedFeatures({ layers: ['points'] });
        // Greedy placement: a logo appears only where it doesn't cover another badge, so a
        // crowded view shows fewer logos (the coloured dot stays for the others) and every
        // zoom step reveals more. Logos already on screen keep their place (no flicker).
        const size = logoSize(map.getZoom());
        container.current?.style.setProperty('--logo-size', `${size}px`);
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
        for (const [id, m] of markers) {
          if (!ids.has(id)) {
            m.remove();
            markers.delete(id);
          }
        }
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
      // Resize the badges live while zooming (placement is refreshed on idle).
      map.on('zoom', () => container.current?.style.setProperty('--logo-size', `${logoSize(map.getZoom())}px`));
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
  }, [ready, fc]);

  // --- Category hover: emphasise the category, dim everything else -------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const pointOpacity: ExpressionSpecification | number = hoverCategory
      ? ['case', ['in', `|${hoverCategory}|`, ['get', 'cats']], 1, 0.14]
      : 1;
    const clusterOpacity: ExpressionSpecification | number = hoverCategory
      ? ['case', ['>', ['get', `c_${hoverCategory}`], 0], 0.95, 0.18]
      : 0.92;
    map.setPaintProperty('points', 'circle-opacity', pointOpacity);
    map.setPaintProperty('points', 'circle-stroke-opacity', pointOpacity);
    map.setPaintProperty('clusters', 'circle-opacity', clusterOpacity);
    map.setPaintProperty('clusters', 'circle-stroke-opacity', clusterOpacity);
    map.setPaintProperty('cluster-count', 'text-opacity', hoverCategory ? ['case', ['>', ['get', `c_${hoverCategory}`], 0], 1, 0.3] : 1);
    map.setPaintProperty(
      'clusters',
      'circle-color',
      hoverCategory
        ? ['case', ['>', ['get', `c_${hoverCategory}`], 0], CATEGORIES.find((c) => c.key === hoverCategory)!.color, '#14304F']
        : '#14304F',
    );
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
