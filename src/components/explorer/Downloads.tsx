'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getUtm, track } from '@/lib/analytics';
import type { PublicPlayer } from '@/lib/data/schema';
import { CATEGORY_BY_KEY, type CategoryKey } from '@/lib/data/taxonomy';
import { serializeFilters } from '@/lib/filters';
import { formatDate, formatNumber } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n';
import type { LeadProfile } from '@/lib/lead-profile';
import { SITE } from '@/lib/site';
import { Icon, type IconName } from '../ui/Icon';
import { useExplorer, type LeadReason } from './ExplorerProvider';
import { regionName } from './labels';
import type { PdfMeta, PdfRow } from './pdfExport';

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

type Status = 'idle' | 'busy' | 'done' | 'error';
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Pay-per-data downloads: filtered CSV / JSON / PDF, the whole database, and the
 * filtered map as PNG or PDF. Browsing is free; the first download asks for the
 * one-time sign-up, afterwards files download straight away (also in later visits).
 */
export function useDownloads() {
  const { t, filters, results, players, locale, downloadRequiresEmail, requireLead, mapRef, updatedAt } = useExplorer();
  const [status, setStatus] = useState<Status>('idle');

  const query = (all: boolean) => {
    const sp = all ? new URLSearchParams() : serializeFilters(filters);
    sp.set('locale', locale);
    return sp;
  };

  const gate = (reason: LeadReason, run: (p: LeadProfile | null) => Promise<void>) => {
    track('database_download_click', { reason, rows: results.length });
    const go = async (p: LeadProfile | null) => {
      setStatus('busy');
      try {
        await run(p);
        setStatus('done');
        setTimeout(() => setStatus('idle'), 3500);
      } catch {
        setStatus('error');
      }
    };
    if (!downloadRequiresEmail) return void go(null);
    requireLead(reason, (p) => void go(p));
  };

  const data = (format: 'csv' | 'json', all = false, reason: LeadReason = format === 'csv' ? 'download_csv' : 'download_json') =>
    gate(all ? 'download_bulk' : reason, async (p) => {
      const sp = query(all);
      if (!p) {
        sp.set('format', format);
        const a = document.createElement('a');
        a.href = `/api/download?${sp}`;
        a.download = '';
        a.click();
        return;
      }
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: p.email,
          firstName: p.firstName,
          lastName: p.lastName,
          referent: p.referent,
          company: p.company,
          consent: true,
          format,
          query: sp.toString(),
          locale,
          utm: getUtm(),
          company_url: '',
          elapsed: Math.round(performance.now()),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `italian-rainforest.${format}`;
      saveBlob(await res.blob(), all ? name.replace('italian-rainforest-', 'italian-rainforest-full-') : name);
      track('database_download_success', { format, all, rows: Number(res.headers.get('x-row-count') ?? 0) });
    });

  const legend = useMemo(() => {
    const counts = new Map<CategoryKey, number>();
    for (const p of results) for (const c of p.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ label: CATEGORY_BY_KEY[k].label[locale], color: CATEGORY_BY_KEY[k].color, count: formatNumber(n, locale) }));
  }, [results, locale]);

  const filterSummary = () => {
    const parts = [
      filters.q.trim() && `“${filters.q.trim()}”`,
      ...filters.categories.map((c) => CATEGORY_BY_KEY[c].label[locale]),
      filters.region && regionName(filters.region, locale),
      filters.city,
      filters.industry,
      filters.status !== 'all' && t.explorer.statusLabels[filters.status],
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : t.map.exportAll;
  };
  const footer = () =>
    `${SITE.url.replace(/^https?:\/\//, '')} · ${fmt(t.explorer.updated, { date: formatDate(updatedAt) })} · copyleft, non-commercial`;

  const pdfRows = (list: PublicPlayer[]): PdfRow[] =>
    list.map((p) => ({
      name: p.name,
      type: p.categories.map((c) => CATEGORY_BY_KEY[c].short[locale]).join(', '),
      city: p.location?.city ?? '',
      region: p.location?.region ? regionName(p.location.region, locale) : '',
      industry: p.industries.join(', '),
      website: p.websiteHost ?? '',
      status: t.explorer.statusLabels[p.status],
    }));
  const pdfMeta = (list: PublicPlayer[], subtitle: string): PdfMeta => ({
    title: `Italian Rainforest — ${fmt(t.explorer.results, { n: formatNumber(list.length, locale) })}`,
    subtitle,
    footer: footer(),
    columns: t.database.pdfColumns,
  });

  const pdf = (all = false) =>
    gate('download_pdf', async () => {
      const list = all ? players : results;
      const { exportDatabasePdf } = await import('./pdfExport');
      const blob = await exportDatabasePdf(pdfRows(list), pdfMeta(list, all ? t.map.exportAll : filterSummary()));
      saveBlob(blob, `italian-rainforest-${all ? 'full-' : ''}${today()}.pdf`);
      track('database_download_success', { format: 'pdf', all, rows: list.length });
    });

  const renderMap = async () => {
    const map = mapRef.current;
    if (!map) throw new Error('map not ready');
    const { exportMapPng } = await import('./mapExport');
    return exportMapPng(map, {
      title: `Italian Rainforest — ${fmt(t.explorer.results, { n: formatNumber(results.length, locale) })}`,
      subtitle: filterSummary(),
      legend,
      footer: `${footer()} · © ISTAT / openpolis · Natural Earth · MapLibre`,
    });
  };

  const mapPng = () =>
    gate('map_png', async () => {
      saveBlob(await renderMap(), `italian-rainforest-map-${today()}.png`);
      track('database_download_success', { format: 'png', rows: results.length });
    });

  const mapPdf = () =>
    gate('map_pdf', async () => {
      const png = await renderMap();
      const { exportMapPdf } = await import('./pdfExport');
      const blob = await exportMapPdf(png, pdfRows(results), pdfMeta(results, filterSummary()));
      saveBlob(blob, `italian-rainforest-map-${today()}.pdf`);
      track('database_download_success', { format: 'map_pdf', rows: results.length });
    });

  return { status, data, pdf, mapPng, mapPdf };
}

function StatusNote({ status }: { status: Status }) {
  const { t } = useExplorer();
  return (
    <span aria-live="polite" className="text-[0.8125rem] font-semibold">
      {status === 'busy' && <span className="text-muted">{t.download.preparing}</span>}
      {status === 'done' && (
        <span className="inline-flex items-center gap-1 text-success">
          <Icon name="check" size={15} />
          {t.download.success}
        </span>
      )}
      {status === 'error' && <span className="text-danger">{t.download.error}</span>}
    </span>
  );
}

type MenuItem = { key: string; label: string; hint?: string; icon: IconName; run: () => void };

/** Button that opens a small menu of formats. Closes on outside click, Escape and selection. */
function DownloadMenu({
  label,
  count,
  items,
  primary = false,
  disabled = false,
  align = 'right',
}: {
  label: string;
  count?: string;
  items: MenuItem[];
  primary?: boolean;
  disabled?: boolean;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className={`btn btn-sm min-h-10 gap-2 rounded-full px-4 ${primary ? 'btn-primary' : 'btn-outline'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="download" size={16} />
        {label}
        {count && <span className={`rounded-full px-1.5 text-xs tabular-nums ${primary ? 'bg-white/20' : 'bg-savoia-50 text-savoia-700'}`}>{count}</span>}
        <Icon name="chevronDown" size={15} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={`pop-in absolute top-[calc(100%+6px)] z-30 w-60 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-[0_18px_40px_-16px_rgb(20_48_79/0.45)] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.run();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink outline-none hover:bg-savoia-50 focus-visible:bg-savoia-50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-savoia-700">
                <Icon name={it.icon} size={16} />
              </span>
              <span className="min-w-0">
                <span className="block">{it.label}</span>
                {it.hint && <span className="block text-xs font-normal text-subtle">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useMenus(withMap: boolean) {
  const { t, results, players, state, locale } = useExplorer();
  const d = useDownloads();
  const busy = state !== 'ready' || d.status === 'busy';
  const f = t.database.formats;
  const filtered: MenuItem[] = [
    { key: 'csv', label: f.csv, hint: f.csvHint, icon: 'download', run: () => d.data('csv', false, withMap ? 'map_csv' : 'download_csv') },
    { key: 'json', label: f.json, hint: f.jsonHint, icon: 'code', run: () => d.data('json') },
    { key: 'pdf', label: f.pdf, hint: f.pdfHint, icon: 'list', run: () => d.pdf() },
    ...(withMap
      ? [
          { key: 'map-png', label: f.mapPng, hint: f.mapPngHint, icon: 'map' as IconName, run: d.mapPng },
          { key: 'map-pdf', label: f.mapPdf, hint: f.mapPdfHint, icon: 'map' as IconName, run: d.mapPdf },
        ]
      : []),
  ];
  const full: MenuItem[] = [
    { key: 'csv', label: f.csv, hint: f.csvHint, icon: 'download', run: () => d.data('csv', true) },
    { key: 'json', label: f.json, hint: f.jsonHint, icon: 'code', run: () => d.data('json', true) },
    { key: 'pdf', label: f.pdf, hint: f.pdfHint, icon: 'list', run: () => d.pdf(true) },
  ];
  return {
    status: d.status,
    busy,
    filtered,
    full,
    filteredCount: formatNumber(results.length, locale),
    fullCount: formatNumber(players.length, locale),
    noResults: !results.length,
    t,
  };
}

/** Database: the filtered results and the whole database, each in CSV / JSON / PDF. */
export function DownloadButtons() {
  const m = useMenus(false);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={m.t.database.download}>
      <StatusNote status={m.status} />
      <DownloadMenu label={m.t.database.downloadFiltered} count={m.filteredCount} items={m.filtered} disabled={m.busy || m.noResults} />
      <DownloadMenu label={m.t.database.downloadFull} count={m.fullCount} items={m.full} disabled={m.busy} primary />
    </div>
  );
}

/** Map: same two menus; the filtered one also offers the map itself (PNG, PDF). */
export function MapDownloads({ compact = false }: { compact?: boolean }) {
  const m = useMenus(true);
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={m.t.database.download}>
      {!compact && <StatusNote status={m.status} />}
      <DownloadMenu label={m.t.database.downloadFiltered} items={m.filtered} disabled={m.busy || m.noResults} align="left" />
      <DownloadMenu label={compact ? m.t.database.downloadFullShort : m.t.database.downloadFull} items={m.full} disabled={m.busy} primary align={compact ? 'right' : 'left'} />
    </div>
  );
}
