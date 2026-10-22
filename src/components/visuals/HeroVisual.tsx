/**
 * Hero illustration: the Rainmakers umbrella becomes a tree whose roots grow
 * into a network of nodes — "the ecosystem comes alive". Pure SVG + CSS
 * (stroke growth, fades, gentle breathing on a few hubs), deterministic layout,
 * motion disabled under prefers-reduced-motion.
 */

const W = 560;
const H = 500;
const TRUNK_TOP = 196;
const TRUNK_BOTTOM = 262;
const CX = W / 2;
const NODE_COLORS = ['#ffffff', '#9fe3f5', '#c9d3ff', '#ffd08a', '#b9f0d0', '#ffb3cf'];

let s = 11;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

type Pt = { x: number; y: number };
const roots: { d: string; end: Pt; delay: number }[] = [];
const ROOTS = 13;
for (let i = 0; i < ROOTS; i++) {
  const t = i / (ROOTS - 1);
  const angle = Math.PI * (0.12 + 0.76 * t); // fan from right to left
  const len = 150 + rnd() * 90;
  const end = { x: CX + Math.cos(angle) * len * 1.15, y: TRUNK_BOTTOM + Math.sin(angle) * len * 0.95 };
  const c1 = { x: CX + (end.x - CX) * 0.15, y: TRUNK_BOTTOM + 40 };
  const c2 = { x: CX + (end.x - CX) * 0.7, y: end.y - 50 + rnd() * 30 };
  roots.push({
    d: `M${CX} ${TRUNK_BOTTOM - 6}C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
    end,
    delay: 250 + Math.abs(t - 0.5) * 900,
  });
}

// Secondary nodes scattered around root tips, then lateral links between neighbours.
const nodes: (Pt & { r: number; c: string; delay: number; hub: boolean })[] = [];
roots.forEach((root, i) => {
  nodes.push({ ...root.end, r: i % 4 === 0 ? 6 : 4.2, c: NODE_COLORS[i % NODE_COLORS.length]!, delay: root.delay + 900, hub: i % 4 === 0 });
  for (let k = 0; k < 3; k++) {
    nodes.push({
      x: root.end.x + (rnd() - 0.5) * 70,
      y: Math.min(H - 8, root.end.y + (rnd() - 0.2) * 60),
      r: 1.6 + rnd() * 1.6,
      c: NODE_COLORS[(i + k + 1) % NODE_COLORS.length]!,
      delay: root.delay + 1100 + k * 120,
      hub: false,
    });
  }
});
const links: [Pt, Pt][] = [];
for (let i = 0; i < nodes.length; i++) {
  const a = nodes[i]!;
  const near = nodes
    .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
    .filter((o) => o.j > i && o.d < 70 ** 2)
    .sort((p, q) => p.d - q.d)
    .slice(0, 2);
  for (const o of near) links.push([a, nodes[o.j]!]);
}

// Canopy: the scalloped umbrella from the Rainmakers mark, scaled.
const CW = 250;
const L = CX - CW / 2;
const R = CX + CW / 2;
const TOP = 104;
const scallop = CW / 4;
const canopy = `M${L} ${TOP}C${L} ${TOP + 52} ${CX - 70} ${TRUNK_TOP + 2} ${CX} ${TRUNK_TOP + 2}S${R} ${TOP + 52} ${R} ${TOP}${Array.from(
  { length: 4 },
  () => `a${scallop / 2} ${scallop / 2} 0 0 1 -${scallop} 0`,
).join('')}Z`;

export function HeroVisual({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="hv-glow" cx="50%" cy="38%" r="55%">
          <stop offset="0" stopColor="#7b92e8" stopOpacity="0.35" />
          <stop offset="1" stopColor="#7b92e8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hv-canopy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dfe5ff" />
        </linearGradient>
      </defs>
      <ellipse cx={CX} cy={200} rx={260} ry={200} fill="url(#hv-glow)" />

      <g stroke="#c9d3ff" strokeOpacity="0.28" strokeWidth="0.9">
        {links.map(([a, b], i) => (
          <line
            key={i}
            x1={a.x.toFixed(1)}
            y1={a.y.toFixed(1)}
            x2={b.x.toFixed(1)}
            y2={b.y.toFixed(1)}
            className="node-in"
            style={{ animationDelay: `${1500 + (i % 12) * 60}ms` }}
          />
        ))}
      </g>

      <g fill="none" stroke="#ffffff" strokeOpacity="0.75" strokeLinecap="round">
        {roots.map((r, i) => (
          <path
            key={i}
            d={r.d}
            pathLength={1}
            strokeWidth={i % 3 === 0 ? 2.2 : 1.4}
            className="grow"
            style={{ animationDelay: `${r.delay}ms` }}
          />
        ))}
      </g>

      <path d={`M${CX} ${TRUNK_TOP}V${TRUNK_BOTTOM}`} stroke="#ffffff" strokeWidth="9" strokeLinecap="round" />
      <path d={canopy} fill="url(#hv-canopy)" />

      <g>
        {nodes.map((n, i) => (
          <g key={i} className="node-in" style={{ animationDelay: `${n.delay}ms` }}>
            {n.hub && (
              <circle
                cx={n.x.toFixed(1)}
                cy={n.y.toFixed(1)}
                r={n.r * 2.6}
                fill="none"
                stroke={n.c}
                strokeOpacity="0.5"
                className="breathe"
                style={{ animationDelay: `${(i % 5) * 700}ms` }}
              />
            )}
            <circle cx={n.x.toFixed(1)} cy={n.y.toFixed(1)} r={n.r} fill={n.c} />
          </g>
        ))}
      </g>
    </svg>
  );
}
