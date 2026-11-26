'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getUtm, track } from '@/lib/analytics';
import { CATEGORY_BY_KEY, type CategoryKey } from '@/lib/data/taxonomy';
import { activeFilterCount, serializeFilters } from '@/lib/filters';
import { formatDate, formatNumber } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n';
import type { LeadProfile } from '@/lib/lead-profile';
import { SITE } from '@/lib/site';
import { newRequestId, originOf, pageLocale, recordGatedEvent, type Origin } from '@/lib/submission';
import { Dialog } from '../ui/Dialog';
import { Icon, type IconName } from '../ui/Icon';
import { useExplorer, type LeadReason } from './ExplorerProvider';
import { regionName } from './labels';
import type { PdfMeta, PdfTable } from './pdfExport';

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
/** Data files the user can download. */
export type FileFormat = 'csv' | 'xlsx';
type Format = FileFormat | 'table';
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Pay-per-data downloads: the complete database or the filtered results (exactly the
 * results on screen, map or database), as CSV UTF-8 or Excel, plus the filtered map as PNG
 * or PDF. Every data file comes from /api/download, built on the server from the public
 * dataset with the column structure of the Rainmakers OS master (CLAUDE.md "Downloads").
 * Browsing is free; the first download asks for the one-time sign-up.
 */
export function useDownloads(section: 'map' | 'database') {
  const { t, filters, results, locale, downloadRequiresEmail, requireLead, mapRef, updatedAt } = useExplorer();
  const [status, setStatus] = useState<Status>('idle');
  // The "done" note clears itself; a newer action cancels that timer, so it can never
  // overwrite the newer state (e.g. hide an error).
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (clearTimer.current && clearTimeout(clearTimer.current)), []);

  const query = (all: boolean) => {
    const sp = all ? new URLSearchParams() : serializeFilters(filters);
    sp.set('scope', all ? 'all' : 'filtered');
    sp.set('locale', locale);
    return sp;
  };

  /** One user action: its reason, provenance and idempotency key (shared by sign-up → event). */
  type Action = { reason: LeadReason; origin: Origin; requestId: string };
  type Run = (p: LeadProfile | null, a: Action) => Promise<void>;
  /** Sign-up (when required) → download. Each download of a signed-up visitor is recorded. */
  const gate = (reason: LeadReason, cta: string, run: Run) => {
    track('database_download_click', { reason, rows: results.length });
    const action: Action = { reason, origin: originOf(section, cta), requestId: newRequestId() };
    const go = async (p: LeadProfile | null) => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = null;
      setStatus('busy');
      try {
        await run(p, action);
        setStatus('done');
        clearTimer.current = setTimeout(() => setStatus('idle'), 3500);
      } catch {
        setStatus('error');
      }
    };
    if (!downloadRequiresEmail) return void go(null);
    requireLead(reason, (p) => void go(p), { origin: action.origin });
  };

  /** The file (CSV / XLSX) or, for "table", its rows in the master structure, from the server. */
  const request = async (format: Format, all: boolean, p: LeadProfile | null, a: Action) => {
    const sp = query(all);
    const res = p
      ? await fetch('/api/download', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: p.email,
            firstName: p.firstName,
            lastName: p.lastName,
            ...(p.referent ? { referent: p.referent } : {}),
            ...(p.registrationId ? { registrationId: p.registrationId } : {}),
            company: p.company ?? '',
            consent: true,
            format,
            query: sp.toString(),
            reason: a.reason === 'embed' ? undefined : a.reason,
            requestId: a.requestId,
            origin: a.origin,
            // The real page language (the explorer is in English on both home pages).
            locale: pageLocale(),
            utm: getUtm(),
            company_url: '',
            elapsed: Math.round(performance.now()),
          }),
        })
      : await fetch(`/api/download?${sp}&format=${format}`);
    if (!res.ok) throw new Error(String(res.status));
    return res;
  };

  const data = (format: FileFormat, { all = false, reason, cta }: { all?: boolean; reason?: LeadReason; cta: string }) =>
    gate(all ? 'download_bulk' : (reason ?? (format === 'csv' ? 'download_csv' : 'download_xlsx')), cta, async (p, a) => {
      const res = await request(format, all, p, a);
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `Italian_Rainforest_Database.${format}`;
      saveBlob(await res.blob(), name);
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

  const mapPng = (cta: string) =>
    gate('map_png', cta, async (p, a) => {
      const png = await renderMap();
      // Drawn in the browser: recorded only once the file exists, before it is handed over.
      if (p) await recordGatedEvent(p, { reason: 'map_png', origin: a.origin, requestId: a.requestId, rowCount: results.length, filterQuery: query(false).toString() });
      saveBlob(png, `italian-rainforest-map-${today()}.png`);
      track('database_download_success', { format: 'png', rows: results.length });
    });

  const mapPdf = (cta: string) =>
    gate('map_pdf', cta, async (p, a) => {
      // 1. The map image first: if the map cannot be drawn, nothing is requested or recorded.
      const png = await renderMap();
      // 2. The list of the filtered players (not recorded by itself).
      const [{ exportMapPdf }, rows] = await Promise.all([import('./pdfExport'), request('table', false, p, a).then((r) => r.json() as Promise<PdfTable>)]);
      const meta: PdfMeta = {
        title: `Italian Rainforest — ${fmt(t.explorer.results, { n: formatNumber(rows.rows.length, locale) })}`,
        subtitle: filterSummary(),
        footer: footer(),
      };
      const pdf = await exportMapPdf(png, rows, meta);
      // 3. The PDF exists: recorded (EVENT, MAP_PDF) before it is handed over; no file if this fails.
      if (p) await recordGatedEvent(p, { reason: 'map_pdf', origin: a.origin, requestId: a.requestId, rowCount: rows.rows.length, filterQuery: query(false).toString() });
      saveBlob(pdf, `italian-rainforest-map-${today()}.pdf`);
      track('database_download_success', { format: 'map_pdf', rows: rows.rows.length });
    });

  return { status, data, mapPng, mapPdf };
}

/**
 * Preparing / done / error of the last download. `compact`: the mobile toolbar version —
 * a full-width line under the buttons (always in the DOM, so the live region announces it).
 */
function StatusNote({ status, compact = false }: { status: Status; compact?: boolean }) {
  const { t } = useExplorer();
  return (
    <span
      aria-live="polite"
      data-download-status={status}
      // Idle: visually hidden but kept in the accessibility tree, so the change is announced.
      className={compact ? `basis-full text-right text-xs font-semibold ${status === 'idle' ? 'sr-only' : ''}` : 'text-[0.8125rem] font-semibold'}
    >
      {status === 'busy' && (
        <span className="inline-flex items-center gap-1 text-muted">
          {compact && <Icon name="download" size={13} />}
          {t.download.preparing}
        </span>
      )}
      {status === 'done' && (
        <span className="inline-flex items-center gap-1 text-success">
          <Icon name="check" size={compact ? 13 : 15} />
          {t.download.success}
        </span>
      )}
      {status === 'error' && (
        <span className="inline-flex items-center gap-1 text-danger">
          {compact && <Icon name="info" size={13} />}
          {t.download.error}
        </span>
      )}
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

/** Map: the filtered results (CSV, Excel, the map itself as PNG / PDF) and the complete database. */
export function MapDownloads({ compact = false }: { compact?: boolean }) {
  const { t, results, players, state, locale } = useExplorer();
  const d = useDownloads('map');
  const busy = state !== 'ready' || d.status === 'busy';
  const f = t.database.formats;
  // CTA = which menu (compact toolbar or panel) and which item.
  const at = compact ? 'toolbar_' : 'panel_';
  const filtered: MenuItem[] = [
    { key: 'csv', label: f.csv, hint: f.csvHint, icon: 'download', run: () => d.data('csv', { reason: 'map_csv', cta: `${at}filtered_csv` }) },
    { key: 'xlsx', label: f.xlsx, hint: f.xlsxHint, icon: 'download', run: () => d.data('xlsx', { cta: `${at}filtered_xlsx` }) },
    { key: 'map-png', label: f.mapPng, hint: f.mapPngHint, icon: 'map', run: () => d.mapPng(`${at}filtered_map_png`) },
    { key: 'map-pdf', label: f.mapPdf, hint: f.mapPdfHint, icon: 'map', run: () => d.mapPdf(`${at}filtered_map_pdf`) },
  ];
  const full: MenuItem[] = [
    { key: 'csv', label: f.csv, hint: f.csvHint, icon: 'download', run: () => d.data('csv', { all: true, cta: `${at}full_csv` }) },
    { key: 'xlsx', label: f.xlsx, hint: f.xlsxHint, icon: 'download', run: () => d.data('xlsx', { all: true, cta: `${at}full_xlsx` }) },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.database.download}>
      {!compact && <StatusNote status={d.status} />}
      <DownloadMenu
        label={t.database.downloadFiltered}
        count={compact ? undefined : formatNumber(results.length, locale)}
        items={filtered}
        disabled={busy || !results.length}
        align="left"
      />
      <DownloadMenu
        label={compact ? t.database.downloadFullShort : t.database.downloadFull}
        count={compact ? undefined : formatNumber(players.length, locale)}
        items={full}
        disabled={busy}
        primary
        align={compact ? 'right' : 'left'}
      />
      {compact && <StatusNote status={d.status} compact />}
    </div>
  );
}

type Scope = 'filtered' | 'all';

/** One choice card of the download dialog (native radio, styled as a card). */
function Choice({
  name,
  value,
  checked,
  disabled,
  onChange,
  title,
  hint,
  badge,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  hint?: string;
  badge?: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${
        disabled ? 'cursor-not-allowed border-line bg-mist/40 opacity-60' : checked ? 'cursor-pointer border-savoia bg-savoia-50' : 'cursor-pointer border-line hover:bg-mist/60'
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} className="mt-1 size-4 accent-savoia" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 font-bold text-ink">
          {title}
          {badge && <span className="rounded-full bg-white px-2 text-xs font-semibold text-savoia-700 tabular-nums ring-1 ring-savoia-100">{badge}</span>}
        </span>
        {hint && <span className="mt-0.5 block text-sm text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * Database section: one "Scarica database" button. The dialog lets the user pick the
 * complete database or the filtered results (with the number of players of each) and
 * CSV or Excel. With active filters the filtered download is preselected; with no
 * results it is disabled and a message explains why.
 */
export function DatabaseDownload() {
  const { t, filters, results, players, state, locale } = useExplorer();
  const d = useDownloads('database');
  const c = t.database.downloadDialog;
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [format, setFormat] = useState<FileFormat>('csv');
  const titleId = useId();
  const scopeName = useId();
  const formatName = useId();
  const hasFilters = activeFilterCount(filters) > 0;
  const noResults = results.length === 0;
  const busy = state !== 'ready' || d.status === 'busy';

  const openDialog = () => {
    // Default: the filtered results when filters are active (and there is something to export).
    setScope(hasFilters && !noResults ? 'filtered' : 'all');
    setOpen(true);
  };
  const chosen = scope === 'filtered' && noResults ? 'all' : scope;
  const count = chosen === 'all' ? players.length : results.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusNote status={d.status} />
      <button type="button" className="btn btn-primary btn-sm min-h-10 gap-2 rounded-full px-4" onClick={openDialog} disabled={busy} aria-haspopup="dialog">
        <Icon name="download" size={16} />
        {t.database.downloadDatabase}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} closeLabel={c.cancel} labelledBy={titleId} bare>
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-[1.75rem] leading-tight font-extrabold text-navy">
            {c.title}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="-mt-1 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist hover:text-ink"
            aria-label={c.cancel}
          >
            <Icon name="x" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">{c.lead}</p>

        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-bold tracking-wide text-subtle uppercase">{c.scopeLabel}</legend>
          <div className="grid gap-2">
            <Choice
              name={scopeName}
              value="filtered"
              checked={chosen === 'filtered'}
              disabled={noResults}
              onChange={() => setScope('filtered')}
              title={c.filtered}
              hint={hasFilters ? c.filteredHint : c.filteredHintNone}
              badge={fmt(c.players, { n: formatNumber(results.length, locale) })}
            />
            <Choice
              name={scopeName}
              value="all"
              checked={chosen === 'all'}
              onChange={() => setScope('all')}
              title={c.full}
              hint={c.fullHint}
              badge={fmt(c.players, { n: formatNumber(players.length, locale) })}
            />
          </div>
          {noResults && (
            <p role="status" className="mt-2 flex items-start gap-1.5 text-sm text-muted">
              <Icon name="info" size={15} className="mt-0.5 shrink-0" />
              {c.noResults}
            </p>
          )}
        </fieldset>

        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-bold tracking-wide text-subtle uppercase">{c.formatLabel}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice name={formatName} value="csv" checked={format === 'csv'} onChange={() => setFormat('csv')} title={c.csv} hint={c.csvHint} />
            <Choice name={formatName} value="xlsx" checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} title={c.xlsx} hint={c.xlsxHint} />
          </div>
        </fieldset>

        <p className="mt-4 flex items-start gap-1.5 text-xs text-subtle">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          {c.note}
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
            {c.cancel}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || count === 0}
            onClick={() => {
              setOpen(false);
              d.data(format, { all: chosen === 'all', cta: `dialog_${chosen}_${format}` });
            }}
          >
            <Icon name="download" size={16} />
            {fmt(c.confirm, { format: format === 'csv' ? 'CSV' : 'Excel', n: formatNumber(count, locale) })}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
