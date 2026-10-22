import Image from 'next/image';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n';
import { SITE } from '@/lib/site';

/**
 * Reviews + "Already featured in". Rendered only from verified entries in
 * lib/site.ts — nothing is shown until real, sourced items exist.
 */
export function Proof({ t, locale }: { t: Dictionary['proof']; locale: Locale }) {
  const { testimonials, press } = SITE;
  if (!testimonials.length && !press.length) return null;
  return (
    <section aria-label={`${t.reviewsTitle} · ${t.pressTitle}`} className="section bg-mist">
      <div className="container-irf grid gap-14">
        {testimonials.length > 0 && (
          <div>
            <h2 className="h2 text-navy">{t.reviewsTitle}</h2>
            <ul className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((r) => (
                <li key={r.name} className="card p-6">
                  <blockquote>
                    <p className="leading-relaxed text-ink">“{r.quote[locale]}”</p>
                    <footer className="mt-4 text-sm">
                      <span className="font-bold text-navy">{r.name}</span>
                      <span className="text-muted">
                        {' '}
                        · {r.role}
                        {r.org && `, ${r.org}`}
                      </span>
                    </footer>
                  </blockquote>
                </li>
              ))}
            </ul>
          </div>
        )}
        {press.length > 0 && (
          <div>
            <h2 className="h2 text-navy">{t.pressTitle}</h2>
            <ul className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-6">
              {press.map((p) => (
                <li key={p.url}>
                  <a href={p.url} target="_blank" rel="noopener" className="block opacity-80 hover:opacity-100" title={p.title}>
                    {p.logo ? (
                      <Image src={p.logo} alt={p.outlet} width={140} height={40} className="h-9 w-auto object-contain" />
                    ) : (
                      <span className="text-lg font-extrabold text-navy">{p.outlet}</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
