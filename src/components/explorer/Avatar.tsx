import type { PublicPlayer } from '@/lib/data/schema';
import { categoryColor, initials, primaryCategory } from './labels';

/**
 * The player's logo (pre-sized local file, lazy) on a tile that suits its artwork —
 * light logos sit on navy — otherwise initials on the player-type colour.
 */
export function Avatar({ player, size = 36, wide = false }: { player: PublicPlayer; size?: number; wide?: boolean }) {
  const color = categoryColor(primaryCategory(player));
  const w = wide ? Math.round(size * 1.9) : size;
  if (player.logo) {
    const dark = player.logo.tone === 'light';
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ${dark ? 'bg-navy ring-navy' : 'bg-white ring-line'}`}
        style={{ width: w, height: size, padding: Math.max(3, size * 0.1) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised local logos */}
        <img
          src={player.logo.src}
          alt=""
          width={player.logo.w ?? size}
          height={player.logo.h ?? size}
          loading="lazy"
          decoding="async"
          className="max-h-full max-w-full object-contain"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-lg text-[0.75rem] font-extrabold text-white"
      style={{ width: w, height: size, background: color, fontSize: size * 0.34 }}
    >
      {initials(player.name)}
    </span>
  );
}
