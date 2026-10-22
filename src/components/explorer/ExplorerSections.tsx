'use client';

import type { ReactNode } from 'react';
import type { Locale } from '@/lib/i18n/config';
import { ContactDialog } from './ContactDialog';
import { DatabaseExplorer } from './DatabaseExplorer';
import { ExplorerProvider, type ExplorerStrings } from './ExplorerProvider';
import { ExplorerShell } from './ExplorerShell';
import { MapExplorer } from './MapExplorer';
import { PlayerDetail } from './PlayerDetail';
import { ShareEmbed } from './ShareEmbed';

export type ExplorerProps = {
  locale: Locale;
  t: ExplorerStrings;
  updatedAt: string;
  downloadRequiresEmail: boolean;
  mapHeader: ReactNode;
  databaseHeader: ReactNode;
};

/** Map + Database share one ExplorerProvider (same query state, one data load). Loaded on demand by LazyExplorer. */
export default function ExplorerSections({ locale, t, updatedAt, downloadRequiresEmail, mapHeader, databaseHeader }: ExplorerProps) {
  return (
    <ExplorerProvider locale={locale} t={t} initialUpdatedAt={updatedAt} downloadRequiresEmail={downloadRequiresEmail}>
      <ExplorerShell
        map={{
          header: mapHeader,
          body: (
            <>
              <div className="mt-8">
                <MapExplorer />
              </div>
              <ShareEmbed kind="map" />
            </>
          ),
        }}
        database={{
          header: databaseHeader,
          body: (
            <>
              <div className="mt-8">
                <DatabaseExplorer />
              </div>
              <ShareEmbed kind="database" />
            </>
          ),
        }}
      />
      <PlayerDetail />
      <ContactDialog />
    </ExplorerProvider>
  );
}
