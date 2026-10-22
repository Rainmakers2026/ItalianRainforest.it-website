'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { PROVINCES, REGIONS } from '@/lib/geo/territories';
import { CATEGORY_BY_KEY, STAGES } from '@/lib/data/taxonomy';
import { activeFilterCount, facetCounts, topTags, type Filters } from '@/lib/filters';
import { formatNumber } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { CategoryBar } from './CategoryBar';
import { useExplorer } from './ExplorerProvider';
import { provinceName, regionName } from './labels';

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
      <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
      <input
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t.explorer.searchPlaceholder}
        className="field pl-9"
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
        className="field"
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

function useFilterOptions(extended: boolean) {
  const { players, filters, locale, t } = useExplorer();
  return useMemo(() => {
    const regionCounts = facetCounts(players, filters, 'region');
    const provinceCounts = facetCounts(players, filters, 'province');
    const statusCounts = facetCounts(players, filters, 'status');
    const n = (v: number | undefined) => formatNumber(v ?? 0, locale);
    const regions = REGIONS.map((r) => ({ value: r.slug, label: `${r[locale]} (${n(regionCounts.get(r.slug))})` })).sort((a, b) =>
      a.label.localeCompare(b.label, locale),
    );
    const provinces = PROVINCES.filter((p) => p.region === filters.region).map((p) => ({
      value: p.slug,
      label: `${p.name} (${n(provinceCounts.get(p.slug))})`,
    }));
    const status = [
      { value: 'active', label: `${t.explorer.statusActive} (${n(statusCounts.get('active'))})` },
      { value: 'inactive', label: `${t.explorer.statusInactive} (${n(statusCounts.get('inactive'))})` },
      { value: 'all', label: t.explorer.statusAll },
    ];
    let stages: { value: string; label: string }[] = [];
    let tags: { value: string; label: string }[] = [];
    let invests: { value: string; label: string }[] = [];
    if (extended) {
      const stageCounts = facetCounts(players, filters, 'stage');
      stages = STAGES.map((s) => ({ value: s.key, label: `${s.label[locale]} (${n(stageCounts.get(s.key))})` }));
      tags = topTags(
        players.filter((p) => p.status === 'active'),
        60,
      )
        .map(([tag, c]) => ({ value: tag, label: `${tag} (${n(c)})` }))
        .sort((a, b) => a.label.localeCompare(b.label, locale));
      const ic = new Map<string, number>();
      for (const p of players) for (const c of p.investmentCountries) ic.set(c, (ic.get(c) ?? 0) + 1);
      invests = [...ic.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ value: c, label: `${c} (${n(v)})` }));
    }
    return { regions, provinces, status, stages, tags, invests };
  }, [players, filters, locale, t, extended]);
}

function FilterFields({ source, extended, stacked }: { source: Source; extended: boolean; stacked: boolean }) {
  const { filters, setFilters, t } = useExplorer();
  const o = useFilterOptions(extended);
  const cls = stacked ? 'w-full' : 'w-[11.5rem]';
  return (
    <>
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
        label={t.explorer.province}
        value={filters.province}
        onChange={(v) => setFilters({ province: v }, source)}
        options={o.provinces}
        placeholder={filters.region ? t.explorer.allProvinces : t.explorer.selectRegionFirst}
        disabled={!filters.region}
      />
      <Select
        className={stacked ? 'w-full' : 'w-[9.5rem]'}
        label={t.explorer.status}
        value={filters.status === 'active' ? 'active' : filters.status}
        onChange={(v) => setFilters({ status: (v as Filters['status']) ?? 'active' }, source)}
        options={o.status}
        placeholder={t.explorer.status}
      />
      {extended && (
        <>
          <Select
            className={cls}
            label={t.explorer.stage}
            value={filters.stage}
            onChange={(v) => setFilters({ stage: v as Filters['stage'] }, source)}
            options={o.stages}
            placeholder={t.explorer.allStages}
          />
          <Select
            className={cls}
            label={t.explorer.tag}
            value={filters.tag}
            onChange={(v) => setFilters({ tag: v }, source)}
            options={o.tags}
            placeholder={t.explorer.tag}
          />
          <Select
            className={cls}
            label={t.explorer.invests}
            value={filters.invests}
            onChange={(v) => setFilters({ invests: v }, source)}
            options={o.invests}
            placeholder={t.explorer.invests}
          />
        </>
      )}
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
  if (filters.province)
    chips.push({ key: 'p', label: provinceName(filters.province), remove: () => setFilters({ province: null }, source) });
  if (filters.status !== 'active')
    chips.push({
      key: 's',
      label: filters.status === 'inactive' ? t.explorer.statusInactive : t.explorer.statusAll,
      remove: () => setFilters({ status: 'active' }, source),
    });
  if (filters.stage)
    chips.push({
      key: 'st',
      label: STAGES.find((s) => s.key === filters.stage)!.label[locale],
      remove: () => setFilters({ stage: null }, source),
    });
  if (filters.tag) chips.push({ key: 't', label: `#${filters.tag}`, remove: () => setFilters({ tag: null }, source) });
  if (filters.invests)
    chips.push({ key: 'i', label: `${t.explorer.invests}: ${filters.invests}`, remove: () => setFilters({ invests: null }, source) });
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
  extended = false,
  showCategories = false,
}: {
  source: Source;
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
          <FilterFields source={source} extended={extended} stacked={false} />
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
      {showCategories && <CategoryBar source={source} />}

      <Dialog
        open={sheet}
        onClose={() => setSheet(false)}
        title={t.explorer.filters}
        closeLabel={t.a11y.close}
        variant="drawer"
        labelledBy={titleId}
      >
        <div className="grid gap-4">
          <div>
            <p className="mb-2 text-xs font-bold text-muted">{t.explorer.category}</p>
            <div className="[&>div]:flex-wrap">
              <CategoryBar source={source} interactiveHover={false} />
            </div>
          </div>
          <FilterFields source={source} extended={extended} stacked />
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
