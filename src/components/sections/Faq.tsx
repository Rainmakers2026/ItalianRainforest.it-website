import type { ReactNode } from 'react';
import type { Dictionary } from '@/lib/i18n';
import { SectionHeader } from './SectionHeader';

export type FaqItem = { q: string; a: string };

/** Native <details> accordion: accessible, works without JavaScript, content stays crawlable. */
export function Faq({ t, items, visuals = {} }: { t: Dictionary['faq']; items: FaqItem[]; visuals?: Record<number, ReactNode> }) {
  return (
    <section id="faq" aria-labelledby="faq-title" className="section section-sky">
      <div className="container-irf grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+32px)] lg:self-start">
          <SectionHeader id="faq-title" title={t.title} />
        </div>
        <div className="grid min-w-0 gap-3">
          {items.map((item, i) => (
            <details
              key={item.q}
              className="group reveal rounded-[var(--radius-card)] border border-sky-200 bg-white transition-shadow duration-300 open:shadow-[var(--shadow-card)]"
              open={i === 0 || i in visuals}
              style={{ transitionDelay: `${(i % 5) * 50}ms` }}
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 text-left sm:gap-6 sm:px-6 sm:py-5 text-[1.0625rem] font-bold text-ink marker:content-none hover:text-savoia [&::-webkit-details-marker]:hidden">
                <h3>{item.q}</h3>
                <span
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-savoia text-white transition-transform duration-300 group-open:rotate-45"
                  aria-hidden="true"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14">
                    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>
              <p className="px-4 pr-12 pb-5 leading-relaxed sm:px-6 sm:pr-16 sm:pb-6 text-muted">{item.a}</p>
              {visuals[i] && <div className="px-3 pb-4 sm:px-6 sm:pb-6">{visuals[i]}</div>}
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
