import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n';
import { NewsletterForm } from '../forms/NewsletterForm';
import { Icon } from '../ui/Icon';

/** Decorative radar: concentric rings, a slow sweep (static with reduced motion). No data. */
function Radar() {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -top-24 -right-24 size-[26rem] opacity-60 md:size-[34rem]">
      <defs>
        <radialGradient id="radar-fade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9fe3f5" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#9fe3f5" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#9fe3f5" stopOpacity="0" />
          <stop offset="100%" stopColor="#9fe3f5" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="98" fill="url(#radar-fade)" />
      {[24, 48, 72, 96].map((r) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#c9d7ff" strokeOpacity="0.28" strokeWidth="0.6" />
      ))}
      <path d="M100 2V198M2 100H198" stroke="#c9d7ff" strokeOpacity="0.2" strokeWidth="0.5" />
      <g className="origin-center motion-safe:animate-[spin_9s_linear_infinite]" style={{ transformOrigin: '100px 100px' }}>
        <path d="M100 100 L198 100 A98 98 0 0 0 169.3 30.7 Z" fill="url(#radar-sweep)" />
      </g>
      {[
        [138, 64],
        [62, 128],
        [150, 140],
        [84, 52],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill="#9fe3f5" className="motion-safe:animate-pulse" />
      ))}
    </svg>
  );
}

/**
 * RAINFOREST RADAR — the official Italian Rainforest newsletter (#newsletter), last section
 * before the footer. Two columns on desktop (editorial text | sign-up form), stacked on mobile.
 */
export function Newsletter({ t, lead, locale }: { t: Dictionary['newsletter']; lead: Dictionary['lead']; locale: Locale }) {
  return (
    <section id="newsletter" aria-labelledby="newsletter-title" className="on-dark section section-dark relative isolate overflow-hidden">
      <Radar />
      <div className="container-irf relative grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-start lg:gap-16">
        <div className="reveal">
          <p className="eyebrow">{t.eyebrow}</p>
          <h2 id="newsletter-title" className="h2 mt-4 tracking-[0.04em] text-white">
            {t.title}
          </h2>
          <p className="mt-3 text-xl font-bold text-sky md:text-2xl">{t.headline}</p>
          <p className="lead mt-6 font-bold text-white">{t.intro}</p>
          <p className="mt-3 max-w-xl text-white/85">{t.description}</p>
          <p className="mt-6 text-sm font-bold tracking-wide text-white/90">{t.benefitsTitle}</p>
          <ul className="mt-3 grid max-w-xl gap-2.5">
            {t.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-white/90">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-sky ring-1 ring-white/20">
                  <Icon name="check" size={14} />
                </span>
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-7 max-w-xl border-l-2 border-sky/60 pl-4 text-sm text-white/75">{t.giveback}</p>
        </div>
        <div className="reveal" data-reveal="right">
          <NewsletterForm t={t} lead={lead} locale={locale} />
        </div>
      </div>
    </section>
  );
}
