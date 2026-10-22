'use client';

import { useEffect } from 'react';
import { captureUtm } from '@/lib/analytics';

/** One observer for every `.reveal` element on the page, plus first-touch UTM capture. */
export function RevealObserver() {
  useEffect(() => {
    captureUtm();
    const els = document.querySelectorAll<HTMLElement>('.reveal:not(.is-visible)');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
