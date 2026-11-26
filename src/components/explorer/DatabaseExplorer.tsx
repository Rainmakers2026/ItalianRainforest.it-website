'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import type { PublicPlayer } from '@/lib/data/schema';
import { STATUSES } from '@/lib/data/taxonomy';
import { formatNumber, type Locale } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { Avatar } from './Avatar';
import { DatabaseDownload } from './Downloads';
import { useExplorer, useLoadWhenNear } from './ExplorerProvider';
import { categoryColor, categoryName, locationLabel } from './labels';
import { StatusBadge, WebsiteLink } from './PlayerBits';
import { EmptyState, ErrorState, LoadingState } from './States';
import { ResultsCount, Toolbar } from './Toolbar';

type SortKey = 'name' | 'category' | 'location' | 'industry' | 'status';
const PAGE = 25;

function sorter(key: SortKey, locale: Locale) {
  const coll = new Intl.Collator(locale, { sensitivity: 'base' });
  return (a: PublicPlayer, b: PublicPlayer) => {
    if (key === 'category')
      return coll.compare(categoryName(a.categories[0]!, locale), categoryName(b.categories[0]!, locale)) || coll.compare(a.name, b.name);
    if (key === 'location') {
      const la = locationLabel(a, locale);
      const lb = locationLabel(b, locale);
      if (!la !== !lb) return la ? -1 : 1; // empty last
      return coll.compare(la ?? '', lb ?? '') || coll.compare(a.name, b.name);
    }
    if (key === 'industry') {
      const ia = a.industries[0];
      const ib = b.industries[0];
      if (!ia !== !ib) return ia ? -1 : 1;
      return coll.compare(ia ?? '', ib ?? '') || coll.compare(a.name, b.name);
    }
    if (key === 'status') return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || coll.compare(a.name, b.name);
    return coll.compare(a.name, b.name);
  };
}

function CategoryCell({ p, locale }: { p: PublicPlayer; locale: Locale }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: categoryColor(p.categories[0]!) }} aria-hidden="true" />
      <span>{categoryName(p.categories[0]!, locale)}</span>
      {p.categories.length > 1 && (
        <span
          className="rounded bg-mist px-1 text-xs font-bold text-subtle"
          title={p.categories
            .slice(1)
            .map((c) => categoryName(c, locale))
            .join(', ')}
        >
          +{p.categories.length - 1}
        </span>
      )}
    </span>
  );
}

function LocationCell({ p, locale, demo }: { p: PublicPlayer; locale: Locale; demo: string }) {
  const loc = locationLabel(p, locale);
  if (!loc) return <span className="text-subtle">—</span>;
  return (
    <span className={p.location?.source === 'demo' ? 'text-subtle italic' : ''} title={p.location?.source === 'demo' ? demo : undefined}>
      {loc}
      {p.location?.source === 'demo' && <span aria-hidden="true">*</span>}
      {p.location?.source === 'demo' && <span className="sr-only"> ({demo})</span>}
    </span>
  );
}

export function DatabaseExplorer() {
  const { state, results, filters, locale, t, openPlayer, resetFilters } = useExplorer();
  const root = useRef<HTMLDivElement>(null);
  const tableTop = useRef<HTMLDivElement>(null);
  // null = default order: relevance while searching, otherwise A-Z by name.
  const [userSort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const searching = !!filters.q.trim();
  const sort = useMemo(() => userSort ?? { key: 'name' as SortKey, dir: 1 as const }, [userSort]);
  // Page resets to 0 whenever the result set (filters) changes.
  const [pager, setPager] = useState({ filters, page: 0 });
  const page = pager.filters === filters ? pager.page : 0;
  const setPage = (p: number) => setPager({ filters, page: p });
  useLoadWhenNear(root);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          track('database_view');
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const sorted = useMemo(() => {
    if (!userSort && searching) return results; // already ranked by relevance
    const s = [...results].sort(sorter(sort.key, locale));
    return sort.dir === 1 ? s : s.reverse();
  }, [results, sort, userSort, searching, locale]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const current = sorted.slice(page * PAGE, page * PAGE + PAGE);
  const cols = t.database.columns;

  const goTo = (p: number) => {
    setPage(p);
    tableTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const toggleSort = (key: SortKey) => {
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
    track('database_filter_used', { filter: 'sort', value: key });
  };

  const sortHeader = (k: SortKey, label: string, className = '') => {
    const active = (!!userSort || !searching) && sort.key === k;
    return (
      <th
        key={k}
        scope="col"
        aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
        className={`px-3 py-3 ${className}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 rounded font-bold ${active ? 'text-navy' : 'text-muted hover:text-ink'}`}
        >
          {label}
          <Icon name={active ? (sort.dir === 1 ? 'sortAsc' : 'sortDesc') : 'sort'} size={14} />
          <span className="sr-only">{fmt(t.database.sortBy, { col: label })}</span>
        </button>
      </th>
    );
  };

  return (
    <div ref={root} className="card overflow-clip text-ink shadow-[var(--shadow-pop)]">
      <div className="border-b border-line p-3 md:p-4">
        <Toolbar source="database" extended />
      </div>
      <div
        ref={tableTop}
        className="flex scroll-mt-[calc(var(--header-h)+8px)] flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3"
      >
        <ResultsCount />
        <DatabaseDownload />
      </div>

      {state === 'error' ? (
        <ErrorState />
      ) : state !== 'ready' ? (
        <LoadingState />
      ) : results.length === 0 ? (
        <EmptyState onReset={() => resetFilters('database')} />
      ) : (
        <>
          {/* Desktop: data table */}
          <table className="hidden w-full table-fixed border-collapse text-left text-sm lg:table">
            <caption className="sr-only">{t.database.caption}</caption>
            <colgroup>
              <col className="w-[29%]" />
              <col className="w-[18%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead className="sticky top-[var(--header-h)] z-10 bg-mist text-[0.8125rem]">
              <tr className="border-b border-line">
                {sortHeader('name', cols.name, 'pl-4')}
                {sortHeader('category', cols.category)}
                {sortHeader('location', cols.location)}
                {sortHeader('industry', cols.industry)}
                {sortHeader('status', cols.status)}
                <th scope="col" className="px-3 py-3 pr-4 text-right font-bold text-muted">
                  <span className="sr-only">{cols.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {current.map((p) => (
                <tr key={p.id} className="group border-b border-line last:border-0 hover:bg-savoia-50/60">
                  <td className="py-3 pr-3 pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar player={p} size={34} wide={!!p.logo} />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openPlayer(p.id, 'database')}
                          className="block max-w-full truncate text-left font-bold text-navy hover:text-savoia-700 hover:underline"
                        >
                          {p.name}
                        </button>
                        {p.websiteHost ? (
                          <WebsiteLink p={p} t={t} className="max-w-full truncate text-xs" />
                        ) : (
                          <span className="text-xs text-subtle">—</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <CategoryCell p={p} locale={locale} />
                  </td>
                  <td className="px-3 py-3 text-muted">
                    <LocationCell p={p} locale={locale} demo={t.explorer.demoBadge} />
                  </td>
                  <td className="px-3 py-3 text-muted">
                    <span className="line-clamp-2">
                      {p.industries.slice(0, 2).join(', ') || '—'}
                      {p.industries.length > 2 && <span className="text-subtle"> +{p.industries.length - 2}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge p={p} t={t} />
                  </td>
                  <td className="py-3 pr-4 pl-3 text-right">
                    <button type="button" className="btn btn-outline btn-sm px-3" onClick={() => openPlayer(p.id, 'database')}>
                      {t.explorer.details}
                      <span className="sr-only">: {p.name}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile/tablet: cards */}
          <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:hidden">
            {current.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => openPlayer(p.id, 'database')}
                  className="flex h-full w-full items-start gap-3 rounded-xl border border-line bg-white p-3 text-left hover:border-line-strong"
                >
                  <Avatar player={p} size={40} wide={!!p.logo} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-navy">{p.name}</span>
                    <span className="mt-0.5 block text-[0.8125rem] text-muted">
                      <CategoryCell p={p} locale={locale} />
                    </span>
                    <span className="mt-1 block text-[0.8125rem] text-muted">
                      <LocationCell p={p} locale={locale} demo={t.explorer.demoBadge} />
                    </span>
                    {p.industries.length > 0 && <span className="mt-1 block truncate text-xs text-subtle">{p.industries.slice(0, 3).join(' · ')}</span>}
                    <span className="mt-1.5 block">
                      <StatusBadge p={p} t={t} />
                    </span>
                  </span>
                  <Icon name="arrowRight" size={18} className="mt-1 shrink-0 text-subtle" />
                </button>
              </li>
            ))}
          </ul>

          <nav
            aria-label={fmt(t.database.page, { page: page + 1, pages })}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm"
          >
            <p className="text-muted tabular-nums">
              {fmt(t.database.showing, {
                from: formatNumber(page * PAGE + 1, locale),
                to: formatNumber(Math.min(sorted.length, (page + 1) * PAGE), locale),
                n: formatNumber(sorted.length, locale),
              })}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => goTo(page - 1)}>
                <Icon name="arrowLeft" size={16} />
                {t.database.prev}
              </button>
              <span className="px-1 font-semibold text-navy tabular-nums">{fmt(t.database.page, { page: page + 1, pages })}</span>
              <button type="button" className="btn btn-outline btn-sm" disabled={page >= pages - 1} onClick={() => goTo(page + 1)}>
                {t.database.next}
                <Icon name="arrowRight" size={16} />
              </button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
