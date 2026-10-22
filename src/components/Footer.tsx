import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import { Logo } from './Logo';
import { OutboundLink } from './OutboundLink';

export function Footer({ locale, t }: { locale: Locale; t: Dictionary['footer'] }) {
  return (
    <footer className="on-dark bg-deep text-white/80">
      <div className="container-irf grid gap-8 py-12 md:grid-cols-[1.2fr_1fr] md:items-end">
        <div>
          <Logo tone="light" size={40} />
          <p className="mt-4 max-w-sm text-sm">{t.tagline}</p>
          <p className="mt-2 text-sm">
            <OutboundLink
              href={SITE.rainmakers.url}
              event="rainmakers_outbound"
              props={{ placement: 'footer' }}
              className="font-bold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
            >
              {t.initiative}
            </OutboundLink>
          </p>
        </div>
        <div className="grid gap-3 text-sm md:justify-items-end md:text-right">
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 md:justify-end">
              <li>
                <a href={`/${locale}/privacy`} className="hover:text-white">
                  {t.privacy}
                </a>
              </li>
              <li>
                <a href={`/${locale}#contacts`} className="hover:text-white">
                  {t.contacts}
                </a>
              </li>
              <li>
                <a href={`mailto:${SITE.email}`} className="hover:text-white">
                  {SITE.email}
                </a>
              </li>
            </ul>
          </nav>
          <p className="text-white/60">{t.license}</p>
          <p className="text-white/60">© {new Date().getFullYear()} Rainmakers</p>
        </div>
      </div>
    </footer>
  );
}
