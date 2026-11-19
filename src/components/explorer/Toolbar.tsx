'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { REGIONS } from '@/lib/geo/territories';
import { CATEGORY_BY_KEY, CATEGORY_FAMILIES, STATUSES, type CategoryKey } from '@/lib/data/taxonomy';
import { activeFilterCount, facetCounts, type Filters } from '@/lib/filters';
import { formatNumber } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { CategoryBar } from './CategoryBar';
import { useExplorer } from './ExplorerProvider';
import { regionName } from './labels';

type Source = 'map' | 'database';

function SearchBox({ source }: { source: Source }) {
  const { filters, setFilters, t, results } = useExplorer();
  const [value, setValue] = useState(filters.q);
  const id = useId();
  const committed = useRef(filters.q);

  // Keep in sync when the query changes elsewhere (other section, reset, back button).
  useEffect(() => {
    if (filters.q !== committed.current) {
      committed.current = filters.q;
      setValue(filters.q);
    }
  }, [filters.q]);

  useEffect(() => {
    if (value === committed.current) return;
    const h = setTimeout(() => {
      committed.current = value;
      setFilters({ q: value }, source);
    }, 200);
    return () => clearTimeout(h);
  }, [value, setFilters, source]);

  // Search analytics without the query text itself (may contain personal data).
  const resultsCount = results.length;
  useEffect(() => {
    if (!filters.q) return;
    const h = setTimeout(
      () =>
        source === 'database'
          ? track('database_search', { query_length: filters.q.length, results: resultsCount })
          : track('map_filter_used', { filter: 'q', query_length: filters.q.length, results: resultsCount }),
      800,
    );
    return () => clearTimeout(h);
  }, [filters.q, resultsCount, source]);

  return (
    <div className="relative min-w-0 flex-1 md:min-w-[16rem]">
      <label htmlFor={id} className="sr-only">
        {t.explorer.search}
      </label>
      <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-savoia" />
      <input
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t.explorer.searchPlaceholder}
        className="field field-pill pl-10"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className = '',
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="mb-1 block text-xs font-bold text-muted md:sr-only">
        {label}
      </label>
      <select
        id={id}
        className={`field field-pill ${value ? 'is-set' : ''}`}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={label}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function useFilterOptions() {
  const { players, filters, locale, t } = useExplorer();
  return useMemo(() => {
    const n = (v: number | undefined) => formatNumber(v ?? 0, locale);
    const categoryCounts = facetCounts(players, filters, 'categories');
    const regionCounts = facetCounts(players, filters, 'region');
    const cityCounts = facetCounts(players, filters, 'city');
    const industryCounts = facetCounts(players, filters, 'industry');
    const statusCounts = facetCounts(players, filters, 'status');
    const byCount = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], locale)).map(([v, c]) => ({ value: v, label: `${v} (${n(c)})` }));
    // Player types in the order of the four enablers, then "other".
    const order: CategoryKey[] = [...CATEGORY_FAMILIES.flatMap((f) => f.categories), 'other', 'unclassified'];
    const categories = order
      .filter((k) => categoryCounts.get(k) || filters.categories.includes(k))
      .map((k) => ({ value: k, label: `${CATEGORY_BY_KEY[k].label[locale]} (${n(categoryCounts.get(k))})` }));
    const regions = REGIONS.filter((r) => regionCounts.get(r.slug) || filters.region === r.slug)
      .map((r) => ({ value: r.slug, label: `${r[locale]} (${n(regionCounts.get(r.slug))})` }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
    const status = STATUSES.filter((s) => statusCounts.get(s) || filters.status === s).map((s) => ({
      value: s,
      label: `${t.explorer.statusLabels[s]} (${n(statusCounts.get(s))})`,
    }));
    return { categories, regions, cities: byCount(cityCounts), industries: byCount(industryCounts), status };
  }, [players, filters, locale, t]);
}

function FilterFields({ source, stacked }: { source: Source; stacked: boolean }) {
  const { filters, setFilters, t } = useExplorer();
  const o = useFilterOptions();
  const cls = stacked ? 'w-full' : 'w-[11rem]';
  return (
    <>
      <Select
        className={cls}
        label={t.explorer.category}
        value={filters.categories[0] ?? null}
        onChange={(v) => setFilters({ categories: v ? [v as CategoryKey] : [] }, source)}
        options={o.categories}
        placeholder={t.explorer.allCategories}
      />
      <Select
        className={cls}
        label={t.explorer.region}
        value={filters.region}
        onChange={(v) => setFilters({ region: v }, source)}
        options={o.regions}
        placeholder={t.explorer.allRegions}
      />
      <Select
        className={cls}
        label={t.explorer.city}
        value={filters.city}
        onChange={(v) => setFilters({ city: v }, source)}
        options={o.cities}
        placeholder={t.explorer.allCities}
      />
      <Select
        className={cls}
        label={t.explorer.industry}
        value={filters.industry}
        onChange={(v) => setFilters({ industry: v }, source)}
        options={o.industries}
        placeholder={t.explorer.allIndustries}
      />
      <Select
        className={stacked ? 'w-full' : 'w-[10rem]'}
        label={t.explorer.status}
        value={filters.status === 'all' ? null : filters.status}
        onChange={(v) => setFilters({ status: (v as Filters['status']) ?? 'all' }, source)}
        options={o.status}
        placeholder={t.explorer.statusAll}
      />
    </>
  );
}

function ActiveChips({ source }: { source: Source }) {
  const { filters, setFilters, resetFilters, locale, t } = useExplorer();
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.q.trim()) chips.push({ key: 'q', label: `“${filters.q.trim()}”`, remove: () => setFilters({ q: '' }, source) });
  for (const c of filters.categories)
    chips.push({
      key: `c-${c}`,
      label: CATEGORY_BY_KEY[c].label[locale],
      remove: () => setFilters({ categories: filters.categories.filter((x) => x !== c) }, source),
    });
  if (filters.region)
    chips.push({ key: 'r', label: regionName(filters.region, locale), remove: () => setFilters({ region: null }, source) });
  if (filters.city) chips.push({ key: 'ci', label: filters.city, remove: () => setFilters({ city: null }, source) });
  if (filters.industry) chips.push({ key: 'in', label: filters.industry, remove: () => setFilters({ industry: null }, source) });
  if (filters.status !== 'all')
    chips.push({ key: 's', label: t.explorer.statusLabels[filters.status], remove: () => setFilters({ status: 'all' }, source) });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t.explorer.activeFilters} role="group">
      {chips.map((c) => (
        <span key={c.key} className="chip">
          {c.label}
          <button
            type="button"
            onClick={c.remove}
            className="inline-flex size-6 items-center justify-center rounded-full hover:bg-savoia-100"
            aria-label={fmt(t.explorer.removeFilter, { label: c.label })}
          >
            <Icon name="x" size={14} />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => resetFilters(source)}
        className="ml-1 text-[0.8125rem] font-bold text-savoia-700 underline underline-offset-4"
      >
        {t.explorer.reset}
      </button>
    </div>
  );
}

export function ResultsCount({ className = '' }: { className?: string }) {
  const { results, t, locale, state } = useExplorer();
  const n = results.length;
  return (
    <p className={`text-sm font-bold whitespace-nowrap text-navy tabular-nums ${className}`} aria-live="polite" aria-atomic="true">
      {state === 'ready' ? (n === 1 ? t.explorer.result : fmt(t.explorer.results, { n: formatNumber(n, locale) })) : ' '}
    </p>
  );
}

export function Toolbar({
  source,
  showCategories = false,
}: {
  source: Source;
  /** @deprecated all filters are always shown */
  extended?: boolean;
  showCategories?: boolean;
}) {
  const { filters, t, results, locale } = useExplorer();
  const [sheet, setSheet] = useState(false);
  const count = activeFilterCount(filters) - (filters.q.trim() ? 1 : 0);
  const titleId = useId();

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 md:flex-wrap">
        <SearchBox source={source} />
        {/* Desktop/tablet: inline selects (wrap on tablet) */}
        <div className="hidden md:contents">
          <FilterFields source={source} stacked={false} />
        </div>
        {/* Mobile: one Filters button → bottom sheet */}
        <button
          type="button"
          className="btn btn-outline relative shrink-0 px-4 md:hidden"
          onClick={() => setSheet(true)}
          aria-haspopup="dialog"
        >
          <Icon name="filter" size={18} />
          {t.explorer.filters}
          {count > 0 && (
            <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-savoia px-1.5 text-xs text-white">
              {count}
            </span>
          )}
        </button>
      </div>
      <ActiveChips source={source} />
      {showCategories && <CategoryBar />}

      <Dialog
        open={sheet}
        onClose={() => setSheet(false)}
        title={t.explorer.filters}
        closeLabel={t.a11y.close}
        variant="drawer"
        labelledBy={titleId}
      >
        <div className="grid gap-4">
          <FilterFields source={source} stacked />
        </div>
        <div className="sticky bottom-0 -mx-5 mt-6 border-t border-line bg-white px-5 pt-4 pb-1">
          <button type="button" className="btn btn-primary w-full" onClick={() => setSheet(false)}>
            {fmt(t.explorer.applyFilters, { n: formatNumber(results.length, locale) })}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
