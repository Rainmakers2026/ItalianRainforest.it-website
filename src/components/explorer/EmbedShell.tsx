'use client';

import type { Locale } from '@/lib/i18n/config';
import { serializeFilters } from '@/lib/filters';
import { SITE } from '@/lib/site';
import { LogoMark } from '../Logo';
import { Icon } from '../ui/Icon';
import { DatabaseExplorer } from './DatabaseExplorer';
import { useExplorer } from './ExplorerProvider';
import { MapExplorer } from './MapExplorer';
import { LeadGate } from './LeadGate';
import { PlayerDetail } from './PlayerDetail';
import { UpdatedStamp } from './States';

/** Minimal chrome for third-party embeds: discreet IRF branding and a link back. */
export function EmbedShell({ kind, locale, credit }: { kind: 'map' | 'database'; locale: Locale; credit: string }) {
  const { filters } = useExplorer();
  const qs = serializeFilters(filters).toString();
  const href = `${SITE.url}/${locale}${qs ? `?${qs}` : ''}#${kind}`;
  return (
    <div className="flex min-h-dvh flex-col gap-2 bg-white p-2 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <a href={href} target="_blank" rel="noopener" className="inline-flex items-center gap-2 text-sm font-extrabold text-navy">
          <LogoMark size={24} />
          Italian Rainforest
        </a>
        <div className="flex items-center gap-3">
          <UpdatedStamp className="hidden sm:inline-flex" />
          <a
            href={href}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-xs font-bold text-savoia-700 underline underline-offset-4"
          >
            {credit}
            <Icon name="external" size={13} />
          </a>
        </div>
      </div>
      {kind === 'map' ? <MapExplorer height="max(380px, calc(100dvh - 230px))" /> : <DatabaseExplorer />}
      <PlayerDetail />
      <LeadGate />
    </div>
  );
}
