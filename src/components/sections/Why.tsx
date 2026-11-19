import type { DatasetStats } from '@/lib/data/stats';
import { fmt, type Dictionary } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import { Icon, type IconName } from '../ui/Icon';
import { WhyMap } from '../visuals/WhyMap';
import { SectionHeader } from './SectionHeader';

export function Why({ t, stats }: { t: Dictionary['why']; stats: DatasetStats }) {
  return (
    <section id="why" aria-labelledby="why-title" className="section relative overflow-hidden bg-white">
      <div
        aria-hidden="true"
        className="absolute -top-40 -right-40 -z-0 size-[560px] rounded-full bg-[radial-gradient(circle,rgb(123_146_232/0.18)_0%,transparent_70%)]"
      />
      <div className="container-irf relative">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div>
            <SectionHeader caps id="why-title" title={t.title} accent={t.accent} />
            {/* Short factual definition first: easy to quote for search and answer engines. */}
            <p className="reveal mt-7 rounded-[var(--radius-card)] bg-sky-50 px-6 py-5 text-[1.0625rem] leading-relaxed font-medium text-ink">
              {rich(fmt(t.definition, { active: stats.active, categories: stats.categories }))}
            </p>
            <div className="prose-irf reveal mt-6 text-[1.0625rem] leading-relaxed text-muted">
              {t.paragraphs.map((p) => (
                <p key={p}>{rich(p)}</p>
              ))}
            </div>
          </div>

          <figure className="reveal relative py-6 sm:py-10" data-reveal="scale">
            <WhyMap alt={t.visualAlt} />
          </figure>
        </div>

        <h3 className="reveal mt-20 text-2xl font-black tracking-[-0.02em] text-ink sm:text-3xl">{t.pillarsTitle}</h3>
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {t.pillars.map((p, i) => (
            <li
              key={p.title}
              className="reveal lift card border-sky-200 bg-[linear-gradient(180deg,#fff_0%,var(--color-sky-50)_100%)] p-6"
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <span className="icon-tile" aria-hidden="true">
                <Icon name={p.icon as IconName} size={22} />
              </span>
              <p className="h3 mt-5 text-ink">{p.title}</p>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{p.text}</p>
            </li>
          ))}
        </ul>

        <blockquote className="reveal mx-auto mt-20 max-w-4xl text-center">
          <p className="text-[clamp(1.6rem,1.1rem+2vw,2.6rem)] leading-[1.15] font-light tracking-[-0.02em] text-ink text-balance">
            “{t.quote}”
          </p>
          <footer className="mt-4 text-sm font-bold tracking-wide text-savoia">— {t.quoteBy}</footer>
        </blockquote>
      </div>
    </section>
  );
}
