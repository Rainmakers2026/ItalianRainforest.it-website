'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_BY_KEY, CATEGORY_FAMILIES, type CategoryKey, type FamilyKey } from '@/lib/data/taxonomy';
import { HTML_LANG, type Locale } from '@/lib/i18n/config';
import { fmt, type Dictionary } from '@/lib/i18n';
import { Icon, type IconName } from '../ui/Icon';
import { ExploreLink, openExplorer } from './ExploreLink';

type FamilyId = FamilyKey | 'other';
type Active = { kind: 'category'; key: CategoryKey } | { kind: 'family'; key: FamilyId } | null;
type Seg = { key: CategoryKey; family: FamilyId; count: number; a0: number; a1: number };

const C = 260; // centre (viewBox 520×520)
const R_FAM = [96, 150] as const; // inner ring: kinds of enablers
const R_CAT = [156, 248] as const; // outer ring: player types
const PAD = 0.008; // radians between slices
const MIN_SPAN = 0.12; // radians: the smallest types stay visible, hoverable and labelled
const POP = 7; // px: the slice in focus moves outwards
const TOUR_MS = 3200;
const OTHER_COLOR = '#6B7690';

const pt = (r: number, a: number) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
function arc(r0: number, r1: number, a0: number, a1: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(r1, a0)}A${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)}Z`;
}
/** Centre line of a slice, drawn so the text on it always reads left to right. */
function labelPath(r: number, a0: number, a1: number, size: number) {
  const mid = (a0 + a1) / 2;
  const bottom = mid > Math.PI / 2 && mid < (3 * Math.PI) / 2;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return bottom
    ? `M${pt(r + size * 0.35, a1)}A${r} ${r} 0 ${large} 0 ${pt(r + size * 0.35, a0)}`
    : `M${pt(r - size * 0.35, a0)}A${r} ${r} 0 ${large} 1 ${pt(r - size * 0.35, a1)}`;
}
const outward = (a0: number, a1: number, d: number) => {
  const m = (a0 + a1) / 2;
  return `translate(${(Math.sin(m) * d).toFixed(2)} ${(-Math.cos(m) * d).toFixed(2)})`;
};

/**
 * "Le categorie della Rainforest": two-ring chart. Inner ring = the four kinds of
 * enablers, outer ring = their player types, each labelled on its own slice (the
 * label shrinks, or wraps onto the hover box, when the slice is too thin). Centre:
 * the numbers. Above the chart: the definition of what is under the pointer.
 * Right: the four-way split (numbers on hover). Click opens the map filtered on it.
 * Idle: a slow tour of the types (paused off-screen, on interaction, reduced motion).
 */
export function CategoriesWheel({
  counts,
  familyCounts,
  locale,
  t,
}: {
  counts: { key: CategoryKey; count: number }[];
  familyCounts: Record<FamilyKey, number>;
  locale: Locale;
  t: Dictionary['what'];
}) {
  const nf = new Intl.NumberFormat(HTML_LANG[locale]);
  const [active, setActive] = useState<Active>(null);
  const [touched, setTouched] = useState(false);
  const [inView, setInView] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { segs, families, total } = useMemo(() => {
    const byKey = new Map(counts.map((c) => [c.key, c.count]));
    const order: { key: CategoryKey; family: FamilyId }[] = [
      ...CATEGORY_FAMILIES.flatMap((f) => f.categories.map((key) => ({ key: key as CategoryKey, family: f.key as FamilyId }))),
      { key: 'other', family: 'other' },
    ];
    const items = order.map((o) => ({ ...o, count: byKey.get(o.key) ?? 0 })).filter((o) => o.count > 0);
    const sum = items.reduce((s, o) => s + o.count, 0) || 1;
    const raw = items.map((o) => (o.count / sum) * Math.PI * 2);
    const small = raw.filter((s) => s < MIN_SPAN);
    const big = raw.reduce((s, x) => s + x, 0) - small.reduce((s, x) => s + x, 0) || 1;
    const scale = (Math.PI * 2 - small.length * MIN_SPAN) / big;
    let a = 0;
    const segs: Seg[] = items.map((o, i) => {
      const span = raw[i]! < MIN_SPAN ? MIN_SPAN : raw[i]! * scale;
      const s = { ...o, a0: a, a1: a + span };
      a += span;
      return s;
    });
    const families = ([...CATEGORY_FAMILIES.map((f) => f.key), 'other'] as FamilyId[])
      .map((key) => {
        const own = segs.filter((s) => s.family === key);
        if (!own.length) return null;
        const fam = CATEGORY_FAMILIES.find((f) => f.key === key);
        return {
          key,
          color: fam?.color ?? OTHER_COLOR,
          icon: (fam?.icon ?? 'grid') as IconName,
          a0: own[0]!.a0,
          a1: own[own.length - 1]!.a1,
          players: key === 'other' ? own.reduce((x, s) => x + s.count, 0) : familyCounts[key],
          cats: own,
        };
      })
      .filter((f): f is NonNullable<typeof f> => !!f);
    const totalPlayers = Object.values(familyCounts).reduce((s, n) => s + n, 0);
    return { segs, families, total: totalPlayers || sum };
  }, [counts, familyCounts]);
  const four = families.filter((f) => f.key !== 'other');
  const tour = useMemo(() => segs.map((s) => s.key), [segs]);

  // Ring labels: shrink until they fit their arc, hide when they still don't.
  useEffect(() => {
    svgRef.current?.querySelectorAll<SVGTextElement>('text[data-fit]').forEach((el) => {
      const path = document.getElementById(el.dataset.fit!) as unknown as SVGPathElement | null;
      if (!path) return;
      const room = path.getTotalLength() - 10;
      const sizes = (el.dataset.sizes ?? '13,12,11,10').split(',').map(Number);
      const size = sizes.find((s) => {
        el.setAttribute('font-size', String(s));
        return el.getComputedTextLength() <= room;
      });
      el.setAttribute('font-size', String(size ?? sizes[0]));
      el.style.visibility = size ? 'visible' : 'hidden';
    });
  }, [segs, locale]);

  useEffect(() => {
    const el = root.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((e) => setInView(e.some((x) => x.isIntersecting)), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (touched || !inView || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let i = 0;
    const tick = () => setActive({ kind: 'category', key: tour[i++ % tour.length]! });
    tick();
    const h = setInterval(tick, TOUR_MS);
    return () => clearInterval(h);
  }, [touched, inView, tour]);

  const focus = (a: Active) => {
    setTouched(true);
    setActive(a);
  };
  const familyOf = (k: CategoryKey) => segs.find((s) => s.key === k)?.family ?? null;
  const activeFamily: FamilyId | null = !active ? null : active.kind === 'family' ? active.key : familyOf(active.key);
  const catOn = (s: Seg) => !active || (active.kind === 'category' ? active.key === s.key : s.family === active.key);
  const famOn = (f: FamilyId) => !active || activeFamily === f;
  const familyName = (f: FamilyId) => (f === 'other' ? t.otherGroup : t.families[f]);
  const pct = (n: number) => Math.round((n / total) * 100);

  // Description above the chart + numbers in the centre.
  let box: { title: string; text: string; color: string; meta: string; query: string } | null = null;
  let centre = { value: nf.format(total), label: t.wheelCenter };
  if (active?.kind === 'category') {
    const c = CATEGORY_BY_KEY[active.key];
    const n = segs.find((s) => s.key === active.key)?.count ?? 0;
    const fam = familyOf(active.key);
    box = { title: c.label[locale], text: c.definition[locale], color: c.color, meta: fam ? familyName(fam) : '', query: `category=${active.key}` };
    centre = { value: nf.format(n), label: c.short[locale] };
  } else if (active?.kind === 'family') {
    const f = families.find((x) => x.key === active.key)!;
    box = {
      title: familyName(f.key),
      text: f.key === 'other' ? CATEGORY_BY_KEY.other.definition[locale] : t.familiesDefinition[f.key],
      color: f.color,
      meta: `${fmt(t.typesCount, { n: f.cats.length })} · ${fmt(t.share, { p: pct(f.players) })}`,
      query: `category=${f.cats.map((c) => c.key).join(',')}`,
    };
    centre = { value: nf.format(f.players), label: t.familiesShort[f.key as FamilyKey] ?? t.otherGroup };
  }

  const sliceProps = (a: Active, label: string, query: string) => ({
    role: 'link',
    tabIndex: 0,
    'aria-label': label,
    onMouseEnter: () => focus(a),
    onFocus: () => focus(a),
    onClick: () => openExplorer(query),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openExplorer(query);
      }
    },
    style: { cursor: 'pointer', outline: 'none' },
  });

  return (
    <div ref={root} className="reveal mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12" onMouseLeave={() => touched && setActive(null)}>
      <div className="min-w-0">
        {/* Description of what is under the pointer — above the chart. */}
        <div aria-live="polite" className="glass min-h-[8.75rem] p-5 sm:p-6">
          {box ? (
            <div key={box.title} className="fade-in grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-6">
              <div>
                <p className="flex items-center gap-2.5 text-lg font-black">
                  <span className="size-3 shrink-0 rounded-[4px]" style={{ background: box.color }} aria-hidden="true" />
                  {box.title}
                </p>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-white/85">{box.text}</p>
                {box.meta && <p className="mt-2 text-[0.8125rem] font-bold text-sky">{box.meta}</p>}
              </div>
              <ExploreLink query={box.query} className="btn btn-light btn-sm w-fit">
                {t.explore}
                <Icon name="arrowRight" size={16} />
              </ExploreLink>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-[0.9375rem] text-white/80">
              <Icon name="info" size={18} className="text-sky" />
              {t.hoverHint}
            </p>
          )}
        </div>

        <figure className="mx-auto mt-6 w-full max-w-[34rem]">
          <svg ref={svgRef} viewBox="0 0 520 520" className="h-auto w-full overflow-visible" role="group" aria-label={t.categoriesTitle}>
            <defs>
              <radialGradient id="cw-core" cx="50%" cy="40%" r="60%">
                <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0.04" />
              </radialGradient>
              <filter id="cw-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0b1a2c" floodOpacity="0.35" />
              </filter>
            </defs>

            {/* Outer ring: player types */}
            <g filter="url(#cw-shadow)">
              {segs.map((s) => {
                const c = CATEGORY_BY_KEY[s.key];
                const on = catOn(s);
                const hot = active?.kind === 'category' && active.key === s.key;
                const id = `cw-cat-${s.key}`;
                return (
                  <g
                    key={s.key}
                    {...sliceProps({ kind: 'category', key: s.key }, `${c.label[locale]}: ${nf.format(s.count)}`, `category=${s.key}`)}
                    transform={hot ? outward(s.a0, s.a1, POP) : undefined}
                    className="transition-[transform,opacity] duration-300"
                    opacity={on ? 1 : 0.5}
                  >
                    <path d={arc(R_CAT[0], R_CAT[1], s.a0 + PAD, s.a1 - PAD)} fill={c.color} stroke={hot ? '#ffffff' : 'none'} strokeWidth={2} />
                    <path id={id} d={labelPath((R_CAT[0] + R_CAT[1]) / 2, s.a0 + PAD, s.a1 - PAD, 12)} fill="none" />
                    <text data-fit={id} data-sizes="13,12,11,10" fill="#ffffff" fontWeight="700" pointerEvents="none" style={{ visibility: 'hidden' }}>
                      <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
                        {c.short[locale]}
                      </textPath>
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Inner ring: kinds of enablers */}
            {families.map((f) => {
              const id = `cw-fam-${f.key}`;
              const hot = active?.kind === 'family' && active.key === f.key;
              return (
                <g
                  key={f.key}
                  {...sliceProps({ kind: 'family', key: f.key }, `${familyName(f.key)}: ${nf.format(f.players)}`, `category=${f.cats.map((c) => c.key).join(',')}`)}
                  transform={hot ? outward(f.a0, f.a1, POP - 2) : undefined}
                  className="transition-[transform,opacity] duration-300"
                  opacity={famOn(f.key) ? 1 : 0.5}
                >
                  <path d={arc(R_FAM[0], R_FAM[1], f.a0 + PAD, f.a1 - PAD)} fill={f.color} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1.2} />
                  <path id={id} d={labelPath((R_FAM[0] + R_FAM[1]) / 2, f.a0 + PAD, f.a1 - PAD, 12)} fill="none" />
                  <text data-fit={id} data-sizes="12.5,11.5,10.5" fill="#ffffff" fontWeight="800" letterSpacing="0.6" pointerEvents="none" style={{ visibility: 'hidden' }}>
                    <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
                      {(f.key === 'other' ? t.otherGroup : t.familiesShort[f.key as FamilyKey]).toUpperCase()}
                    </textPath>
                  </text>
                </g>
              );
            })}

            {/* Centre: the numbers */}
            <circle cx={C} cy={C} r={R_FAM[0] - 6} fill="url(#cw-core)" stroke="#ffffff" strokeOpacity="0.25" />
            <text key={centre.value + centre.label} x={C} y={C + 6} textAnchor="middle" fill="#ffffff" fontSize="46" fontWeight="900" className="fade-in" letterSpacing="-1.5">
              {centre.value}
            </text>
            <text x={C} y={C + 32} textAnchor="middle" fill="#9fe3f5" fontSize="13.5" fontWeight="700">
              {centre.label}
            </text>
          </svg>
          <figcaption className="mt-3 text-center text-[0.8125rem] text-white/70">{t.wheelHint}</figcaption>
        </figure>
      </div>

      {/* The four-way split only; numbers on hover/focus. */}
      <ul className="grid content-start gap-3 lg:pt-1" aria-label={t.categoriesTitle}>
        {four.map((f) => {
          const on = activeFamily === f.key;
          return (
            <li key={f.key}>
              <button
                type="button"
                onMouseEnter={() => focus({ kind: 'family', key: f.key })}
                onFocus={() => focus({ kind: 'family', key: f.key })}
                onClick={() => focus({ kind: 'family', key: f.key })}
                className={`group flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left ring-1 transition-colors duration-300 ${on ? 'bg-white/[0.14] ring-white/40' : 'bg-white/[0.05] ring-white/10 hover:bg-white/[0.1]'}`}
              >
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_10px_22px_-12px_rgb(0_0_0/0.6)]" style={{ background: f.color }}>
                  <Icon name={f.icon} size={28} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[1.0625rem] font-bold">{t.families[f.key as FamilyKey]}</span>
                  <span
                    className={`block text-[0.8125rem] font-semibold text-sky tabular-nums transition-[opacity,max-height] duration-300 ${on ? 'max-h-6 opacity-100' : 'max-h-0 opacity-0 group-hover:max-h-6 group-hover:opacity-100'}`}
                  >
                    {fmt(t.familyCount, { n: nf.format(f.players) })} · {fmt(t.typesCount, { n: f.cats.length })}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
