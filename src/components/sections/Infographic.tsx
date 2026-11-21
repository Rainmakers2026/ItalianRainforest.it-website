/* eslint-disable @next/next/no-img-element -- 500+ pre-optimised, pre-sized logo files (public/logos): plain lazy <img> is lighter than the image optimiser */
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
function Tile({ p, visit }: { p: Item; visit: string }) {
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
  const box = 'flex h-14 w-full items-center justify-center rounded-xl px-1.5 transition-transform duration-200';
  return (
    <li className="flex">
      {p.website ? (
        <OutboundLink
          href={p.website}
          event="outbound_player_website"
          props={{ player: p.id, from: 'infographic' }}
          title={`${p.name} · ${visit}`}
          className={`${box} hover:scale-110 focus-visible:scale-110`}
        >
          {art}
        </OutboundLink>
      ) : (
        <span title={p.name} className={box}>
          {art}
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
  const listed = [...players].filter((p) => p.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
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
            <a href={`/infographic/italian-rainforest-infografica-${locale}.png`} download className="btn btn-primary">
              <Icon name="download" size={18} />
              {t.download}
            </a>
            <span className="text-center text-xs text-subtle">{fmt(t.downloadHint, { n: nf.format(listed.length) })}</span>
          </div>
        </div>

        <div className="mt-12 grid gap-12">
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
                      <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-x-2 gap-y-1">
                        {items.map((p) => (
                          <Tile key={p.id} p={p} visit={t.visit} />
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
