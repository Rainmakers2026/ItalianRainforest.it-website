/**
 * Italian Rainforest mark: the Rainmakers umbrella whose handle becomes a trunk
 * with roots. `tone` controls the disc: "brand" (Savoia disc, white glyph) or
 * "light" (white disc, Savoia glyph) for dark backgrounds.
 */
export function LogoMark({ size = 36, tone = 'brand', className }: { size?: number; tone?: 'brand' | 'light'; className?: string }) {
  const disc = tone === 'brand' ? 'var(--color-savoia)' : '#fff';
  const glyph = tone === 'brand' ? '#fff' : 'var(--color-savoia)';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <circle cx="32" cy="32" r="31" fill={disc} />
      <circle cx="32" cy="32" r="27.5" fill="none" stroke={glyph} strokeWidth="1.6" />
      <path
        fill={glyph}
        d="M14.5 22.5C14.5 31.5 22 38 32 38s17.5-6.5 17.5-15.5a4.375 4.375 0 0 1-8.75 0 4.375 4.375 0 0 1-8.75 0 4.375 4.375 0 0 1-8.75 0 4.375 4.375 0 0 1-8.75 0Z"
      />
      <g fill="none" stroke={glyph} strokeWidth="2.1" strokeLinecap="round">
        <path d="M32 37.5V50" />
        <path d="M32 45c-2.4 1.4-5.2 2.4-8.2 5.6M32 45c2.4 1.4 5.2 2.4 8.2 5.6" />
        <path d="M32 47.6c-1.2 1.4-2.6 2.8-3.4 5M32 47.6c1.2 1.4 2.6 2.8 3.4 5" />
      </g>
    </svg>
  );
}

export function Logo({ tone = 'dark', size = 36 }: { tone?: 'dark' | 'light'; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} tone={tone === 'dark' ? 'brand' : 'light'} />
      <span className={`text-[1.0625rem] leading-[1.05] font-extrabold tracking-[-0.01em] ${tone === 'dark' ? 'text-navy' : 'text-white'}`}>
        Italian
        <br />
        Rainforest
      </span>
    </span>
  );
}
