'use client';

import { useMemo } from 'react';
import { track } from '@/lib/analytics';
import { CATEGORIES, type CategoryKey } from '@/lib/data/taxonomy';
import { facetCounts } from '@/lib/filters';
import { formatNumber } from '@/lib/i18n/config';
import { useExplorer } from './ExplorerProvider';

/** Ink or white, whichever reads better on the category colour (WCAG relative luminance). */
function textOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return (1.05 / (L + 0.05) >= (L + 0.05) / 0.0783 ? '#ffffff' : '#14304f');
}

/**
 * Category legend. Not a filter (filtering lives in the toolbar's category
 * select): hover/focus a pill to light up that category on the map and dim
 * every other player. Every category is always listed, with live counts.
 */
export function CategoryBar() {
  const { players, filters, setHoverCategory, locale, t, hoverCategory } = useExplorer();
  const counts = useMemo(() => facetCounts(players, filters, 'categories'), [players, filters]);

  const hover = (key: CategoryKey | null) => {
    // Touch devices emulate mouseenter on tap: only real hover devices preview.
    if (key && !window.matchMedia('(hover: hover)').matches) return;
    setHoverCategory(key);
    if (key) track('map_category_hover', { category: key });
  };

  return (
    <ul
      aria-label={t.explorer.category}
      title={t.map.categoriesHint}
      className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible"
      onMouseLeave={() => hover(null)}
    >
      {CATEGORIES.filter((c) => (c.key !== 'unclassified' && c.key !== 'other') || counts.get(c.key)).map((c) => {
        const n = counts.get(c.key) ?? 0;
        const dim = hoverCategory !== null && hoverCategory !== c.key;
        const on = hoverCategory === c.key;
        return (
          <li
            key={c.key}
            tabIndex={0}
            onMouseEnter={() => hover(c.key)}
            onFocus={() => setHoverCategory(c.key)}
            onBlur={() => setHoverCategory(null)}
            style={{ background: c.color, color: textOn(c.color) }}
            className={`inline-flex min-h-7 shrink-0 cursor-default items-center gap-1.5 rounded-full px-2.5 text-[0.75rem] leading-none font-bold whitespace-nowrap transition-[opacity,transform,filter,box-shadow] duration-200 select-none ${
              dim ? 'opacity-30 saturate-50' : ''
            } ${on ? 'scale-105 shadow-[0_8px_18px_-8px_rgb(20_45_74/0.7)]' : ''} ${n === 0 ? 'opacity-50' : ''}`}
          >
            {c.label[locale]}
            <span className="tabular-nums opacity-80">{formatNumber(n, locale)}</span>
          </li>
        );
      })}
    </ul>
  );
}
