import type { DatasetStats } from '@/lib/data/stats';
import { formatDate, formatNumber, type Locale } from '@/lib/i18n/config';
import { fmt, type Dictionary } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import { OutboundLink } from '../OutboundLink';
import { Icon } from '../ui/Icon';
import { HeroVisual } from '../visuals/HeroVisual';

export function Hero({ locale, t, stats }: { locale: Locale; t: Dictionary['hero']; stats: DatasetStats }) {
  // Regions are shown only when real location data exists; otherwise the
  // equally factual "investment countries" figure takes its place.
  const facts = [
    { value: stats.active, label: t.statOrgs },
    { value: stats.categories, label: t.statCategories },
    stats.regions > 0 ? { value: stats.regions, label: t.statRegions } : { value: stats.investmentCountries, label: t.statCountries },
  ];

  return (
    <section
      aria-labelledby="hero-title"
      className="on-dark relative overflow-hidden bg-[radial-gradient(120%_90%_at_85%_10%,#4b61d1_0%,#24418f_42%,#14304f_78%,#0b1a2e_100%)] text-white"
    >
      <div className="container-irf relative grid items-center gap-6 pt-10 pb-12 md:grid-cols-[1.2fr_0.8fr] md:pt-14 md:pb-16 lg:gap-10">
        <div className="relative z-10 max-w-[42rem]">
          <p className="eyebrow inline-flex items-center gap-2 text-sky">
            <span className="size-1.5 rounded-full bg-sky" aria-hidden="true" />
            {t.eyebrow}
          </p>
          <h1
            id="hero-title"
            className="mt-4 text-[length:var(--text-display)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance"
          >
            {t.title}
          </h1>
          <p className="lead mt-5 text-white/85">{t.lead}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#map" className="btn btn-light">
              <Icon name="map" size={18} />
              {t.ctaMap}
            </a>
            <a href="#database" className="btn btn-ghost-dark">
              <Icon name="list" size={18} />
              {t.ctaDatabase}
            </a>
          </div>

          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/15 pt-6">
            {facts.map((f) => (
              <div key={f.label} className="flex flex-col">
                <dt className="order-2 mt-1 text-[0.8125rem] leading-tight text-white/75">{f.label}</dt>
                <dd className="order-1 text-[1.75rem] leading-none font-extrabold tabular-nums">{formatNumber(f.value, locale)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-white/75">
            <span>
              <time dateTime={stats.updatedAt}>{fmt(t.updated, { date: formatDate(stats.updatedAt) })}</time>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t.initiative}{' '}
              <OutboundLink
                href={SITE.rainmakers.url}
                event="rainmakers_outbound"
                props={{ placement: 'hero' }}
                className="font-bold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
              >
                Rainmakers
              </OutboundLink>
            </span>
          </p>
        </div>

        <div className="relative -mx-4 md:mx-0">
          <HeroVisual className="mx-auto h-auto w-full max-w-[560px]" />
        </div>
      </div>
    </section>
  );
}
