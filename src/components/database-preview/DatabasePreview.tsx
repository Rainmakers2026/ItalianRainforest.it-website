'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  activeFilterCount,
  applyQuery,
  buildSearchIndex,
  contactsCsv,
  DEFAULT_QUERY,
  facets,
  isDefaultQuery,
  parseQuery,
  serializeQuery,
  SORT_KEYS,
  type DatabaseQuery,
  type SortKey,
  type ViewMode,
} from '@/lib/database/query';
import { DatabaseResponseSchema, type DatabaseResponse, type PublicContact } from '@/lib/database/types';
import { fmt } from '@/lib/i18n';
import { CountUp } from '../ui/CountUp';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { HeroForest } from '../visuals/HeroForest';
import { countLabel, toneOf, ViewGlyph } from './Bits';
import { ContactDrawer } from './ContactDrawer';
import type { PreviewCopy } from './copy';
import { ActiveFilters, FilterControls, QuickFilters } from './Filters';
import { ContactCards, ContactTable } from './Results';
import { EmptyPanel, ErrorPanel, ResultsSkeleton } from './States';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; db: DatabaseResponse };

/** Rows rendered per step; "show more" reveals the next batch. */
const PAGE_SIZE = 24;

const desktopQuery = '(min-width: 768px)';
const subscribeDesktop = (cb: () => void) => {
  const mq = window.matchMedia(desktopQuery);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

const isTypingTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

const Shimmer = ({ className = '' }: { className?: string }) => (
  <span className={`block animate-pulse rounded-md bg-white/20 motion-reduce:animate-none ${className}`} aria-hidden="true" />
);

/** Live numbers computed from the API payload, never hard-coded. */
function StatsCard({ contacts, types, t }: { contacts: PublicContact[] | null; types: { value: string; count: number }[]; t: PreviewCopy }) {
  const companies = contacts ? new Set(contacts.flatMap((c) => (c.company ? [c.company] : []))).size : 0;
  const investors = types.find((x) => x.value === 'Investor/BA')?.count ?? 0;
  const linkedinPct = contacts?.length ? Math.round((contacts.filter((c) => c.hasLinkedin).length / contacts.length) * 100) : 0;
  const max = Math.max(...types.map((x) => x.count), 1);
  const stats = [
    { label: t.statContacts, value: contacts?.length ?? 0, accent: false },
    { label: t.statCompanies, value: companies, accent: true },
    { label: t.statInvestors, value: investors, accent: false },
    { label: t.statLinkedin, value: linkedinPct, suffix: '%', accent: true },
  ];
  return (
    <aside aria-label={t.statsTitle} className="glass pop-in relative p-6 shadow-[var(--shadow-pop)] sm:p-7">
      <h2 className="text-base font-bold">{t.statsTitle}</h2>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col">
            <dt className="order-2 mt-1.5 text-sm text-white/80">{s.label}</dt>
            <dd
              className={`order-1 text-[clamp(2.1rem,1.6rem+1.6vw,2.9rem)] leading-none font-black tracking-[-0.04em] tabular-nums ${s.accent ? 'text-sky' : ''}`}
            >
              {contacts ? (
                <>
                  <CountUp value={s.value} locale="it-IT" duration={1100} />
                  {s.suffix}
                </>
              ) : (
                <Shimmer className="h-9 w-16" />
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-[0.6875rem] font-bold tracking-[0.16em] text-white/60 uppercase">{t.byType}</p>
      <ul className="mt-3 grid gap-3">
        {contacts
          ? types.map((x) => (
              <li key={x.value} className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3 text-[0.9375rem]">
                <span className="truncate text-white/90">{x.value}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
                  <span
                    className="block h-full origin-left rounded-full transition-[width] duration-700"
                    style={{ width: `${(x.count / max) * 100}%`, background: toneOf(x.value).strip }}
                  />
                </span>
                <span className="text-right font-bold tabular-nums">{x.count}</span>
              </li>
            ))
          : [0, 1].map((i) => <Shimmer key={i} className="h-4 w-full" />)}
      </ul>
    </aside>
  );
}

export function DatabasePreview({ t }: { t: PreviewCopy }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [query, setQuery] = useState<DatabaseQuery>(DEFAULT_QUERY);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(desktopQuery).matches,
    () => true,
  );

  const urlRead = useRef(false);

  // One request per page view: the whole public dataset, then everything runs client-side.
  const fetchDb = useCallback((signal?: AbortSignal) => {
    fetch('/api/database', { signal, headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: unknown) => {
        setLoad({ status: 'ready', db: DatabaseResponseSchema.parse(json) });
        // URL → state once, when there is data to apply it to.
        if (!urlRead.current) {
          urlRead.current = true;
          setQuery(parseQuery(window.location.search));
        }
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name !== 'AbortError') setLoad({ status: 'error' });
      });
  }, []);

  const retry = () => {
    setLoad({ status: 'loading' });
    fetchDb();
  };

  useEffect(() => {
    const ctrl = new AbortController();
    fetchDb(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchDb]);

  // State → URL with replaceState; back/forward → state.
  useEffect(() => {
    const onPop = () => setQuery(parseQuery(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    // The initial placeholder state must not overwrite the incoming URL.
    if (query === DEFAULT_QUERY) return;
    const qs = serializeQuery(query);
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [query]);

  const focusSearch = useCallback(() => {
    const el = searchRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  }, []);

  // "/" jumps to the search from anywhere on the page (unless typing or in a dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      focusSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusSearch]);

  const update = useCallback((patch: Partial<DatabaseQuery>) => {
    setQuery((q) => ({ ...q, ...patch }));
    if (!('view' in patch) && !('sort' in patch)) setLimit(PAGE_SIZE);
  }, []);

  const reset = useCallback(() => {
    setQuery((q) => ({ ...DEFAULT_QUERY, sort: q.sort, view: q.view }));
    setLimit(PAGE_SIZE);
  }, []);

  const contacts = useMemo(() => (load.status === 'ready' ? load.db.data : []), [load]);
  const index = useMemo(() => buildSearchIndex(contacts), [contacts]);
  const facetLists = useMemo(() => facets(contacts), [contacts]);
  // Typing stays responsive on large datasets: filtering runs at lower priority.
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => applyQuery(contacts, deferredQuery, index), [contacts, deferredQuery, index]);
  const visible = useMemo(() => results.slice(0, limit), [results, limit]);
  const selected = useMemo(() => contacts.find((c) => c.id === selectedId) ?? null, [contacts, selectedId]);
  const selectedIndex = selectedId ? results.findIndex((c) => c.id === selectedId) : -1;

  const view: ViewMode = query.view ?? (isDesktop ? 'table' : 'cards');
  const nFilters = activeFilterCount(query);
  const closeDrawer = useCallback(() => setSelectedId(null), []);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const step = (delta: number) => {
    const next = results[selectedIndex + delta];
    if (!next) return;
    setSelectedId(next.id);
    // Keep the highlighted row reachable in the list behind the drawer.
    if (selectedIndex + delta >= limit) setLimit((l) => l + PAGE_SIZE);
  };

  const downloadCsv = () => {
    const blob = new Blob([contactsCsv(results)], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `database-contatti-demo-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  };

  const ready = load.status === 'ready';
  const filterProps = { query, update, types: facetLists.types, companies: facetLists.companies, t };

  return (
    <>
      {/* Hero: IRF blue forest, search first, one-tap filters, live numbers. */}
      <section aria-labelledby="db-title" className="on-dark relative isolate overflow-hidden text-white">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_78%_8%,rgb(159_227_245/0.35)_0%,transparent_60%),radial-gradient(70%_70%_at_15%_20%,rgb(123_146_232/0.45)_0%,transparent_60%),linear-gradient(180deg,#2c4f9c_0%,#3a5ec4_38%,#2a4c8f_72%,#1b3a5c_100%)]"
        />
        <HeroForest className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[170px] w-full min-w-[900px] opacity-70 md:h-[230px]" />

        <div className="container-irf grid items-center gap-10 pt-12 pb-[clamp(96px,13vw,150px)] md:pt-16 lg:grid-cols-[1.3fr_0.7fr] lg:gap-14">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex min-h-8 items-center rounded-full bg-white/10 px-3.5 text-[0.75rem] font-bold tracking-[0.16em] text-white uppercase ring-1 ring-white/20">
                {t.eyebrow}
              </span>
              <span className="inline-flex min-h-8 items-center gap-2 rounded-full bg-[#fff6e0] px-3.5 text-sm font-bold text-[#6b4a00]">
                <span className="size-2 animate-pulse rounded-full bg-[#d99a00] motion-reduce:animate-none" aria-hidden="true" />
                {t.demoBadge}
              </span>
              <span className="text-sm font-semibold text-white/85">
                {ready ? countLabel(load.db.total, t.contactsOne, t.contacts) : ' '}
              </span>
            </div>

            <h1 id="db-title" className="display mt-5">
              {t.titleLead}
              <span className="bg-[linear-gradient(120deg,#ffffff_0%,#c9d7ff_35%,#9fe3f5_100%)] bg-clip-text text-transparent">
                {t.titleAccent}
              </span>
            </h1>
            <p className="lead mt-4 max-w-2xl text-white/90">{t.subtitle}</p>

            <form role="search" className="group relative mt-8 max-w-2xl" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="db-search" className="sr-only">
                {t.searchLabel}
              </label>
              <Icon
                name="search"
                size={22}
                className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-savoia transition-transform group-focus-within:scale-110"
              />
              <input
                ref={searchRef}
                id="db-search"
                type="search"
                value={query.q}
                onChange={(e) => update({ q: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && query.q) {
                    e.preventDefault();
                    update({ q: '' });
                  }
                }}
                placeholder={t.searchPlaceholder}
                autoComplete="off"
                spellCheck={false}
                className="h-16 w-full rounded-2xl bg-white pr-16 pl-14 text-[1.0625rem] text-ink shadow-[0_24px_50px_-20px_rgb(10_24_40/0.75)] ring-4 ring-white/15 transition-shadow outline-none placeholder:text-subtle focus-visible:ring-sky/70 [&::-webkit-search-cancel-button]:hidden"
              />
              {query.q ? (
                <button
                  type="button"
                  onClick={() => {
                    update({ q: '' });
                    searchRef.current?.focus();
                  }}
                  className="absolute top-1/2 right-3 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-mist hover:text-ink"
                  aria-label={t.clearSearch}
                >
                  <Icon name="x" size={18} />
                </button>
              ) : (
                <kbd
                  className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 rounded-md bg-mist px-2 py-0.5 font-sans text-xs font-bold text-subtle ring-1 ring-line md:block"
                  title={t.shortcutHint}
                >
                  /
                </kbd>
              )}
            </form>

            <div className="mt-5 min-h-10">{ready && <QuickFilters query={query} update={update} types={facetLists.types} t={t} />}</div>
          </div>

          <StatsCard contacts={ready ? contacts : null} types={facetLists.types} t={t} />
        </div>
      </section>

      <div className="bg-[linear-gradient(180deg,var(--color-sky-50)_0%,var(--color-sky-50)_220px,#fff_640px)]">
        <div className="container-irf pb-16">
          {/* Sticky results bar: always one tap from count, sort, view and export. */}
          <div className="sticky top-3 z-30 -mt-8 flex flex-wrap items-center gap-2.5 rounded-2xl bg-white/90 p-2.5 shadow-[var(--shadow-card)] ring-1 ring-line backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="btn btn-outline btn-sm min-h-11 lg:hidden"
              disabled={!ready}
            >
              <Icon name="filter" size={16} />
              {t.filters}
              {nFilters > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-savoia px-1.5 text-[0.6875rem] text-white">
                  {nFilters}
                </span>
              )}
            </button>
            <p className="mr-auto flex items-baseline gap-1.5 pl-2 text-[0.9375rem] font-bold text-navy" aria-live="polite" aria-atomic="true">
              {ready ? (
                <>
                  <span className="size-2 self-center rounded-full bg-[linear-gradient(140deg,#7b92e8,#2596be)]" aria-hidden="true" />
                  {countLabel(results.length, t.resultsOne, t.results)}
                </>
              ) : (
                ' '
              )}
            </p>

            <button
              type="button"
              onClick={focusSearch}
              className="inline-flex size-11 items-center justify-center rounded-xl text-muted hover:bg-mist hover:text-ink md:size-10"
              aria-label={t.jumpToSearch}
              title={t.shortcutHint}
            >
              <Icon name="search" size={18} />
            </button>

            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="hidden xl:inline">{t.sortLabel}</span>
              <select
                value={query.sort}
                onChange={(e) => update({ sort: e.target.value as SortKey })}
                className="field min-h-11 w-auto border-line py-1.5 text-sm font-semibold md:min-h-10"
                aria-label={t.sortLabel}
              >
                {SORT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t.sorts[k]}
                  </option>
                ))}
              </select>
            </label>

            <div role="group" aria-label={t.viewLabel} className="flex rounded-xl bg-mist p-1 ring-1 ring-line ring-inset">
              {(['table', 'cards'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => update({ view: v })}
                  aria-pressed={view === v}
                  title={v === 'table' ? t.viewTable : t.viewCards}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-all duration-200 ${
                    view === v ? 'bg-savoia text-white shadow-[var(--shadow-glow)]' : 'text-muted hover:text-ink'
                  }`}
                >
                  <ViewGlyph name={v} />
                  <span className="sr-only md:not-sr-only">{v === 'table' ? t.viewTable : t.viewCards}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={downloadCsv}
              disabled={!ready || !results.length}
              className="btn btn-primary btn-sm min-h-11 md:min-h-10"
              title={fmt(t.downloadCsvHint, { n: results.length })}
            >
              <Icon name="download" size={16} />
              <span className="sr-only sm:not-sr-only">{t.downloadCsv}</span>
            </button>
          </div>

          {!isDefaultQuery(query) && (
            <div className="pop-in mt-4">
              <ActiveFilters query={query} update={update} onReset={reset} t={t} />
            </div>
          )}

          <div className="mt-6 grid gap-8 lg:grid-cols-[264px_minmax(0,1fr)]">
            {/* Desktop filters */}
            <aside className="hidden lg:block" aria-label={t.filters}>
              <div className="sticky top-[92px] rounded-[var(--radius-card)] bg-white p-5 shadow-[0_1px_2px_rgb(14_33_54/0.06)] ring-1 ring-line">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-extrabold text-navy">
                    <span className="icon-tile size-8 rounded-lg">
                      <Icon name="filter" size={16} />
                    </span>
                    {t.filters}
                  </h2>
                  {nFilters > 0 && (
                    <button type="button" onClick={reset} className="text-sm font-bold text-savoia-700 hover:underline">
                      {t.resetFilters}
                    </button>
                  )}
                </div>
                {ready ? (
                  <FilterControls {...filterProps} />
                ) : (
                  <div className="grid gap-3" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, i) => (
                      <span key={i} className="block h-6 animate-pulse rounded-md bg-line/60 motion-reduce:animate-none" />
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <div className="grid min-w-0 content-start gap-5">
              {load.status === 'loading' && <ResultsSkeleton t={t} />}
              {load.status === 'error' && <ErrorPanel onRetry={retry} t={t} />}
              {ready &&
                (results.length === 0 ? (
                  <EmptyPanel onReset={reset} t={t} />
                ) : (
                  <>
                    {view === 'table' ? (
                      <ContactTable contacts={visible} onOpen={setSelectedId} selectedId={selectedId} t={t} />
                    ) : (
                      <ContactCards contacts={visible} onOpen={setSelectedId} selectedId={selectedId} t={t} />
                    )}
                    {results.length > visible.length && (
                      <div className="flex justify-center pt-2">
                        <button type="button" className="btn btn-outline" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                          {fmt(t.showMore, { n: Math.min(PAGE_SIZE, results.length - visible.length) })}
                          <Icon name="chevronDown" size={18} />
                        </button>
                      </div>
                    )}
                  </>
                ))}

              <p className="flex items-start gap-2 pt-4 text-[0.8125rem] text-subtle">
                <Icon name="info" size={16} className="mt-0.5 shrink-0" />
                {t.previewNotice}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile / tablet filters: bottom sheet */}
      <Dialog open={filtersOpen} onClose={closeFilters} title={t.filtersTitle} closeLabel={t.close} variant="drawer" labelledBy="db-filters-title">
        <div className="grid gap-6 pb-2">
          <FilterControls {...filterProps} />
          <div className="sticky bottom-0 -mx-5 -mb-5 flex gap-3 border-t border-line bg-white px-5 py-4">
            <button type="button" className="btn btn-outline flex-1" onClick={reset} disabled={nFilters === 0}>
              {t.resetFilters}
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={closeFilters}>
              {fmt(t.showResults, { n: results.length })}
            </button>
          </div>
        </div>
      </Dialog>

      <ContactDrawer
        contact={selected}
        onClose={closeDrawer}
        nav={{ index: selectedIndex, total: results.length, onPrev: () => step(-1), onNext: () => step(1) }}
        t={t}
      />
    </>
  );
}
