import type { Dictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n/config';
import { PARTNERS } from '@/lib/partners';
import { SITE } from '@/lib/site';
import { Icon } from '../ui/Icon';
import { PartnerGrid } from './PartnerGrid';
import { SectionHeader } from './SectionHeader';

/**
 * "Partner": the organisations that support the giveback (src/lib/partners.ts).
 * Each logo opens a card with the partner's profile and a link to its website.
 */
export function Partners({ t, locale, closeLabel }: { t: Dictionary['partners']; locale: Locale; closeLabel: string }) {
  return (
    <section id="partners" aria-labelledby="partners-title" className="section relative overflow-hidden bg-white">
      <div className="container-irf">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeader caps id="partners-title" title={t.title} accent={t.accent} lead={t.lead} />
          <a href={`mailto:${SITE.email}?subject=${encodeURIComponent(t.subject)}`} className="reveal btn btn-outline">
            <Icon name="handshake" size={18} />
            {t.cta}
          </a>
        </div>
        <PartnerGrid partners={PARTNERS} locale={locale} t={t} closeLabel={closeLabel} />
      </div>
    </section>
  );
}
