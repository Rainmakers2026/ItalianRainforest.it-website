import { CATEGORY_BY_KEY } from '@/lib/data/taxonomy';
import type { DatasetStats } from '@/lib/data/stats';
import { formatNumber, type Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { SectionHeader } from './SectionHeader';

export function What({ t, locale, stats }: { t: Dictionary['what']; locale: Locale; stats: DatasetStats }) {
  const max = Math.max(...stats.categoryCounts.map((c) => c.count));
  return (
    <section id="what" aria-labelledby="what-title" className="section bg-mist">
      <div className="container-irf">
        <SectionHeader id="what-title" eyebrow={t.eyebrow} title={t.title} lead={t.lead} />

        {/* ecosystem → map → data → connection */}
        <ol className="reveal mt-8 flex flex-wrap items-center gap-2 text-sm font-bold text-savoia-700" aria-label={t.flow.join(' → ')}>
          {t.flow.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line">{step}</span>
              {i < t.flow.length - 1 && <Icon name="arrowRight" size={16} className="text-periwinkle" />}
            </li>
          ))}
        </ol>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {[
            { key: 'map', icon: 'map' as const, href: '#map', ...t.map },
            { key: 'database', icon: 'list' as const, href: '#database', ...t.database },
          ].map((tool, i) => (
            <article
              key={tool.key}
              className="reveal card group flex flex-col p-6 shadow-[var(--shadow-card)] transition-transform duration-200 hover:-translate-y-0.5 md:p-8"
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-savoia text-white" aria-hidden="true">
                <Icon name={tool.icon} size={24} />
              </span>
              <h3 className="mt-5 text-2xl font-extrabold text-navy">{tool.title}</h3>
              <p className="mt-2 flex-1 leading-relaxed text-muted">{tool.text}</p>
              <a href={tool.href} className="btn btn-primary mt-6 self-start">
                {tool.cta}
                <Icon name="arrowRight" size={18} />
              </a>
            </article>
          ))}
        </div>

        <div className="reveal mt-14">
          <h3 className="text-xl font-extrabold text-navy">{t.categoriesTitle}</h3>
          <p className="mt-1 text-muted">{t.categoriesLead}</p>
          <dl className="mt-6 grid gap-x-8 gap-y-1 md:grid-cols-2">
            {stats.categoryCounts.map(({ key, count }) => {
              const c = CATEGORY_BY_KEY[key];
              return (
                <div key={key} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-line py-3">
                  <dt className="flex items-center gap-2.5 font-bold text-navy">
                    <span className="size-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                    {c.label[locale]}
                  </dt>
                  <dd className="text-right text-sm font-bold text-navy tabular-nums">{formatNumber(count, locale)}</dd>
                  <dd className="col-span-2 mt-0.5 pl-[22px] text-sm text-muted">{c.definition[locale]}</dd>
                  <dd className="col-span-2 mt-2 ml-[22px] h-1 overflow-hidden rounded-full bg-savoia-100" aria-hidden="true">
                    <span className="block h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: c.color }} />
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
}
