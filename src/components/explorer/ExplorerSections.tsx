'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { track } from '@/lib/analytics';
import { formatNumber, type Locale } from '@/lib/i18n/config';
import { DatabaseExplorer } from './DatabaseExplorer';
import { ExplorerProvider, useExplorer, type ExplorerStrings } from './ExplorerProvider';
import { ExplorerShell } from './ExplorerShell';
import { MapExplorer } from './MapExplorer';
import { LeadGate } from './LeadGate';
import { PlayerDetail } from './PlayerDetail';
import { ShareEmbed } from './ShareEmbed';
import { ViewSwitch, type ExplorerView } from './ViewSwitch';

export type ExplorerProps = {
  locale: Locale;
  t: ExplorerStrings;
  updatedAt: string;
  downloadRequiresEmail: boolean;
  header: ReactNode;
};

export const viewFromHash = (hash: string): ExplorerView => (['#database', '#database-embed'].includes(hash) ? 'database' : 'map');

/** Map (default) and database in one place, behind the Map | Database switch. */
function UnifiedExplorer() {
  const { t, state, results, locale } = useExplorer();
  // Client-only component (loaded after hydration by LazyExplorer): reading the hash here is safe.
  const [view, setView] = useState<ExplorerView>(() => viewFromHash(window.location.hash));
  // The database mounts on first visit, then stays (sort, page and scroll survive switching).
  const [dbMounted, setDbMounted] = useState(() => view === 'database');
  const uid = useId();
  const ids = { map: `${uid}-map`, database: `${uid}-database` };

  useEffect(() => {
    const sync = () => {
      const v = viewFromHash(window.location.hash);
      setView(v);
      if (v === 'database') setDbMounted(true);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const change = (v: ExplorerView) => {
    if (v === view) return;
    setView(v);
    if (v === 'database') setDbMounted(true);
    track('explorer_view_switch', { view: v });
    requestAnimationFrame(() => document.getElementById(`${ids[v]}-tab`)?.focus());
  };

  return (
    <>
      <div className="mt-9">
        <ViewSwitch
          view={view}
          onChange={change}
          ids={ids}
          ariaLabel={t.map.switchLabel}
          labels={{ map: t.map.viewMap, database: t.map.viewDatabase }}
          count={state === 'ready' ? formatNumber(results.length, locale) : undefined}
        />
      </div>

      <div id={ids.map} role="tabpanel" aria-labelledby={`${ids.map}-tab`} hidden={view !== 'map'} className="pop-in mt-6">
        <MapExplorer />
        <ShareEmbed kind="map" />
      </div>
      <div id={ids.database} role="tabpanel" aria-labelledby={`${ids.database}-tab`} hidden={view !== 'database'} className="pop-in mt-6">
        {dbMounted && (
          <>
            <DatabaseExplorer />
            <ShareEmbed kind="database" />
          </>
        )}
      </div>
    </>
  );
}

/** Map + Database share one ExplorerProvider (same query state, one data load). Loaded on demand by LazyExplorer. */
export default function ExplorerSections({ locale, t, updatedAt, downloadRequiresEmail, header }: ExplorerProps) {
  return (
    <ExplorerProvider locale={locale} t={t} initialUpdatedAt={updatedAt} downloadRequiresEmail={downloadRequiresEmail}>
      <ExplorerShell header={header} body={<UnifiedExplorer />} />
      <PlayerDetail />
      <LeadGate />
    </ExplorerProvider>
  );
}
