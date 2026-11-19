'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { track } from '@/lib/analytics';
import type { PublicPlayer } from '@/lib/data/schema';
import type { CategoryKey } from '@/lib/data/taxonomy';
import { applyFilters, DEFAULT_FILTERS, parseFilters, serializeFilters, type Filters } from '@/lib/filters';
import type { Locale } from '@/lib/i18n/config';
import { clearLeadProfile, getLeadProfile, type LeadProfile } from '@/lib/lead-profile';
import type { Map as MLMap } from 'maplibre-gl';
import type { Dictionary } from '@/lib/i18n';

export type ExplorerStrings = Pick<Dictionary, 'explorer' | 'map' | 'database' | 'download' | 'lead' | 'share' | 'a11y'>;
type Source = 'map' | 'database';
export type LeadReason =
  | 'download_csv'
  | 'download_json'
  | 'download_pdf'
  | 'download_bulk'
  | 'map_png'
  | 'map_pdf'
  | 'map_csv'
  | 'embed';
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type Ctx = {
  locale: Locale;
  t: ExplorerStrings;
  state: LoadState;
  players: PublicPlayer[];
  byId: Map<string, PublicPlayer>;
  updatedAt: string;
  hasDemoGeo: boolean;
  results: PublicPlayer[];
  filters: Filters;
  setFilters: (patch: Partial<Filters>, source: Source) => void;
  resetFilters: (source: Source) => void;
  ensureLoaded: () => void;
  /** Category under the pointer in the category bar (hover ≠ filter). */
  hoverCategory: CategoryKey | null;
  setHoverCategory: (c: CategoryKey | null) => void;
  /** Player highlighted from the list (row hover/focus) → ring on the map. */
  highlightId: string | null;
  setHighlightId: (id: string | null) => void;
  /** Player previewed from a marker hover/tap → card in the side panel. */
  previewId: string | null;
  setPreviewId: (id: string | null) => void;
  openId: string | null;
  /** True when the profile opens inside the map panel (desktop, from list or map). */
  openInPanel: boolean;
  openPlayer: (id: string, from: string) => void;
  closePlayer: () => void;
  embed: boolean;
  downloadRequiresEmail: boolean;
  /** Runs `action` right away for a signed-up visitor, otherwise after the one-time sign-up. */
  requireLead: (reason: LeadReason, action: (profile: LeadProfile) => void) => void;
  /** Open sign-up gate (null = closed). */
  leadGate: LeadReason | null;
  completeLead: (profile: LeadProfile | null) => void;
  /** The MapLibre instance, registered by MapCanvas (used for the PNG export). */
  mapRef: React.RefObject<MLMap | null>;
};

/** Opening a profile from these places shows it in the map panel, in place of the list. */
const PANEL_SOURCES = new Set(['list', 'map', 'map_card']);

const ExplorerContext = createContext<Ctx | null>(null);

export function useExplorer() {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error('useExplorer must be used inside <ExplorerProvider>');
  return ctx;
}

/** Loads the dataset when `ref` gets close to the viewport. */
export function useLoadWhenNear(ref: React.RefObject<Element | null>) {
  const { ensureLoaded } = useExplorer();
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return ensureLoaded();
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && ensureLoaded(), { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, ensureLoaded]);
}

export function ExplorerProvider({
  locale,
  t,
  children,
  initialUpdatedAt,
  embed = false,
  downloadRequiresEmail = true,
}: {
  locale: Locale;
  t: ExplorerStrings;
  children: ReactNode;
  initialUpdatedAt: string;
  embed?: boolean;
  downloadRequiresEmail?: boolean;
}) {
  const [state, setState] = useState<LoadState>('idle');
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [hasDemoGeo, setHasDemoGeo] = useState(false);
  const [filters, setFiltersState] = useState<Filters>(DEFAULT_FILTERS);
  const [hoverCategory, setHoverCategory] = useState<CategoryKey | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openInPanel, setOpenInPanel] = useState(false);
  const [leadGate, setLeadGate] = useState<LeadReason | null>(null);
  const pendingLead = useRef<((p: LeadProfile) => void) | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const loading = useRef(false);
  const pendingSlug = useRef<string | null>(null);
  // Mirror of `filters` for event handlers, so side effects stay out of state updaters.
  const filtersRef = useRef<Filters>(DEFAULT_FILTERS);

  const ensureLoaded = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    setState('loading');
    fetch('/api/players')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { players: PublicPlayer[]; updatedAt: string; hasDemoGeo: boolean }) => {
        setPlayers(d.players);
        setUpdatedAt(d.updatedAt);
        setHasDemoGeo(d.hasDemoGeo);
        setState('ready');
      })
      .catch(() => {
        loading.current = false;
        setState('error');
      });
  }, []);

  // Initial state from the URL (filters + ?player=slug deep link).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    // Testing aid: ?reset-signup forgets this browser's one-time sign-up, so the gate shows again.
    if (sp.has('reset-signup')) clearLeadProfile();
    filtersRef.current = parseFilters(sp);
    setFiltersState(filtersRef.current);
    pendingSlug.current = sp.get('player');
    const hasQuery = [...sp.keys()].length > 0;
    if (embed || hasQuery || ['#map', '#database'].includes(window.location.hash)) ensureLoaded();
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      filtersRef.current = parseFilters(p);
      setFiltersState(filtersRef.current);
      const slug = p.get('player');
      setOpenId((cur) => (slug ? cur : null));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [embed, ensureLoaded]);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  // Resolve a ?player= deep link once data is in.
  useEffect(() => {
    if (state !== 'ready' || !pendingSlug.current) return;
    const p = players.find((x) => x.slug === pendingSlug.current);
    pendingSlug.current = null;
    if (p) setOpenId(p.id);
  }, [state, players]);

  const writeUrl = useCallback(
    (f: Filters, opts: { push: boolean; player?: string | null }) => {
      if (embed && window.self !== window.top) return; // do not touch the host page history
      const sp = serializeFilters(f);
      const current = new URLSearchParams(window.location.search);
      const player = opts.player === undefined ? current.get('player') : opts.player;
      if (player) sp.set('player', player);
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
        const v = current.get(k);
        if (v) sp.set(k, v);
      }
      const qs = sp.toString();
      const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
      window.history[opts.push ? 'pushState' : 'replaceState'](window.history.state, '', url);
    },
    [embed],
  );

  const setFilters = useCallback(
    (patch: Partial<Filters>, source: Source) => {
      const prev = filtersRef.current;
      const next = { ...prev, ...patch };
      // The city always belongs to the selected region.
      if ('region' in patch && patch.region !== prev.region) next.city = patch.city ?? null;
      filtersRef.current = next;
      setFiltersState(next);
      const onlyQuery = Object.keys(patch).length === 1 && 'q' in patch;
      writeUrl(next, { push: !onlyQuery });
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'q') continue;
        track(`${source}_filter_used`, { filter: k, value: Array.isArray(v) ? v.join(',') : (v ?? 'none') });
      }
    },
    [writeUrl],
  );

  const resetFilters = useCallback(
    (source: Source) => {
      filtersRef.current = DEFAULT_FILTERS;
      setFiltersState(DEFAULT_FILTERS);
      writeUrl(DEFAULT_FILTERS, { push: true });
      track(`${source}_filter_used`, { filter: 'reset' });
    },
    [writeUrl],
  );

  const results = useMemo(() => applyFilters(players, filters), [players, filters]);

  const openPlayer = useCallback(
    (id: string, from: string) => {
      setOpenInPanel(PANEL_SOURCES.has(from) && window.matchMedia('(min-width: 768px)').matches);
      setOpenId(id);
      const p = byId.get(id);
      track('map_player_open', { player: id, from });
      if (p) writeUrl(filtersRef.current, { push: true, player: p.slug });
    },
    [byId, writeUrl],
  );
  const closePlayer = useCallback(() => {
    setOpenId(null);
    writeUrl(filtersRef.current, { push: false, player: null });
  }, [writeUrl]);

  const requireLead = useCallback((reason: LeadReason, action: (p: LeadProfile) => void) => {
    const profile = getLeadProfile();
    if (profile) return action(profile);
    pendingLead.current = action;
    setLeadGate(reason);
  }, []);
  const completeLead = useCallback((profile: LeadProfile | null) => {
    const action = pendingLead.current;
    pendingLead.current = null;
    setLeadGate(null);
    if (profile && action) action(profile);
  }, []);

  const value: Ctx = {
    locale,
    t,
    state,
    players,
    byId,
    updatedAt,
    hasDemoGeo,
    results,
    filters,
    setFilters,
    resetFilters,
    ensureLoaded,
    hoverCategory,
    setHoverCategory,
    highlightId,
    setHighlightId,
    previewId,
    setPreviewId,
    openId,
    openInPanel,
    openPlayer,
    closePlayer,
    embed,
    downloadRequiresEmail,
    requireLead,
    leadGate,
    completeLead,
    mapRef,
  };
  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}
