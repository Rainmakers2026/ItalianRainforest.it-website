'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { ExplorerProps } from './ExplorerSections';
import { ExplorerShell } from './ExplorerShell';

/**
 * Keeps the map/database code (and its hydration cost) out of the initial page
 * load. The real explorer is imported when its sections approach the viewport,
 * or immediately when the URL targets it (#map, #database, filters, ?player=).
 */
export function LazyExplorer(props: ExplorerProps & { loadingLabel: string }) {
  const [Explorer, setExplorer] = useState<ComponentType<ExplorerProps> | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let done = false;
    const load = () => {
      if (done) return;
      done = true;
      import('./ExplorerSections').then((m) => setExplorer(() => m.default));
    };
    const targeted = () =>
      ['#map', '#database', '#map-embed', '#database-embed'].includes(window.location.hash) || window.location.search.length > 1;
    if (targeted()) return load();
    const onHash = () => targeted() && load();
    window.addEventListener('hashchange', onHash);
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && load(), { rootMargin: '1600px 0px' });
    if (sentinel.current) io.observe(sentinel.current);
    return () => {
      io.disconnect();
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  // Anchors that only exist in the loaded explorer (e.g. #map-embed): scroll once mounted.
  useEffect(() => {
    if (!Explorer || !window.location.hash) return;
    const id = window.location.hash.slice(1);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, [Explorer]);

  if (Explorer) return <Explorer {...props} />;

  // Same frame and approximate height as the loaded explorer: no layout shift on swap.
  const placeholder = (h: string) => (
    <div
      className="card mt-8 flex items-center justify-center text-sm font-semibold text-muted shadow-[var(--shadow-card)]"
      style={{ height: h }}
    >
      {props.loadingLabel}
    </div>
  );
  return (
    <div ref={sentinel}>
      <ExplorerShell
        map={{ header: props.mapHeader, body: placeholder('min(84vh, calc(100dvh - var(--header-h) - 24px))') }}
        database={{ header: props.databaseHeader, body: placeholder('900px') }}
      />
    </div>
  );
}
