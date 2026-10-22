'use client';
import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import type * as GeoJSON from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { ITALY_BBOX } from '@/lib/geo/territories';
import { CATEGORIES } from '@/lib/data/taxonomy';
import { Icon } from '../ui/Icon';
import { useExplorer } from './ExplorerProvider';
import { PROVINCE_BY_SLUG, REGION_BY_SLUG } from './labels';

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

export default function MapCanvas() {
  const { results, hoverCategory, highlightId, previewId, setPreviewId, openPlayer, filters, byId, t, locale } = useExplorer();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const hovered = useRef<string | null>(null);
  // Latest callbacks for map event handlers registered once.
  const cb = useRef({ setPreviewId, openPlayer });
  useEffect(() => {
    cb.current = { setPreviewId, openPlayer };
  }, [setPreviewId, openPlayer]);

  const fc = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: results
        .filter((p) => p.location?.lat != null && p.location?.lng != null)
        .map((p) => ({
          type: 'Feature',
          id: p.id,
          geometry: { type: 'Point', coordinates: [p.location!.lng!, p.location!.lat!] },
          properties: { id: p.id, cat: p.categories[0], cats: `|${p.categories.join('|')}|` },
        })),
    }),
    [results],
  );

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
        clusterRadius: 44,
        clusterMaxZoom: 9,
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
          setHover(id);
          cb.current.setPreviewId(id);
          track('map_player_hover', { player: id });
        }
      });
      map.on('mouseleave', 'points', () => {
        map.getCanvas().style.cursor = '';
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
      map.on('mouseenter', 'clusters', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'clusters', () => (map.getCanvas().style.cursor = ''));
      map.on('click', (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ['points', 'clusters'] });
        if (!hit.length && !canHover()) {
          setHover(null);
          cb.current.setPreviewId(null);
        }
      });
      setReady(true);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
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
    const province = filters.province ?? '';
    map.setFilter('region-active', ['==', ['get', 'slug'], region]);
    map.setFilter('region-active-line', ['==', ['get', 'slug'], region]);
    map.setFilter('province-active-line', ['==', ['get', 'slug'], province]);
    const bbox = (province && PROVINCE_BY_SLUG.get(province)?.bbox) || (region && REGION_BY_SLUG.get(region)?.bbox) || ITALY_BBOX;
    map.fitBounds(bbox as [number, number, number, number], { padding: 32, duration: reducedMotion() ? 0 : 650, maxZoom: 10 });
  }, [ready, filters.region, filters.province]);

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
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-mist/70">
          <span className="text-sm font-semibold text-muted">{t.map.loadingMap}</span>
        </div>
      )}
    </div>
  );
}
