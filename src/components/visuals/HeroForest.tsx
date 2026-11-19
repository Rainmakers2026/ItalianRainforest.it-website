/**
 * Hero background: a blue "rainforest" whose trees are the Rainmakers umbrella
 * (as in the IRF mark), with roots that turn into a network of lit nodes.
 * Deterministic SVG, three depth layers + mist, one short rain pass.
 * Rain, glowing nodes and swaying canopies loop forever, so the scene never freezes.
 * Decorative only (aria-hidden); motion disabled under prefers-reduced-motion.
 */

const W = 1440;
const H = 460;
const GROUND = 430;

let seed = 23;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** Umbrella canopy (scalloped top, bowl below) centred on x, top edge at y. */
function canopy(x: number, y: number, w: number) {
  const l = x - w / 2;
  const r = x + w / 2;
  const depth = w * 0.42;
  const s = w / 4;
  return `M${l.toFixed(1)} ${y.toFixed(1)}C${l.toFixed(1)} ${(y + depth * 0.75).toFixed(1)} ${(x - w * 0.28).toFixed(1)} ${(y + depth).toFixed(1)} ${x.toFixed(1)} ${(y + depth).toFixed(1)}S${r.toFixed(1)} ${(y + depth * 0.75).toFixed(1)} ${r.toFixed(1)} ${y.toFixed(1)}${Array.from(
    { length: 4 },
    () => `a${(s / 2).toFixed(1)} ${(s / 2).toFixed(1)} 0 0 1 -${s.toFixed(1)} 0`,
  ).join('')}Z`;
}

type Tree = { x: number; top: number; w: number; trunk: number };
function layer(count: number, minW: number, maxW: number, baseY: number, jitter: number): Tree[] {
  return Array.from({ length: count }, (_, i) => {
    const w = minW + rnd() * (maxW - minW);
    const x = (i + 0.5) * (W / count) + (rnd() - 0.5) * (W / count) * 0.7;
    const top = baseY - w * 1.25 - rnd() * jitter;
    return { x, top, w, trunk: GROUND - (top + w * 0.42) };
  });
}

// Umbrella sizes are 30% larger than the first release (SCALE).
const SCALE = 1.3;
const far = layer(20, 22 * SCALE, 40 * SCALE, 392, 26);
const mid = layer(13, 36 * SCALE, 58 * SCALE, 412, 24);
const near = layer(8, 58 * SCALE, 92 * SCALE, 446, 18);

// Root network along the ground, connecting near-layer trunks.
const roots = near.flatMap((t, i) => {
  const next = near[i + 1];
  const out: { d: string; delay: number }[] = [];
  const bx = t.x;
  out.push({ d: `M${bx.toFixed(1)} ${GROUND - 4}q${-18 - rnd() * 20} 14 ${-40 - rnd() * 30} 22`, delay: 700 + i * 90 });
  out.push({ d: `M${bx.toFixed(1)} ${GROUND - 4}q${18 + rnd() * 20} 14 ${40 + rnd() * 30} 22`, delay: 760 + i * 90 });
  if (next)
    out.push({
      d: `M${bx.toFixed(1)} ${GROUND + 14}Q${((bx + next.x) / 2).toFixed(1)} ${GROUND + 34} ${next.x.toFixed(1)} ${GROUND + 14}`,
      delay: 900 + i * 90,
    });
  return out;
});
const NODE_COLORS = ['#9fe3f5', '#c9d3ff', '#7b92e8', '#ffffff', '#2596be'];
const nodes = near.flatMap((t, i) => [
  { x: t.x, y: GROUND + 14, r: 3.4, c: NODE_COLORS[i % NODE_COLORS.length]!, d: 1300 + i * 110 },
  { x: t.x - 46 - rnd() * 20, y: GROUND + 22, r: 2, c: NODE_COLORS[(i + 2) % NODE_COLORS.length]!, d: 1450 + i * 110 },
  { x: t.x + 46 + rnd() * 20, y: GROUND + 22, r: 2, c: NODE_COLORS[(i + 3) % NODE_COLORS.length]!, d: 1500 + i * 110 },
]);
const rain = Array.from({ length: 46 }, () => ({ x: rnd() * W, y: rnd() * 260, l: 10 + rnd() * 14, d: rnd() * 1600 }));
const stars = Array.from({ length: 22 }, () => ({ x: rnd() * W, y: 20 + rnd() * 220, r: 0.8 + rnd() * 1.4 }));

function Trees({ trees, fill, trunkW, className, sway = false }: { trees: Tree[]; fill: string; trunkW: number; className?: string; sway?: boolean }) {
  return (
    <g fill={fill} className={className}>
      {trees.map((t, i) => (
        <g key={i} className={sway ? 'sway' : undefined} style={sway ? { animationDelay: `${-i * 0.9}s` } : undefined}>
          <path d={canopy(t.x, t.top, t.w)} />
          <rect
            x={(t.x - trunkW / 2).toFixed(1)}
            y={(t.top + t.w * 0.4).toFixed(1)}
            width={trunkW}
            height={Math.max(0, t.trunk + 2).toFixed(1)}
            rx={trunkW / 2}
          />
        </g>
      ))}
    </g>
  );
}

export function HeroForest({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H + 40}`} preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="hf-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7b92e8" stopOpacity="0" />
          <stop offset="1" stopColor="#9fb4f2" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="hf-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b3a5c" stopOpacity="0" />
          <stop offset="0.55" stopColor="#1b3a5c" />
        </linearGradient>
      </defs>

      <g fill="#c9d3ff">
        {stars.map((s, i) => (
          <circle key={i} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={s.r.toFixed(1)} opacity="0.45" />
        ))}
      </g>

      <Trees trees={far} fill="#5a7bd6" trunkW={2.5} className="parallax-far" />
      <rect x="0" y="230" width={W} height="200" fill="url(#hf-mist)" />
      <Trees trees={mid} fill="#3a5bb0" trunkW={4} className="parallax-mid" sway />
      <rect x="0" y="300" width={W} height="150" fill="url(#hf-mist)" />
      <Trees trees={near} fill="#2b4c86" trunkW={6} sway />
      <rect x="0" y={GROUND - 30} width={W} height="110" fill="url(#hf-ground)" />

      <g fill="none" stroke="#7b92e8" strokeOpacity="0.55" strokeWidth="1.3" strokeLinecap="round">
        {roots.map((r, i) => (
          <path key={i} d={r.d} pathLength={1} className="grow" style={{ animationDelay: `${r.delay}ms` }} />
        ))}
      </g>
      <g>
        {nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.x.toFixed(1)}
            cy={n.y.toFixed(1)}
            r={n.r}
            fill={n.c}
            className="node-in"
            style={{ animationDelay: `${n.d}ms` }}
          />
        ))}
      </g>

      <g className="rain" stroke="#c9d3ff" strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round">
        {rain.map((r, i) => (
          <line
            key={i}
            x1={r.x.toFixed(1)}
            y1={r.y.toFixed(1)}
            x2={(r.x - 3).toFixed(1)}
            y2={(r.y + r.l).toFixed(1)}
            opacity="0"
            style={{ animationDelay: `${r.d}ms` }}
          />
        ))}
      </g>
    </svg>
  );
}
