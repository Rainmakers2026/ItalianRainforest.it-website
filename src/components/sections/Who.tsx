import Image from 'next/image';
import type { Dictionary } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import { OutboundLink } from '../OutboundLink';
import { Icon } from '../ui/Icon';
import { SectionHeader } from './SectionHeader';

function RainmakersMark() {
  return (
    <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="31" fill="var(--color-savoia)" />
      <circle cx="32" cy="32" r="27.5" fill="none" stroke="#fff" strokeWidth="1.6" />
      <path
        fill="#fff"
        d="M14.5 22.5C14.5 31.5 22 38 32 38s17.5-6.5 17.5-15.5a4.375 4.375 0 0 1-8.75 0 4.375 4.375 0 0 1-8.75 0 4.375 4.375 0 0 1-8.75 0 4.375 4.375 0 0 1-8.75 0Z"
      />
      <path d="M32 37.5v11.5a3.2 3.2 0 0 1-6.4 0" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Who({ t }: { t: Dictionary['who'] }) {
  return (
    <section id="who" aria-labelledby="who-title" className="section bg-white">
      <div className="container-irf grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div>
          <SectionHeader id="who-title" eyebrow={t.eyebrow} title={t.title} />
          <div className="prose-irf reveal mt-6 text-[1.0625rem] leading-relaxed text-muted">
            {t.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>

        <div className="reveal self-center">
          <div className="card p-6 shadow-[var(--shadow-card)] md:p-8">
            <div className="flex items-center gap-4">
              <RainmakersMark />
              <div>
                <p className="text-xl leading-tight font-extrabold text-navy">Rainmakers</p>
                <p className="text-sm text-muted">
                  meaningful innovation · {SITE.rainmakers.city}, {SITE.rainmakers.foundingYear}
                </p>
              </div>
            </div>
            <OutboundLink
              href={SITE.rainmakers.url}
              event="rainmakers_outbound"
              props={{ placement: 'who' }}
              className="btn btn-primary mt-6 w-full sm:w-auto"
            >
              {t.cta}
              <Icon name="external" size={16} />
            </OutboundLink>
            <p className="mt-6 border-t border-line pt-5 text-[0.9375rem] text-muted">
              {t.abroad}{' '}
              <a
                href={`mailto:${SITE.email}`}
                className="font-bold text-savoia-700 underline decoration-savoia/30 underline-offset-4 hover:decoration-savoia"
              >
                {t.abroadCta}
              </a>
            </p>
          </div>

          {SITE.partners.length > 0 && (
            <div className="mt-8">
              <p className="eyebrow text-subtle">{t.partnersTitle}</p>
              <ul className="mt-4 flex flex-wrap items-center gap-6">
                {SITE.partners.map((p) => (
                  <li key={p.name}>
                    <a href={p.url} target="_blank" rel="noopener">
                      <Image src={p.logo} alt={p.name} width={120} height={40} className="h-10 w-auto object-contain" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
