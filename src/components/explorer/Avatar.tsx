import type { PublicPlayer } from '@/lib/data/schema';
import { categoryColor, initials, primaryCategory } from './labels';

/** Logo when available (small, lazy), otherwise initials on the category colour. */
export function Avatar({ player, size = 36 }: { player: PublicPlayer; size?: number }) {
  const color = categoryColor(primaryCategory(player));
  if (player.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote thumbnails from the data source, already small
      <img
        src={player.logo}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="shrink-0 rounded-lg bg-white object-contain ring-1 ring-line"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-lg text-[0.75rem] font-extrabold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.34 }}
    >
      {initials(player.name)}
    </span>
  );
}
