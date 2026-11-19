'use client';

import { useEffect } from 'react';
import { captureUtm } from '@/lib/analytics';

/**
 * One observer for every `.reveal` element on the page — including the ones
 * mounted later (lazy map/database) — plus first-touch UTM capture.
 */
export function RevealObserver() {
  useEffect(() => {
    captureUtm();
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
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
    const observeAll = (root: ParentNode) => root.querySelectorAll<HTMLElement>('.reveal:not(.is-visible)').forEach((el) => io.observe(el));
    observeAll(document);

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations)
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.classList.contains('reveal') && !n.classList.contains('is-visible')) io.observe(n);
          observeAll(n);
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
