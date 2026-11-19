import Image from 'next/image';
import type { Dictionary } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import { Icon } from '../ui/Icon';
import { SectionHeader } from './SectionHeader';

/**
 * "Partner": the organisations that made the giveback possible. Only verified
 * partners (SITE.partners, see docs/audit.md) are shown; until they are confirmed
 * the grid shows empty placeholder slots — no invented names or logos.
 */
export function Partners({ t }: { t: Dictionary['partners'] }) {
  const partners = SITE.partners;
  return (
    <section id="partners" aria-labelledby="partners-title" className="section relative overflow-hidden bg-white">
      <div className="container-irf">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeader caps id="partners-title" title={t.title} accent={t.accent} lead={t.lead} />
          <a
            href={`mailto:${SITE.email}?subject=${encodeURIComponent(t.subject)}`}
            className="reveal btn btn-outline"
          >
            <Icon name="handshake" size={18} />
            {t.cta}
          </a>
        </div>

        {partners.length > 0 ? (
          <ul className="reveal mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {partners.map((p) => (
              <li key={p.name}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener"
                  className="lift card flex h-28 items-center justify-center p-5"
                  aria-label={p.name}
                >
                  <Image src={p.logo} alt={p.name} width={160} height={64} className="max-h-16 w-auto object-contain" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="reveal mt-12">
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-label={t.placeholderNote}>
              {Array.from({ length: 5 }, (_, i) => (
                <li
                  key={i}
                  className="flex h-28 items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-sky-50/60 text-sm font-semibold text-subtle"
                >
                  {t.placeholder}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-subtle">{t.placeholderNote}</p>
          </div>
        )}
      </div>
    </section>
  );
}
