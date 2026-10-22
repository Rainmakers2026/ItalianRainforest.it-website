'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n';
import { LanguageSwitch } from './LanguageSwitch';
import { Logo } from './Logo';
import { Icon } from './ui/Icon';

export function Header({ locale, t }: { locale: Locale; t: Pick<Dictionary, 'nav' | 'a11y'> }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const links = [
    ['why', t.nav.why],
    ['how', t.nav.how],
    ['for-whom', t.nav.forWhom],
    ['map', t.nav.map],
    ['database', t.nav.database],
    ['faq', t.nav.faq],
  ] as const;

  // Highlight the section in view.
  useEffect(() => {
    const els = links.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 h-[var(--header-h)] border-b border-line/80 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="container-irf flex h-full items-center justify-between gap-4">
        <a href={`/${locale}`} className="shrink-0 rounded-lg" aria-label="Italian Rainforest — home">
          <Logo size={34} />
        </a>

        <nav aria-label={t.a11y.mainNav} className="hidden lg:block">
          <ul className="flex items-center gap-1 text-[0.9375rem] font-semibold">
            {links.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={active === id ? 'location' : undefined}
                  className={`rounded-full px-3 py-2 transition-colors hover:text-savoia-700 ${
                    active === id ? 'text-savoia-700' : 'text-muted'
                  }`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSwitch locale={locale} label={t.a11y.language} />
          </div>
          <a href="#map" className="btn btn-primary btn-sm sm:min-h-10 sm:px-4 sm:text-sm">
            <Icon name="map" size={16} />
            <span className="hidden sm:inline">{t.nav.cta}</span>
            <span className="sm:hidden">{t.nav.ctaShort}</span>
          </a>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full text-navy hover:bg-mist lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t.a11y.closeMenu : t.a11y.menu}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line bg-white shadow-[var(--shadow-card)] lg:hidden"
      >
        <nav aria-label={t.a11y.mainNav} className="container-irf py-3">
          <ul className="grid gap-1 text-base font-semibold">
            {links.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 text-ink hover:bg-mist">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-line px-3 pt-3 sm:hidden">
            <span className="text-sm text-muted">{t.a11y.language}</span>
            <LanguageSwitch locale={locale} label={t.a11y.language} />
          </div>
        </nav>
      </div>
    </header>
  );
}
