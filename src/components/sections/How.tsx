import { FOCUS_BOX, FOCUS_MARKERS, FOCUS_PROVINCES, FOCUS_REGION, ITALY_REGIONS, ITALY_VIEWBOX } from '@/lib/geo/italy-svg';
import { PROVINCES } from '@/lib/geo/territories';
import { fmt, type Dictionary } from '@/lib/i18n';
import { MARK_CANOPY } from '../Logo';
import { Icon } from '../ui/Icon';
import { ExploreLink } from './ExploreLink';
import { SectionHeader } from './SectionHeader';

// Zoom panel geometry (SVG user units): Italy on the left, Lombardy enlarged on the right.
const [bx0, by0, bx1, by1] = FOCUS_BOX;
const ZOOM = 3.6;
const PANEL = { x: 440, y: 20, pad: 22 };
const PANEL_W = (bx1 - bx0) * ZOOM + PANEL.pad * 2;
const PANEL_H = (by1 - by0) * ZOOM + PANEL.pad * 2;
const toPanel = ([x, y]: [number, number]) =>
  [PANEL.x + PANEL.pad + (x - bx0) * ZOOM, PANEL.y + PANEL.pad + (y - by0) * ZOOM] as const;
const [, , , italyH] = ITALY_VIEWBOX.split(' ').map(Number) as [number, number, number, number];
const VIEW_W = PANEL.x + PANEL_W + 6;
const VIEW_H = Math.max(italyH, PANEL.y + PANEL_H) + 4;
// Deterministic jitter so the umbrellas don't sit on a visible grid.
const JITTER: [number, number][] = [
  [3, -2],
  [-4, 3],
  [2, 4],
  [-3, -3],
  [4, 1],
  [-2, -4],
  [1, 3],
  [-4, 0],
];

/** Small IRF umbrella (same canopy as the logo) centred on x,y. */
function Umbrella({ x, y, i }: { x: number; y: number; i: number }) {
  const [jx, jy] = JITTER[i % JITTER.length] ?? [0, 0];
  return (
    <g className="mark-in" style={{ animationDelay: `${500 + i * 90}ms` }}>
      <g transform={`translate(${x + jx - 11} ${y + jy - 12}) scale(0.055)`}>
        <path d={MARK_CANOPY} fill="#ffffff" />
        <path d="M199.5 220V340" stroke="#ffffff" strokeWidth="22" strokeLinecap="round" />
      </g>
      <circle cx={x + jx} cy={y + jy + 9} r="2" fill="#9fe3f5" />
    </g>
  );
}

function Infographic({ t, players }: { t: Dictionary['how']; players: number }) {
  const focusProvinces = PROVINCES.filter((p) => p.region === FOCUS_REGION);
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-auto w-full" role="img" aria-label={t.visualAlt}>
      <defs>
        <linearGradient id="how-focus" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5a70e0" />
          <stop offset="0.6" stopColor="#4b61d1" />
          <stop offset="1" stopColor="#2596be" />
        </linearGradient>
        <filter id="how-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <clipPath id="how-panel-clip">
          <rect x={PANEL.x} y={PANEL.y} width={PANEL_W} height={PANEL_H} rx="22" />
        </clipPath>
      </defs>

      {/* Italy: every region in a soft tone, Lombardy in brand blue. */}
      <g transform={`translate(0 ${(VIEW_H - italyH) / 2})`}>
        {ITALY_REGIONS.map((r) =>
          r.slug === FOCUS_REGION ? null : <path key={r.slug} d={r.d} fill="#ffffff" stroke="#cbdaf8" strokeWidth="0.9" strokeLinejoin="round" />,
        )}
        {ITALY_REGIONS.filter((r) => r.slug === FOCUS_REGION).map((r) => (
          <g key={r.slug}>
            <path d={r.d} fill="#4b61d1" opacity="0.55" filter="url(#how-glow)" className="pulse-soft" />
            <path d={r.d} fill="url(#how-focus)" stroke="#ffffff" strokeWidth="1.2" strokeLinejoin="round" />
          </g>
        ))}
        <rect
          x={bx0 - 4}
          y={by0 - 4}
          width={bx1 - bx0 + 8}
          height={by1 - by0 + 8}
          rx="8"
          fill="none"
          stroke="#4b61d1"
          strokeWidth="1.4"
          strokeDasharray="4 3"
        />
        {/* Connectors to the zoom panel. */}
        <g fill="none" stroke="#7b92e8" strokeWidth="1.3" strokeLinecap="round">
          <path className="draw" pathLength={1} d={`M${bx1 + 4} ${by0 - 4}L${PANEL.x} ${PANEL.y - (VIEW_H - italyH) / 2 + 18}`} />
          <path className="draw" pathLength={1} d={`M${bx1 + 4} ${by1 + 4}L${PANEL.x} ${PANEL.y + PANEL_H - (VIEW_H - italyH) / 2 - 18}`} />
        </g>
      </g>

      {/* Zoom panel: Lombardy with its provinces and local players. */}
      <g>
        <rect x={PANEL.x + 6} y={PANEL.y + 14} width={PANEL_W} height={PANEL_H} rx="26" fill="#0f2238" opacity="0.18" filter="url(#how-glow)" />
        <rect x={PANEL.x} y={PANEL.y} width={PANEL_W} height={PANEL_H} rx="26" fill="#142d4a" />
        <g clipPath="url(#how-panel-clip)">
          <circle cx={PANEL.x + PANEL_W * 0.8} cy={PANEL.y} r={PANEL_W * 0.7} fill="#4b61d1" opacity="0.35" filter="url(#how-glow)" />
          <g transform={`translate(${PANEL.x + PANEL.pad - bx0 * ZOOM} ${PANEL.y + PANEL.pad - by0 * ZOOM}) scale(${ZOOM})`}>
            {ITALY_REGIONS.filter((r) => r.slug !== FOCUS_REGION).map((r) => (
              <path key={r.slug} d={r.d} fill="#1b3a5c" stroke="#24497a" strokeWidth={0.6 / ZOOM} />
            ))}
            {FOCUS_PROVINCES.map((d, i) => (
              <path key={i} d={d} fill="url(#how-focus)" stroke="#c9d7ff" strokeOpacity="0.55" strokeWidth={1 / ZOOM} strokeLinejoin="round" />
            ))}
          </g>
          {FOCUS_MARKERS.map((m, i) => {
            const [x, y] = toPanel(m);
            return <Umbrella key={i} x={x} y={y} i={i} />;
          })}
        </g>
        <rect x={PANEL.x} y={PANEL.y} width={PANEL_W} height={PANEL_H} rx="26" fill="none" stroke="#9fb3f0" strokeOpacity="0.55" />
        {/* Region label + live player count. */}
        <g transform={`translate(${PANEL.x + 18} ${PANEL.y + PANEL_H - 62})`}>
          <rect width="250" height="44" rx="22" fill="#ffffff" />
          <circle cx="22" cy="22" r="7" fill="#4b61d1" />
          <text x="38" y="28" fontSize="17" fontWeight="800" fill="#14304f">
            {t.focusTitle}
          </text>
          {players > 0 && (
            <text x="234" y="28" textAnchor="end" fontSize="14" fontWeight="700" fill="#4b61d1">
              {fmt(t.focusPlayers, { n: players })}
            </text>
          )}
        </g>
        <text x={PANEL.x + PANEL_W - 20} y={PANEL.y + 32} textAnchor="end" fontSize="13" fontWeight="700" fill="#9fe3f5" letterSpacing="1.6">
          {`${focusProvinces.length} ${t.province.toUpperCase()}`}
        </text>
      </g>
      <title>{t.visualAlt}</title>
    </svg>
  );
}

export function How({ t, players, locale }: { t: Dictionary['how']; players: number; locale: string }) {
  const provinces = PROVINCES.filter((p) => p.region === FOCUS_REGION).map((p) => p.name);
  return (
    <section id="how" aria-labelledby="how-title" className="section section-sky relative overflow-hidden">
      <div className="container-irf">
        <SectionHeader caps id="how-title" title={t.title} accent={t.accent} lead={t.line}>
          <p className="lead mt-4 text-muted">{t.text}</p>
        </SectionHeader>

        <div className="mt-12 grid items-center gap-10 lg:grid-cols-[minmax(0,1.9fr)_minmax(16rem,0.6fr)] lg:gap-10">
          <figure className="reveal relative" data-reveal="scale">
            <div
              aria-hidden="true"
              className="absolute -inset-8 -z-10 rounded-[48px] bg-[radial-gradient(circle_at_30%_30%,rgb(123_146_232/0.28),transparent_65%)] blur-2xl"
            />
            <Infographic t={t} players={players} />
          </figure>

          {/* The two filters the infographic illustrates. */}
          <div className="reveal grid gap-4" data-reveal="right">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#fff6e0] px-3 py-1 text-xs font-bold text-[#6b4a00] ring-1 ring-[#f2d48a]">
              <Icon name="info" size={14} />
              {t.example}
            </span>
            <div className="card p-5 shadow-[var(--shadow-card)]">
              <p className="text-xs font-bold tracking-[0.14em] text-subtle uppercase">{t.region}</p>
              <p className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-savoia px-4 py-3 font-bold text-white shadow-[var(--shadow-glow)]">
                <span className="flex items-center gap-2">
                  <Icon name="pin" size={18} />
                  {t.focusTitle}
                </span>
                <Icon name="check" size={18} />
              </p>
              <p className="mt-5 text-xs font-bold tracking-[0.14em] text-subtle uppercase">{t.province}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {provinces.map((name) => (
                  <li key={name} className="rounded-full bg-savoia-50 px-2.5 py-1 text-[0.8125rem] font-semibold text-savoia-700">
                    {name}
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-line pt-4 text-[0.9375rem] leading-relaxed text-muted">{t.focusText}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={`/infographic/italian-rainforest-infografica-${locale}.png`} download className="btn btn-primary w-fit">
                <Icon name="download" size={18} />
                {t.cta}
              </a>
              <ExploreLink query={`region=${FOCUS_REGION}`} className="btn btn-light w-fit">
                <Icon name="map" size={18} />
                {t.seeOnMap}
              </ExploreLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
