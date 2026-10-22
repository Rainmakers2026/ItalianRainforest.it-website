'use client';

import { useMemo } from 'react';
import { track } from '@/lib/analytics';
import { CATEGORIES, type CategoryKey } from '@/lib/data/taxonomy';
import { facetCounts } from '@/lib/filters';
import { formatNumber } from '@/lib/i18n/config';
import { useExplorer } from './ExplorerProvider';

/**
 * Category legend + filter. Hover/focus highlights the category on the map
 * (no filtering); click toggles a persistent filter. Counts reflect the other
 * active filters and never shift layout (tabular numbers, fixed chip shape).
 */
export function CategoryBar({ source, interactiveHover = true }: { source: 'map' | 'database'; interactiveHover?: boolean }) {
  const { players, filters, setFilters, setHoverCategory, locale, t, hoverCategory } = useExplorer();
  const counts = useMemo(() => facetCounts(players, filters, 'categories'), [players, filters]);
  const visible = CATEGORIES.filter((c) => (counts.get(c.key) ?? 0) > 0 || filters.categories.includes(c.key));

  const toggle = (key: CategoryKey) => {
    const has = filters.categories.includes(key);
    setFilters({ categories: has ? filters.categories.filter((c) => c !== key) : [...filters.categories, key] }, source);
  };
  const hover = (key: CategoryKey | null) => {
    // Touch devices emulate mouseenter on tap: only real hover devices preview.
    if (!interactiveHover || (key && !window.matchMedia('(hover: hover)').matches)) return;
    setHoverCategory(key);
    if (key) track('map_category_hover', { category: key });
  };

  return (
    <div
      role="group"
      aria-label={t.explorer.category}
      className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible"
    >
      {visible.map((c) => {
        const active = filters.categories.includes(c.key);
        const dim = hoverCategory && hoverCategory !== c.key;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(c.key)}
            onMouseEnter={() => hover(c.key)}
            onMouseLeave={() => hover(null)}
            onFocus={() => hover(c.key)}
            onBlur={() => hover(null)}
            className={`group inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[0.8125rem] font-semibold transition-[background-color,border-color,opacity] duration-150 ${
              active ? 'border-navy bg-navy text-white' : 'border-line bg-white text-ink hover:border-line-strong'
            } ${dim ? 'opacity-60' : ''}`}
          >
            <span
              className="size-2.5 rounded-full ring-2 ring-white/80"
              style={{ background: c.color, boxShadow: active ? '0 0 0 1px rgba(255,255,255,.6)' : undefined }}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">{c.label[locale]}</span>
            <span className={`min-w-[2ch] text-right tabular-nums ${active ? 'text-white/80' : 'text-subtle'}`}>
              {formatNumber(counts.get(c.key) ?? 0, locale)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
