import type { Dictionary } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import { SITE } from '@/lib/site';
import { MARK_CANOPY } from '../Logo';
import { OutboundLink } from '../OutboundLink';
import { Icon } from '../ui/Icon';
import { SectionHeader } from './SectionHeader';

/** The rainmakers.it mark (ring, umbrella, J-shaped handle). */
function RainmakersMark() {
  return (
    <svg width="64" height="64" viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      <circle cx="200" cy="200" r="196" fill="none" stroke="#fff" strokeWidth="7" />
      <path d={MARK_CANOPY} fill="#fff" />
      <path d="M199.5 220V320a22 22 0 0 1-44 0" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" />
    </svg>
  );
}

export function Who({ t }: { t: Dictionary['who'] }) {
  return (
    <section id="who" aria-labelledby="who-title" className="on-dark section section-dark relative overflow-hidden">
      <div className="container-irf grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div>
          <SectionHeader caps id="who-title" title={t.title} accent={t.accent} dark />
          <div className="prose-irf reveal mt-7 text-[1.0625rem] leading-relaxed text-white/85">
            {t.paragraphs.map((p) => (
              <p key={p}>{rich(p)}</p>
            ))}
          </div>
        </div>

        <div className="reveal" data-reveal="right">
          <div className="glass p-7 shadow-[var(--shadow-pop)] md:p-9">
            <div className="flex items-center gap-5">
              <RainmakersMark />
              <div>
                <p className="text-2xl leading-tight font-black tracking-[-0.02em]">Rainmakers</p>
                <p className="text-white/75">
                  meaningful innovation · {SITE.rainmakers.city}, {SITE.rainmakers.foundingYear}
                </p>
              </div>
            </div>
            <OutboundLink
              href={SITE.rainmakers.url}
              event="rainmakers_outbound"
              props={{ placement: 'who' }}
              className="btn btn-primary mt-7 w-full sm:w-auto"
            >
              {t.cta}
              <Icon name="external" size={16} />
            </OutboundLink>
            <p className="mt-7 border-t border-white/15 pt-5 text-white/85">
              {t.abroad}{' '}
              <a
                href={`mailto:${SITE.email}`}
                className="font-bold text-sky underline decoration-sky/40 underline-offset-4 hover:decoration-sky"
              >
                {t.abroadCta}
              </a>
              .
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}
