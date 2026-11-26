/* eslint-disable @next/next/no-img-element -- 500+ pre-optimised, pre-sized logo files (public/logos): plain lazy <img> is lighter than the image optimiser */
import type { CSSProperties } from 'react';
import type { PublicPlayer } from '@/lib/data/schema';
import { CATEGORY_BY_KEY, CATEGORY_FAMILIES, type CategoryKey } from '@/lib/data/taxonomy';
import { HTML_LANG, type Locale } from '@/lib/i18n/config';
import { fmt, type Dictionary } from '@/lib/i18n';
import { OutboundLink } from '../OutboundLink';
import { Icon, type IconName } from '../ui/Icon';
import { SectionHeader } from './SectionHeader';

type Item = Pick<PublicPlayer, 'id' | 'name' | 'logo' | 'website'>;

/**
 * Logo without a frame, linked to the organisation's website (new tab). White/pale
 * artwork is rendered dark so it reads on white.
 */
function Tile({ p, visit, color }: { p: Item; visit: string; color: string }) {
  const art = p.logo ? (
    <img
      src={p.logo.onLight ?? p.logo.src}
      alt={p.name}
      width={p.logo.w ?? undefined}
      height={p.logo.h ?? undefined}
      loading="lazy"
      decoding="async"
      className="max-h-10 w-auto max-w-full object-contain"
    />
  ) : (
    <span className="line-clamp-2 text-center text-[0.75rem] leading-tight font-bold text-ink">{p.name}</span>
  );
  // On hover/focus the tile lifts above its neighbours as a white card (category-coloured
  // ring, name underneath); the other logos of the panel fade so it stands out.
  const box =
    'irf-tile relative z-0 flex h-14 w-full items-center justify-center rounded-xl px-1.5 outline-none transition-[transform,opacity,box-shadow,background-color] duration-200 ease-out ' +
    'group-hover/panel:opacity-40 hover:z-20 hover:opacity-100! hover:bg-white focus-visible:z-20 focus-visible:opacity-100! focus-visible:bg-white ' +
    'motion-safe:hover:scale-[1.6] motion-safe:focus-visible:scale-[1.6] hover:shadow-[0_10px_28px_-8px_rgb(20_45_74/0.45),0_0_0_1.5px_var(--tile)] focus-visible:shadow-[0_10px_28px_-8px_rgb(20_45_74/0.45),0_0_0_2px_var(--tile)]';
  const label = (
    <span className="pointer-events-none absolute top-full left-1/2 mt-0.5 max-w-[160%] -translate-x-1/2 truncate rounded-md bg-white px-1 py-0.5 text-center whitespace-nowrap shadow-[0_4px_10px_-4px_rgb(20_45_74/0.35)] text-[0.4375rem] leading-none font-bold text-ink opacity-0 transition-opacity duration-200 [.irf-tile:focus-visible_&]:opacity-100 [.irf-tile:hover_&]:opacity-100">
      {p.name}
    </span>
  );
  const style = { '--tile': color } as CSSProperties;
  return (
    <li className="flex">
      {p.website ? (
        <OutboundLink
          href={p.website}
          event="outbound_player_website"
          props={{ player: p.id, from: 'infographic' }}
          title={`${p.name} · ${visit}`}
          className={box}
          style={style}
        >
          {art}
          {label}
        </OutboundLink>
      ) : (
        <span title={p.name} tabIndex={0} className={box} style={style}>
          {art}
          {label}
        </span>
      )}
    </li>
  );
}

/**
 * "Infografica": one visual map of every enabler, logo by logo, in panels per player
 * type (Italian Rainforest taxonomy) grouped by kind of enabler. Each organisation
 * appears once, under its main type. The downloadable PNG is generated from the same
 * data by scripts/build-infographic.mts.
 */
export function Infographic({ players, locale, t, families }: { players: PublicPlayer[]; locale: Locale; t: Dictionary['infographic']; families: Dictionary['what']['families'] }) {
  const nf = new Intl.NumberFormat(HTML_LANG[locale]);
  // The public dataset is already the publishable perimeter: no filtering here.
  const listed = [...players].sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  const byType = new Map<CategoryKey, Item[]>();
  for (const p of listed) {
    const k = p.categories[0]!;
    byType.set(k, [...(byType.get(k) ?? []), p]);
  }
  const groups = [
    ...CATEGORY_FAMILIES.map((f) => ({ key: f.key as string, label: families[f.key], color: f.color, icon: f.icon as IconName, types: f.categories as readonly CategoryKey[] })),
    { key: 'other', label: CATEGORY_BY_KEY.other.label[locale], color: CATEGORY_BY_KEY.other.color, icon: 'grid' as IconName, types: ['other', 'unclassified'] as CategoryKey[] },
  ]
    .map((g) => ({ ...g, panels: g.types.map((k) => ({ key: k, items: byType.get(k) ?? [] })).filter((x) => x.items.length) }))
    .filter((g) => g.panels.length);

  return (
    <section id="infographic" aria-labelledby="infographic-title" className="section relative overflow-hidden bg-white">
      <div className="container-irf">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeader caps id="infographic-title" title={t.title} accent={t.accent} lead={t.lead} />
          <div className="reveal grid gap-1.5">
            <div className="flex flex-wrap gap-2">
              <a href={`/infographic/italian-rainforest-infografica-${locale}.pdf`} download className="btn btn-primary">
                <Icon name="download" size={18} />
                {t.download} · PDF
              </a>
              <a href={`/infographic/italian-rainforest-infografica-${locale}.png`} download className="btn btn-outline">
                <Icon name="download" size={18} />
                {t.downloadPng}
              </a>
            </div>
            <span className="text-center text-xs text-subtle">{fmt(t.downloadHint, { n: nf.format(listed.length) })}</span>
          </div>
        </div>

        <p className="reveal mt-8 flex items-center gap-2 text-sm text-muted">
          <Icon name="info" size={16} className="shrink-0" />
          {t.hoverHint}
        </p>

        <div className="mt-10 grid gap-12">
          {groups.map((g) => (
            <div key={g.key} className="reveal">
              <h3 className="flex items-center gap-2.5 text-lg font-black tracking-[0.06em] uppercase" style={{ color: g.color }}>
                <span className="flex size-8 items-center justify-center rounded-lg text-white" style={{ background: g.color }} aria-hidden="true">
                  <Icon name={g.icon} size={17} />
                </span>
                {g.label}
              </h3>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-8">
                {g.panels.map(({ key, items }) => {
                  const c = CATEGORY_BY_KEY[key];
                  // Width follows the content: as many 7rem columns as a balanced block needs
                  // (never wider than the row), so no panel keeps large empty areas.
                  const n = items.length;
                  const cols = n <= 6 ? n : Math.min(12, Math.ceil(Math.sqrt(n * 2.6)));
                  const titleRem = (c.label[locale].length + 6) * 0.55 + 3;
                  const width = `min(100%, ${Math.max(cols * 7 + 2.5, titleRem)}rem)`;
                  return (
                    <section
                      key={key}
                      aria-label={`${c.label[locale]}: ${fmt(t.count, { n: nf.format(n) })}`}
                      className="relative min-w-0 rounded-[28px] border-[3px] bg-white px-4 pt-7 pb-4"
                      style={{ borderColor: c.color, width, flex: '0 1 auto' }}
                    >
                      <h4 className="absolute -top-3.5 left-6 bg-white px-2.5 text-[0.9375rem] leading-none font-bold text-ink">
                        {c.label[locale]} <span className="font-semibold text-subtle tabular-nums">· {nf.format(items.length)}</span>
                      </h4>
                      <ul className="group/panel grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-x-2 gap-y-1">
                        {items.map((p) => (
                          <Tile key={p.id} p={p} visit={t.visit} color={c.color} />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="reveal mt-10 flex items-start gap-2 text-sm text-subtle">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          {t.note}
        </p>
      </div>
    </section>
  );
}
