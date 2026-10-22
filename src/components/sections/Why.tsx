import { fmt, type Dictionary } from '@/lib/i18n';
import type { DatasetStats } from '@/lib/data/stats';
import { SectionHeader } from './SectionHeader';

export function Why({ t, stats }: { t: Dictionary['why']; stats: DatasetStats }) {
  return (
    <section id="why" aria-labelledby="why-title" className="section bg-white">
      <div className="container-irf grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <SectionHeader id="why-title" eyebrow={t.eyebrow} title={t.title} />
          {/* Short factual definition first: easy to quote for search and answer engines. */}
          <p className="reveal mt-6 rounded-xl border-l-4 border-savoia bg-savoia-50 px-5 py-4 text-[1.0625rem] leading-relaxed font-medium text-navy">
            {fmt(t.definition, { active: stats.active, categories: stats.categories })}
          </p>
          <div className="prose-irf reveal mt-6 text-[1.0625rem] leading-relaxed text-muted">
            {t.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {t.pillars.map((p, i) => (
              <li key={p.title} className="reveal border-t-2 border-savoia pt-3" style={{ transitionDelay: `${i * 80}ms` }}>
                <p className="font-extrabold text-navy">{p.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>

        <figure className="reveal relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- animated SVG, served as a static file */}
          <img
            src="/visuals/why.svg"
            alt={t.visualAlt}
            width={640}
            height={590}
            loading="lazy"
            decoding="async"
            className="mx-auto h-auto w-full max-w-[560px]"
          />
          <blockquote className="mx-auto mt-4 max-w-md border-t border-line pt-4 text-center">
            <p className="text-lg leading-snug font-bold text-navy text-balance">“{t.quote}”</p>
            <footer className="mt-2 text-sm text-subtle">— {t.quoteBy}</footer>
          </blockquote>
        </figure>
      </div>
    </section>
  );
}
