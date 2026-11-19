'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { formatNumber } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { useExplorer, useLoadWhenNear } from './ExplorerProvider';
import { PlayerPanelPopup } from './PlayerDetail';
import { PlayerList } from './PlayerList';
import { PlayerPreviewCard } from './PlayerPreviewCard';
import { DemoGeoBanner, EmptyState, ErrorState, LoadingState } from './States';
import { MapDownloads } from './Downloads';
import { ResultsCount, Toolbar } from './Toolbar';

const MapCanvas = dynamic(() => import('./MapCanvas'), { ssr: false });

/**
 * Map component: toolbar on top; desktop split ≈ 1/3 list-or-preview + 2/3 map;
 * mobile toggles Map | List with a bottom sheet for the tapped player.
 */
export function MapExplorer({ height = 'min(84vh, calc(100dvh - var(--header-h) - 24px))' }: { height?: string }) {
  const { state, results, previewId, setPreviewId, byId, t, locale, openPlayer, resetFilters, setHighlightId } = useExplorer();
  const root = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  useLoadWhenNear(root);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          track('map_view');
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Drop the preview when its player is filtered out.
  useEffect(() => {
    if (previewId && !results.some((p) => p.id === previewId)) setPreviewId(null);
  }, [results, previewId, setPreviewId]);

  useEffect(() => {
    if (!previewId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPreviewId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewId, setPreviewId]);

  const preview = previewId ? byId.get(previewId) : undefined;
  const withoutLocation = useMemo(() => results.filter((p) => p.location?.lat == null).length, [results]);
  const n = formatNumber(results.length, locale);

  const panel =
    state === 'error' ? (
      <ErrorState />
    ) : state !== 'ready' ? (
      <LoadingState />
    ) : results.length === 0 ? (
      <EmptyState onReset={() => resetFilters('map')} />
    ) : null;

  return (
    <div ref={root} className="card overflow-clip text-ink shadow-[0_40px_80px_-40px_rgb(5_15_30/0.9)] ring-1 ring-white/10">
      <div className="sticky top-[var(--header-h)] z-20 border-b border-line bg-white p-3 md:static md:p-4">
        <Toolbar source="map" showCategories />
        <div className="mt-3 flex items-center justify-between gap-2 md:hidden">
          <div role="group" aria-label={t.map.title} className="inline-flex rounded-full bg-mist p-1 text-sm font-bold">
            {(['map', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 transition-colors duration-200 min-[400px]:px-4 ${view === v ? 'bg-white text-navy shadow-sm' : 'text-muted'}`}
              >
                <Icon name={v === 'map' ? 'map' : 'list'} size={16} />
                <span className="max-[359px]:sr-only">{v === 'map' ? t.map.viewMap : t.map.viewList}</span>
                {v === 'list' && (
                  <span className="rounded-full bg-savoia-50 px-1.5 text-xs text-savoia-700 tabular-nums" aria-hidden="true">
                    {n}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* On mobile the count sits on the List toggle; this copy keeps the live announcement. */}
          <div className="sr-only">
            <ResultsCount />
          </div>
          <MapDownloads compact />
        </div>
      </div>
      <div className="px-3 pt-3 empty:hidden md:px-4">
        <DemoGeoBanner />
      </div>

      <div className="relative grid md:grid-cols-[minmax(300px,1fr)_2fr]" style={{ height }}>
        {/* Left panel: alphabetical list, or the preview card on marker hover */}
        <aside className={`relative min-h-0 flex-col border-line md:flex md:border-r ${view === 'list' ? 'view-fade flex' : 'hidden'}`}>
          <div className="hidden items-center justify-between gap-2 border-b border-line px-4 py-3 md:flex">
            <ResultsCount />
          </div>
          {state === 'ready' && withoutLocation > 0 && results.length > 0 && (
            <p className="border-b border-line bg-mist px-4 py-2 text-xs text-muted">
              {fmt(t.explorer.noLocation, { n: formatNumber(withoutLocation, locale) })}
            </p>
          )}
          <div
            className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
            onMouseLeave={() => setHighlightId(null)}
          >
            {panel ?? (
              <>
                {preview && (
                  <div key={preview.id} className="fade-pop hidden h-full p-2 md:block">
                    <PlayerPreviewCard p={preview} onClose={() => setPreviewId(null)} />
                  </div>
                )}
                <div className={preview ? 'md:hidden' : ''}>
                  <PlayerList onOpen={(id) => openPlayer(id, 'list')} />
                </div>
              </>
            )}
          </div>
          <PlayerPanelPopup />
        </aside>

        {/* Map */}
        <div className={`relative min-h-0 bg-mist md:block ${view === 'map' ? 'view-fade block' : 'hidden'}`}>
          {state === 'idle' ? <LoadingState label={t.map.loadingMap} /> : <MapCanvas />}

          {/* Desktop: download the filtered map (PNG) or its results (CSV). */}
          {state === 'ready' && (
            <div className="absolute top-3 left-3 z-10 hidden rounded-full bg-white/95 p-1 shadow-[var(--shadow-card)] ring-1 ring-line backdrop-blur-sm md:block">
              <MapDownloads />
            </div>
          )}

          {/* Mobile: floating list CTA */}
          {state === 'ready' && !preview && (
            <button
              type="button"
              onClick={() => setView('list')}
              className="btn btn-primary absolute bottom-4 left-1/2 z-10 -translate-x-1/2 shadow-[var(--shadow-pop)] md:hidden"
            >
              <Icon name="list" size={18} />
              {fmt(t.map.listCta, { n })}
            </button>
          )}

          {/* Mobile: bottom sheet for the tapped marker */}
          {preview && (
            <div key={preview.id} className="fade-pop absolute inset-x-0 bottom-0 z-10 max-h-[45%] min-h-[35%] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-[var(--shadow-pop)] md:hidden">
              <PlayerPreviewCard p={preview} compact onClose={() => setPreviewId(null)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
