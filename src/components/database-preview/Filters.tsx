'use client';

import { useId, useState } from 'react';
import type { DatabaseQuery, LinkedinFilter } from '@/lib/database/query';
import { fmt } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import type { PreviewCopy } from './copy';

type Facet = { value: string; count: number };
type Update = (patch: Partial<DatabaseQuery>) => void;

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** Above this many companies the list gets its own search box. */
const COMPANY_SEARCH_THRESHOLD = 8;

function CheckOption({ label, count, checked, onChange }: { label: string; count: number; checked: boolean; onChange: () => void }) {
  return (
    <label className="group flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-[0.9375rem] hover:bg-mist lg:min-h-9">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 shrink-0 accent-savoia" />
      <span className={`min-w-0 flex-1 truncate ${checked ? 'font-semibold text-ink' : 'text-muted group-hover:text-ink'}`}>
        {label}
      </span>
      <span className="text-xs font-semibold text-subtle tabular-nums">{count}</span>
    </label>
  );
}

export function FilterControls({
  query,
  update,
  types,
  companies,
  t,
}: {
  query: DatabaseQuery;
  update: Update;
  types: Facet[];
  companies: Facet[];
  t: PreviewCopy;
}) {
  const [companyFilter, setCompanyFilter] = useState('');
  const companySearchId = useId();
  const needle = companyFilter.trim().toLowerCase();
  const shownCompanies = needle ? companies.filter((c) => c.value.toLowerCase().includes(needle)) : companies;
  const linkedinOptions: [LinkedinFilter, string][] = [
    ['all', t.linkedinAll],
    ['yes', t.linkedinYes],
    ['no', t.linkedinNo],
  ];

  return (
    <div className="grid gap-7">
      <fieldset>
        <legend className="mb-2 text-xs font-bold tracking-[0.14em] text-subtle uppercase">{t.contactType}</legend>
        <div className="grid gap-0.5">
          {types.map((f) => (
            <CheckOption
              key={f.value}
              label={f.value}
              count={f.count}
              checked={query.types.includes(f.value)}
              onChange={() => update({ types: toggle(query.types, f.value) })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-bold tracking-[0.14em] text-subtle uppercase">{t.company}</legend>
        {companies.length > COMPANY_SEARCH_THRESHOLD && (
          <div className="relative mb-2">
            <label htmlFor={companySearchId} className="sr-only">
              {t.companySearch}
            </label>
            <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
            <input
              id={companySearchId}
              type="search"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              placeholder={t.companySearch}
              className="field min-h-10 py-1.5 pl-9 text-sm"
              autoComplete="off"
            />
          </div>
        )}
        <div className="scrollbar-thin grid max-h-64 gap-0.5 overflow-y-auto pr-1">
          {shownCompanies.map((f) => (
            <CheckOption
              key={f.value}
              label={f.value}
              count={f.count}
              checked={query.companies.includes(f.value)}
              onChange={() => update({ companies: toggle(query.companies, f.value) })}
            />
          ))}
          {!shownCompanies.length && <p className="px-2 py-2 text-sm text-subtle">{t.noCompanyMatch}</p>}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-bold tracking-[0.14em] text-subtle uppercase">{t.linkedin}</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-mist p-1 ring-1 ring-line ring-inset">
          {linkedinOptions.map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-10 cursor-pointer items-center justify-center rounded-lg px-1 text-center text-[0.8125rem] leading-tight font-semibold transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-savoia ${
                query.linkedin === value ? 'bg-white text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
              }`}
            >
              <input
                type="radio"
                name={`${companySearchId}-linkedin`}
                value={value}
                checked={query.linkedin === value}
                onChange={() => update({ linkedin: value })}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

const pill =
  'inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[0.97]';
const pillOff = 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20';
const pillOn = 'bg-white text-savoia-700 shadow-[0_10px_24px_-12px_rgb(10_24_40/0.8)]';

/** One-tap toggles on the dark hero: contact types + "with LinkedIn". */
export function QuickFilters({ query, update, types, t }: { query: DatabaseQuery; update: Update; types: Facet[]; t: PreviewCopy }) {
  const liOn = query.linkedin === 'yes';
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.quickFilters}>
      {types.map((f) => {
        const on = query.types.includes(f.value);
        return (
          <button
            key={f.value}
            type="button"
            aria-pressed={on}
            onClick={() => update({ types: toggle(query.types, f.value) })}
            className={`${pill} ${on ? pillOn : pillOff}`}
          >
            {on && <Icon name="check" size={15} />}
            {f.value}
            <span className={`tabular-nums ${on ? 'text-savoia' : 'text-sky'}`}>{f.count}</span>
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={liOn}
        onClick={() => update({ linkedin: liOn ? 'all' : 'yes' })}
        className={`${pill} ${liOn ? pillOn : pillOff}`}
      >
        {liOn ? <Icon name="check" size={15} /> : <span className="text-[0.75rem] font-black">in</span>}
        {t.linkedinYes}
      </button>
    </div>
  );
}

export function ActiveFilters({ query, update, onReset, t }: { query: DatabaseQuery; update: Update; onReset: () => void; t: PreviewCopy }) {
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(query.q.trim() ? [{ key: 'q', label: `“${query.q.trim()}”`, remove: () => update({ q: '' }) }] : []),
    ...query.types.map((v) => ({ key: `t:${v}`, label: v, remove: () => update({ types: query.types.filter((x) => x !== v) }) })),
    ...query.companies.map((v) => ({
      key: `c:${v}`,
      label: v,
      remove: () => update({ companies: query.companies.filter((x) => x !== v) }),
    })),
    ...(query.linkedin !== 'all'
      ? [{ key: 'li', label: query.linkedin === 'yes' ? t.linkedinYes : t.linkedinNo, remove: () => update({ linkedin: 'all' }) }]
      : []),
  ];
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.activeFilters}>
      {chips.map((c) => (
        <span key={c.key} className="chip">
          <span className="max-w-[16rem] truncate">{c.label}</span>
          <button
            type="button"
            onClick={c.remove}
            className="inline-flex size-6 items-center justify-center rounded-full hover:bg-savoia-100"
            aria-label={fmt(t.removeFilter, { label: c.label })}
          >
            <Icon name="x" size={14} />
          </button>
        </span>
      ))}
      <button type="button" onClick={onReset} className="ml-1 text-sm font-bold text-savoia-700 underline-offset-4 hover:underline">
        {t.resetFilters}
      </button>
    </div>
  );
}
