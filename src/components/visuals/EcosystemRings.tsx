'use client';

import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@/lib/i18n/config';

/**
 * The entrepreneur's ecosystem (four concentric layers of enablers), drawn in SVG so it
 * stays sharp at any size. Animation: the layers grow out from the centre one after
 * the other when the figure enters the view, the outer orbit turns slowly, and
 * hovering a layer (or its legend entry) brings it forward. Reduced motion: static.
 */
type Ring = { key: string; color: string; text: string; r0: number; r1: number; rot: number; label: Record<Locale, string>; parts: Record<Locale, string[]> };

const RINGS: Ring[] = [
  {
    key: 'personal',
    color: '#14304f',
    text: '#ffffff',
    r0: 70,
    r1: 124,
    rot: -40,
    label: { it: 'Abilitatori personali', en: 'Personal enablers' },
    parts: { it: ['Formazione informale', 'Formazione formale', 'Mentori / Consulenti'], en: ['Informal education', 'Formal education', 'Mentors / Advisors'] },
  },
  {
    key: 'financial',
    color: '#4b61d1',
    text: '#ffffff',
    r0: 128,
    r1: 184,
    rot: -10,
    label: { it: 'Abilitatori finanziari', en: 'Financial enablers' },
    parts: {
      it: ['Investitori equity', 'Programmi governativi & sovvenzioni', 'Banche', 'Finanza Micro-PMI & Crowdfunding'],
      en: ['Equity investors', 'Government programmes & grants', 'Banks', 'Micro-SME finance & crowdfunding'],
    },
  },
  {
    key: 'business',
    color: '#8a9ff0',
    text: '#0f2440',
    r0: 188,
    r1: 238,
    rot: 20,
    label: { it: 'Abilitatori di business', en: 'Business enablers' },
    parts: { it: ['Servizi professionali', 'Associazioni di networking', 'Incubatori'], en: ['Professional services', 'Networking associations', 'Incubators'] },
  },
  {
    key: 'environmental',
    color: '#2596be',
    text: '#ffffff',
    r0: 242,
    r1: 292,
    rot: 5,
    label: { it: 'Abilitatori ambientali', en: 'Environmental enablers' },
    parts: {
      it: ['Quadro normativo', 'Infrastrutture', 'Lobby e organizzazioni imprenditoriali', 'Media e cultura'],
      en: ['Regulatory framework', 'Infrastructure', 'Lobbies & entrepreneurial organisations', 'Media & culture'],
    },
  },
];

const C = 300;
const GAP = 0.018;
const pt = (r: number, a: number) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
const arc = (r0: number, r1: number, a0: number, a1: number) =>
  `M${pt(r1, a0)}A${r1} ${r1} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 ${a1 - a0 > Math.PI ? 1 : 0} 0 ${pt(r0, a0)}Z`;
function labelPath(r: number, a0: number, a1: number) {
  const mid = (((a0 + a1) / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const bottom = mid > Math.PI / 2 && mid < (3 * Math.PI) / 2;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return bottom ? `M${pt(r + 4, a1)}A${r} ${r} 0 ${large} 0 ${pt(r + 4, a0)}` : `M${pt(r - 4, a0)}A${r} ${r} 0 ${large} 1 ${pt(r - 4, a1)}`;
}

export function EcosystemRings({ locale, alt, centre }: { locale: Locale; alt: string; centre: string }) {
  const [on, setOn] = useState(false);
  const [hot, setHot] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      requestAnimationFrame(() => setOn(true));
      return;
    }
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setOn(true), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Fit every label to its arc (shrink, then hide if it still doesn't fit).
  useEffect(() => {
    svg.current?.querySelectorAll<SVGTextElement>('text[data-fit]').forEach((t) => {
      const p = document.getElementById(t.dataset.fit!) as unknown as SVGPathElement | null;
      if (!p) return;
      const room = p.getTotalLength() - 12;
      const size = [13, 12, 11, 10, 9].find((s) => {
        t.setAttribute('font-size', String(s));
        return t.getComputedTextLength() <= room;
      });
      t.style.visibility = size ? 'visible' : 'hidden';
    });
  }, [locale]);

  return (
    <div ref={root} className={`eco-rings ${on ? 'is-on' : ''}`}>
      <svg ref={svg} viewBox="0 0 600 600" className="h-auto w-full overflow-visible" role="img" aria-label={alt}>
        <defs>
          <radialGradient id="eco-centre" cx="50%" cy="40%" r="65%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e4ecfc" />
          </radialGradient>
          <filter id="eco-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#14304f" floodOpacity="0.22" />
          </filter>
        </defs>
        {/* Slowly turning orbit around the whole ecosystem. */}
        <circle className="eco-orbit" cx={C} cy={C} r={298} fill="none" stroke="#4b61d1" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="2 10" strokeLinecap="round" />
        <g filter="url(#eco-shadow)">
          {[...RINGS].reverse().map((ring) => {
            const i = RINGS.indexOf(ring);
            const parts = ring.parts[locale];
            const span = (2 * Math.PI) / parts.length;
            const rot = (ring.rot * Math.PI) / 180;
            const dim = hot && hot !== ring.key;
            return (
              <g
                key={ring.key}
                className="eco-ring"
                style={{ transitionDelay: `${i * 160}ms`, opacity: dim ? 0.4 : undefined }}
                onMouseEnter={() => setHot(ring.key)}
                onMouseLeave={() => setHot(null)}
              >
                {parts.map((label, j) => {
                  const a0 = rot + j * span + GAP;
                  const a1 = rot + (j + 1) * span - GAP;
                  const id = `eco-${ring.key}-${j}`;
                  return (
                    <g key={label}>
                      <path d={arc(ring.r0, ring.r1, a0, a1)} fill={ring.color} stroke="#ffffff" strokeWidth="2.5" />
                      <path id={id} d={labelPath((ring.r0 + ring.r1) / 2, a0, a1)} fill="none" />
                      <text data-fit={id} fill={ring.text} fontWeight="700" style={{ visibility: 'hidden' }} pointerEvents="none">
                        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
                          {label}
                        </textPath>
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
        <g className="eco-centre">
          <circle cx={C} cy={C} r={64} fill="url(#eco-centre)" stroke="#ffffff" strokeWidth="3" />
          <text x={C} y={C + 6} textAnchor="middle" fill="#14304f" fontSize="17" fontWeight="900">
            {centre}
          </text>
        </g>
      </svg>
      <ul className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[0.8125rem] font-semibold text-muted">
        {RINGS.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              onMouseEnter={() => setHot(r.key)}
              onMouseLeave={() => setHot(null)}
              onFocus={() => setHot(r.key)}
              onBlur={() => setHot(null)}
              className={`inline-flex items-center gap-2 rounded-full px-2 py-1 transition-colors ${hot === r.key ? 'bg-white text-ink shadow-sm' : ''}`}
            >
              <span className="size-3 rounded-[4px]" style={{ background: r.color }} aria-hidden="true" />
              {r.label[locale]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
