import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import { Logo } from './Logo';
import { OutboundLink } from './OutboundLink';
import { Icon } from './ui/Icon';

/** Light footer with the blue logo, the community channels and the legal lines. */
export function Footer({ locale, t }: { locale: Locale; t: Dictionary['footer'] }) {
  const nav = [
    ['#why', t.nav.why],
    ['#map', t.nav.map],
    ['#infographic', t.nav.infographic],
    ['#partners', t.nav.partners],
    ['#faq', t.nav.faq],
    ['#contacts', t.contacts],
    ['#newsletter', t.nav.newsletter],
  ] as const;
  return (
    <footer className="border-t border-line bg-white text-muted">
      <div className="container-irf grid gap-10 py-14 md:grid-cols-[1.3fr_0.8fr_1fr]">
        <div>
          <Logo tone="blue" size={46} />
          <p className="mt-4 max-w-sm text-[0.9375rem] text-ink">{t.tagline}</p>
          <p className="mt-2 text-sm">
            <OutboundLink
              href={SITE.rainmakers.url}
              event="rainmakers_outbound"
              props={{ placement: 'footer' }}
              className="font-bold text-savoia-700 underline decoration-savoia/30 underline-offset-4 hover:decoration-savoia"
            >
              {t.initiative}
            </OutboundLink>
          </p>
        </div>

        <nav aria-label="Footer" className="text-sm">
          <p className="text-xs font-bold tracking-[0.14em] text-subtle uppercase">{t.explore}</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-1">
            {nav.map(([href, label]) => (
              <li key={href}>
                <a href={`/${locale}${href}`} className="font-semibold text-ink hover:text-savoia-700">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="text-sm">
          <p className="text-xs font-bold tracking-[0.14em] text-subtle uppercase">{t.communityTitle}</p>
          <p className="mt-3 max-w-xs">{t.communityText}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={SITE.community.telegram}
              target="_blank"
              rel="noopener"
              className="btn btn-primary btn-sm"
              data-placeholder={SITE.community.telegramIsPlaceholder ? 'true' : undefined}
            >
              <Icon name="telegram" size={16} />
              {t.telegram}
            </a>
            <a href={`mailto:${SITE.email}`} className="btn btn-outline btn-sm">
              <Icon name="mail" size={16} />
              {t.newsletter}
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-irf flex flex-col gap-2 py-5 text-[0.8125rem] text-subtle md:flex-row md:items-center md:justify-between">
          <p>{t.copyright}</p>
          <p>{t.license}</p>
          <p className="flex gap-4">
            <a href={`/${locale}/privacy`} className="hover:text-ink">
              {t.privacy}
            </a>
            <a href={`mailto:${SITE.email}`} className="hover:text-ink">
              {SITE.email}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
