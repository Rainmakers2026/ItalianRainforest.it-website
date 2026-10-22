import type { Dictionary } from '@/lib/i18n';
import { SectionHeader } from './SectionHeader';

export type FaqItem = { q: string; a: string };

/** Native <details> accordion: accessible, works without JavaScript, content stays crawlable. */
export function Faq({ t, items }: { t: Dictionary['faq']; items: FaqItem[] }) {
  return (
    <section id="faq" aria-labelledby="faq-title" className="section bg-white">
      <div className="container-irf grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+32px)] lg:self-start">
          <SectionHeader id="faq-title" eyebrow={t.eyebrow} title={t.title} />
        </div>
        <div className="divide-y divide-line border-y border-line">
          {items.map((item, i) => (
            <details key={item.q} className="group reveal" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-left text-[1.0625rem] font-bold text-navy marker:content-none hover:text-savoia-700 [&::-webkit-details-marker]:hidden">
                <h3>{item.q}</h3>
                <span
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-savoia-50 text-savoia-700 transition-transform duration-200 group-open:rotate-45"
                  aria-hidden="true"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14">
                    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>
              <p className="pb-6 pr-12 leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
