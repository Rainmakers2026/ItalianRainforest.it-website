'use client';

import { useState } from 'react';
import { CATEGORY_BY_KEY, type CategoryKey } from '@/lib/data/taxonomy';
import { HTML_LANG, type Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n';

const R = 70;
const STROKE = 26;
const C = 2 * Math.PI * R;
/** 2px surface gap between slices (absolute lengths: no reliance on pathLength). */
const GAP = 2;
const len = (pct: number) => (pct / 100) * C;

/**
 * Animated donut of category assignments. Colours are the category colours used
 * on the map (identity follows the entity); identity is never colour-alone: the
 * legend is always visible with labels, counts and shares, and hovering a slice
 * or a legend row highlights it and fills the centre readout.
 */
export function CategoryDonut({
  counts,
  active,
  locale,
  t,
}: {
  counts: { key: CategoryKey; count: number }[];
  active: number;
  locale: Locale;
  t: Dictionary['faq'];
}) {
  const [hover, setHover] = useState<CategoryKey | null>(null);
  const nf = new Intl.NumberFormat(HTML_LANG[locale]);
  const pf = new Intl.NumberFormat(HTML_LANG[locale], { style: 'percent', maximumFractionDigits: 1 });
  const sorted = [...counts].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((s, c) => s + c.count, 0) || 1;
  const pcts = sorted.map((c) => (c.count / total) * 100);
  const slices = sorted.map((c, i) => ({ ...c, pct: pcts[i]!, start: pcts.slice(0, i).reduce((a, b) => a + b, 0) }));
  const current = hover ? slices.find((s) => s.key === hover) : null;

  return (
    <figure className="reveal mt-2 grid items-center gap-6 rounded-2xl bg-sky-50 p-4 ring-1 sm:p-5 ring-sky-100 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <figcaption className="sr-only">{t.chartTitle}</figcaption>
      <div className="relative mx-auto w-full max-w-[220px]">
        <svg viewBox="0 0 200 200" className="donut h-auto w-full -rotate-90" aria-hidden="true">
          <defs>
            <mask id="donut-sweep">
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke="#fff"
                strokeWidth={STROKE + 12}
                className="donut-sweep"
                style={{ ['--c' as string]: C }}
              />
            </mask>
          </defs>
          <circle cx="100" cy="100" r={R} fill="none" stroke="#e4ecfc" strokeWidth={STROKE} />
          <g mask="url(#donut-sweep)">
            {slices.map((s) => (
              <circle
                key={s.key}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={CATEGORY_BY_KEY[s.key].color}
                strokeWidth={hover === s.key ? STROKE + 8 : STROKE}
                strokeDasharray={`${Math.max(len(s.pct) - GAP, 0.5)} ${C}`}
                strokeDashoffset={-len(s.start)}
                opacity={hover && hover !== s.key ? 0.25 : 1}
                className="cursor-pointer transition-[opacity,stroke-width] duration-200"
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center" aria-live="polite">
          {current ? (
            <>
              <span className="text-[1.6rem] leading-none font-black text-ink tabular-nums">{pf.format(current.pct / 100)}</span>
              <span className="mt-1 text-[0.75rem] leading-tight font-semibold text-muted">{CATEGORY_BY_KEY[current.key].label[locale]}</span>
            </>
          ) : (
            <>
              <span className="text-[1.6rem] leading-none font-black text-ink tabular-nums">{nf.format(active)}</span>
              <span className="mt-1 text-[0.75rem] leading-tight font-semibold text-muted">{t.chartTotal}</span>
            </>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{t.chartTitle}</p>
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-5 gap-y-1 sm:grid-cols-2" onMouseLeave={() => setHover(null)}>
          {slices.map((s) => (
            <li
              key={s.key}
              tabIndex={0}
              onMouseEnter={() => setHover(s.key)}
              onFocus={() => setHover(s.key)}
              onBlur={() => setHover(null)}
              className={`flex cursor-default items-center gap-2 rounded-lg px-2 py-1 text-[0.8125rem] transition-colors ${
                hover === s.key ? 'bg-white shadow-sm' : ''
              } ${hover && hover !== s.key ? 'opacity-50' : ''}`}
            >
              <span className="h-3 w-1.5 shrink-0 rounded-full" style={{ background: CATEGORY_BY_KEY[s.key].color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-ink">{CATEGORY_BY_KEY[s.key].label[locale]}</span>
              <span className="font-bold text-ink tabular-nums">{nf.format(s.count)}</span>
              <span className="w-11 text-right text-muted tabular-nums">{pf.format(s.pct / 100)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-subtle">{t.chartNote}</p>
      </div>
    </figure>
  );
}
