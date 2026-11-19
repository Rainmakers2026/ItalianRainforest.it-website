import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import { EcosystemRings } from '../visuals/EcosystemRings';
import { SectionHeader } from './SectionHeader';

export function ForWhom({ t, locale }: { t: Dictionary['forWhom']; locale: Locale }) {
  return (
    <section id="for-whom" aria-labelledby="for-whom-title" className="section section-sky relative overflow-hidden">
      <div className="container-irf">
        <SectionHeader caps id="for-whom-title" title={t.title} accent={t.accent} lead={t.lead} />

        <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1.3fr_0.7fr] lg:gap-12">
          <figure className="mx-auto w-full max-w-[40rem]">
            <EcosystemRings locale={locale} alt={t.imageAlt} centre={t.centre} />
          </figure>
          <div>
            <ul className="grid gap-3">
              {t.audiences.map((l, i) => (
                <li
                  key={l.title}
                  className="reveal flex gap-3.5 rounded-2xl bg-white/70 p-4 backdrop-blur-sm"
                  data-reveal="right"
                  style={{ transitionDelay: `${i * 110}ms` }}
                >
                  <span className="mt-1 size-4 shrink-0 rounded-full bg-savoia ring-4 ring-white" aria-hidden="true" />
                  <div>
                    <h3 className="font-bold text-ink">{l.title}</h3>
                    <p className="mt-0.5 text-[0.9375rem] leading-relaxed text-muted">{rich(l.text)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
