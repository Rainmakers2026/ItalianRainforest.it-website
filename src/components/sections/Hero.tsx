import type { DatasetStats } from '@/lib/data/stats';
import { CATEGORY_BY_KEY, CATEGORY_FAMILIES } from '@/lib/data/taxonomy';
import { formatDate, HTML_LANG, type Locale } from '@/lib/i18n/config';
import { fmt, type Dictionary } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import { CountUp } from '../ui/CountUp';
import { Icon } from '../ui/Icon';
import { HeroForest } from '../visuals/HeroForest';
import { ExploreLink } from './ExploreLink';

/**
 * Above the fold: headline + the "what you'll find" card (live numbers from the
 * database) over the blue forest, with the player types scrolling at the bottom.
 */
export function Hero({ locale, t, stats }: { locale: Locale; t: Dictionary['hero']; stats: DatasetStats }) {
  const lang = HTML_LANG[locale];
  const types = stats.categoryCounts.filter((c) => c.key !== 'unclassified').sort((a, b) => b.count - a.count);
  const top = types.slice(0, 5);
  const max = Math.max(...top.map((c) => c.count), 1);
  const familyColor = (key: string) => CATEGORY_FAMILIES.find((f) => (f.categories as readonly string[]).includes(key))?.color ?? '#9fb3f0';
  const figures = [
    { value: stats.total, label: t.statOrgs, accent: false },
    { value: stats.categories, label: t.statTypes, accent: true },
    { value: stats.regions, label: t.statRegions, accent: true },
    { value: stats.cities, label: t.statCities, accent: false },
  ];

  return (
    <section aria-labelledby="hero-title" className="on-dark relative isolate overflow-hidden text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_78%_8%,rgb(159_227_245/0.35)_0%,transparent_60%),radial-gradient(70%_70%_at_15%_20%,rgb(123_146_232/0.45)_0%,transparent_60%),linear-gradient(180deg,#2c4f9c_0%,#3a5ec4_38%,#2a4c8f_72%,#1b3a5c_100%)]"
      />
      <HeroForest className="pointer-events-none absolute inset-x-0 bottom-20 -z-10 h-[34%] w-full min-w-[900px] opacity-90 md:h-[40%]" />

      <div className="container-irf grid items-center gap-10 pt-16 pb-[clamp(210px,25vw,310px)] md:pt-24 lg:grid-cols-[1.18fr_0.82fr] lg:gap-12">
        <div className="max-w-[44rem]">
          <h1 id="hero-title" className="display">
            {t.titleLead}{' '}
            <span className="block bg-[linear-gradient(120deg,#ffffff_0%,#c9d7ff_35%,#9fe3f5_100%)] bg-clip-text text-transparent">
              {t.titleAccent}
            </span>
          </h1>
          <p className="mt-5 text-xl font-bold text-sky">{t.tagline}</p>
          <p className="lead mt-4 text-white/90">{rich(t.lead)}</p>

          <div className="mt-9 grid gap-3 sm:flex sm:flex-wrap sm:items-center">
            <a href="#map" className="btn btn-light shadow-[0_14px_34px_-14px_rgb(10_24_40/0.7)] sm:px-5">
              {t.ctaMap}
              <Icon name="arrowRight" size={18} className="rotate-90" />
            </a>
            <a href="#database" className="btn btn-ghost-dark sm:px-5">
              {t.ctaDatabase}
              <Icon name="arrowRight" size={18} className="rotate-90" />
            </a>
            <a href="#infographic" className="btn btn-ghost-dark sm:px-5">
              {t.ctaInfographic}
              <Icon name="grid" size={18} />
            </a>
          </div>
        </div>

        {/* Live numbers, computed from the database (never hard-coded). */}
        <aside aria-label={t.cardTitle} className="glass reveal relative p-6 shadow-[var(--shadow-pop)] sm:p-8" data-reveal="right">
          <h2 className="text-lg font-bold">{t.cardTitle}</h2>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
            {figures.map((f) => (
              <div key={f.label} className="flex flex-col">
                <dt className="order-2 mt-1.5 text-sm text-white/80">{f.label}</dt>
                <dd
                  className={`order-1 text-[clamp(2.2rem,1.7rem+1.8vw,3.2rem)] leading-none font-black tracking-[-0.04em] tabular-nums ${f.accent ? 'text-sky' : ''}`}
                >
                  <CountUp value={f.value} locale={lang} />
                </dd>
              </div>
            ))}
          </dl>
          <ul className="mt-7 grid gap-3">
            {top.map(({ key, count }, i) => (
              <li key={key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[0.9375rem]">
                <span className="leading-tight text-white/90">{CATEGORY_BY_KEY[key].short[locale]}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
                  <span
                    className="bar-fill block h-full rounded-full"
                    style={{
                      width: `${(count / max) * 100}%`,
                      transitionDelay: `${300 + i * 120}ms`,
                      background: `linear-gradient(90deg, #c9d7ff, ${familyColor(key)})`,
                    }}
                  />
                </span>
                <span className="text-right font-bold tabular-nums">
                  <CountUp value={count} locale={lang} />
                </span>
              </li>
            ))}
          </ul>
          <a href="#what" className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-sky hover:underline">
            {fmt(t.cardMore, { n: stats.categories })}
            <Icon name="arrowRight" size={14} />
          </a>
          <p className="mt-4 flex items-center gap-1.5 text-[0.8125rem] text-white/75">
            <span className="size-1.5 rounded-full bg-[#7ee2a8]" aria-hidden="true" />
            <time dateTime={stats.updatedAt}>{fmt(t.cardUpdated, { date: formatDate(stats.updatedAt) })}</time>
          </p>
        </aside>
      </div>

      {/* Every player type of the database, scrolling. Pauses on hover/focus; each chip opens the map filtered on it. */}
      <nav aria-label={t.marqueeLabel} className="marquee-track absolute inset-x-0 bottom-0 overflow-hidden border-t border-white/15 bg-base/75 py-5 backdrop-blur-sm">
        <div className="marquee gap-3 pr-3 whitespace-nowrap">
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center gap-3" aria-hidden={copy === 1 ? 'true' : undefined}>
              {types.map((c) => (
                <li key={c.key}>
                  <ExploreLink
                    query={`category=${c.key}`}
                    tabIndex={copy === 1 ? -1 : undefined}
                    className="inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/[0.07] px-5 py-2.5 text-[1.0625rem] font-bold text-white transition-colors hover:border-white/50 hover:bg-white/[0.16] md:text-lg"
                  >
                    {CATEGORY_BY_KEY[c.key].label[locale]}
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-[0.875rem] text-sky tabular-nums">{c.count}</span>
                  </ExploreLink>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </nav>
    </section>
  );
}
