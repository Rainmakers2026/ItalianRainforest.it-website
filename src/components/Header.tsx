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

  // Same order as the sections on the page.
  const links = [
    ['why', t.nav.why],
    ['how', t.nav.how],
    ['what', t.nav.what],
    ['for-whom', t.nav.forWhom],
    ['who', t.nav.who],
    ['partners', t.nav.partners],
  ] as const;

  // Highlight the section under the middle of the viewport. Re-queries the DOM on
  // every check because the map/database sections are mounted lazily.
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const mid = window.innerHeight / 2;
      let current: string | null = null;
      for (const [id] of links) {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (r && r.top <= mid && r.bottom >= mid) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="on-dark sticky top-0 z-40 h-[var(--header-h)] border-b border-white/10 bg-base/95 text-white backdrop-blur-md supports-[backdrop-filter]:bg-base/90">
      <div className="container-irf flex h-full items-center justify-between gap-4">
        <a href={`/${locale}`} className="shrink-0 rounded-lg" aria-label="Italian Rainforest — home">
          <Logo size={46} tone="white" />
        </a>

        <nav aria-label={t.a11y.mainNav} className="hidden lg:block">
          <ul className="flex items-center gap-0 text-[0.9375rem] font-medium xl:gap-0.5">
            {links.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={active === id ? 'location' : undefined}
                  className={`relative rounded-full px-2.5 py-2 transition-colors xl:px-3 hover:bg-white/[0.06] ${
                    active === id
                      ? 'bg-white/[0.06] text-white after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-[image:var(--grad-brand)]'
                      : 'text-white/85 hover:text-white'
                  }`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:block">
            <LanguageSwitch locale={locale} />
          </div>
          <a href="#map" className="btn btn-primary btn-sm sm:min-h-11 sm:px-5 sm:text-[0.9375rem]">
            <Icon name="map" size={17} />
            <span className="hidden sm:inline">{t.nav.cta}</span>
            <span className="sm:hidden">{t.nav.ctaShort}</span>
          </a>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10 lg:hidden"
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
        className="absolute inset-x-0 top-full border-b border-white/10 bg-deep/95 backdrop-blur-md lg:hidden"
      >
        <nav aria-label={t.a11y.mainNav} className="container-irf py-3">
          <ul className="grid gap-1 text-lg font-bold">
            {links.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-white hover:bg-white/[0.06]">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-white/10 px-3 pt-3 sm:hidden">
            <span className="text-sm text-white/70">{t.a11y.language}</span>
            <LanguageSwitch locale={locale} />
          </div>
        </nav>
      </div>
    </header>
  );
}
