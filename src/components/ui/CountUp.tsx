'use client';

import { useEffect, useRef } from 'react';

/**
 * Number that counts up when it enters the viewport. The real value is
 * server-rendered (crawlers, no-JS, reduced motion all see it); the animation
 * only rewrites the text node on the client.
 */
export function CountUp({
  value,
  locale,
  duration = 1400,
  className,
}: {
  value: number;
  locale: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const nf = new Intl.NumberFormat(locale);
    let raf = 0;
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = nf.format(Math.round(value * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, locale, duration]);

  return (
    <span ref={ref} className={className}>
      {new Intl.NumberFormat(locale).format(value)}
    </span>
  );
}
