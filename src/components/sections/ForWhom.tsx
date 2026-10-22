import Image from 'next/image';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n';
import ecosystemEn from '../../../public/images/ecosystem-en.webp';
import ecosystemIt from '../../../public/images/ecosystem-it.webp';
import { SectionHeader } from './SectionHeader';

// Layer colours mirror the diagram legend.
const LAYER_COLORS = ['#1b3a5c', '#4b61d1', '#7b92e8', '#2596be'];

export function ForWhom({ t, locale }: { t: Dictionary['forWhom']; locale: Locale }) {
  // The diagram has text baked in: always show the variant in the page language.
  const img = locale === 'it' ? ecosystemIt : ecosystemEn;
  return (
    <section id="for-whom" aria-labelledby="for-whom-title" className="on-dark section bg-navy text-white">
      <div className="container-irf">
        <SectionHeader id="for-whom-title" eyebrow={t.eyebrow} title={t.title} lead={t.lead} dark />

        <div className="mt-10 grid items-center gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:gap-12">
          <figure className="reveal rounded-2xl bg-white p-4 sm:p-6">
            <Image
              src={img}
              alt={t.imageAlt}
              sizes="(min-width: 1240px) 700px, (min-width: 1024px) 58vw, 92vw"
              className="h-auto w-full"
              placeholder="blur"
            />
          </figure>
          <div className="reveal">
            <h3 className="text-xl font-extrabold">{t.modelTitle}</h3>
            <p className="mt-2 leading-relaxed text-white/85">{t.modelText}</p>
            <ul className="mt-6 grid gap-4">
              {t.layers.map((l, i) => (
                <li key={l.title} className="flex gap-3">
                  <span
                    className="mt-1 size-3.5 shrink-0 rounded-full ring-2 ring-white/60"
                    style={{ background: LAYER_COLORS[i] }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-bold">{l.title}</p>
                    <p className="text-sm leading-relaxed text-white/80">{l.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <h3 className="reveal mt-16 text-xl font-extrabold">{t.audiencesTitle}</h3>
        <ul className="mt-6 grid gap-px overflow-hidden rounded-2xl bg-white/15 sm:grid-cols-2 lg:grid-cols-4">
          {t.audiences.map((a, i) => (
            <li key={a.title} className="reveal bg-navy p-5" style={{ transitionDelay: `${(i % 4) * 70}ms` }}>
              <p className="font-extrabold text-sky">{a.title}</p>
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-white/85">{a.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
