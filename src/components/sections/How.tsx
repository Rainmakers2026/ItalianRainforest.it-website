import type { Dictionary } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { SectionHeader } from './SectionHeader';

export function How({ t }: { t: Dictionary['how'] }) {
  return (
    <section id="how" aria-labelledby="how-title" className="on-dark section bg-savoia text-white">
      <div className="container-irf grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <figure className="reveal order-2 lg:order-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- animated SVG, served as a static file */}
          <img
            src="/visuals/how.svg"
            alt={t.visualAlt}
            width={640}
            height={590}
            loading="lazy"
            decoding="async"
            className="mx-auto h-auto w-full max-w-[540px]"
          />
        </figure>

        <div className="order-1 lg:order-2">
          <SectionHeader id="how-title" eyebrow={t.eyebrow} title={t.title} lead={t.lead} dark />
          <ol className="mt-8 grid gap-3">
            {t.steps.map((s, i) => (
              <li
                key={s.title}
                className="reveal flex gap-4 rounded-2xl bg-white/[0.08] p-4 ring-1 ring-white/15"
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-savoia-700 tabular-nums"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <p className="font-extrabold">{s.title}</p>
                  <p className="mt-0.5 text-[0.9375rem] leading-relaxed text-white/85">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="reveal mt-6 flex items-start gap-2 text-[0.9375rem] font-semibold text-white">
            <Icon name="info" className="mt-0.5 shrink-0 text-sky" />
            {t.note}
          </p>
          <a href="#update" className="btn btn-light reveal mt-6">
            {t.cta}
            <Icon name="arrowRight" size={18} />
          </a>
        </div>
      </div>
    </section>
  );
}
