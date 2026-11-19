'use client';

import { memo, useMemo } from 'react';
import type { PublicPlayer } from '@/lib/data/schema';
import type { Locale } from '@/lib/i18n/config';
import { Avatar } from './Avatar';
import { useExplorer } from './ExplorerProvider';
import { categoryName, locationLabel } from './labels';

const Row = memo(function Row({
  p,
  locale,
  highlighted,
  onEnter,
  onLeave,
  onOpen,
}: {
  p: PublicPlayer;
  locale: Locale;
  highlighted: boolean;
  onEnter: (id: string) => void;
  onLeave: () => void;
  onOpen: (id: string) => void;
}) {
  const loc = locationLabel(p, locale);
  return (
    <li className="[contain-intrinsic-size:auto_60px] [content-visibility:auto]">
      <button
        type="button"
        onMouseEnter={() => onEnter(p.id)}
        onMouseLeave={onLeave}
        onFocus={() => onEnter(p.id)}
        onBlur={onLeave}
        onClick={() => onOpen(p.id)}
        className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 transition-[background-color,box-shadow] duration-200 ${
          highlighted ? 'bg-savoia-50 ring-savoia-100' : 'ring-transparent hover:bg-white hover:shadow-[0_6px_18px_-12px_rgb(20_48_79/0.45)] hover:ring-line'
        }`}
      >
        <Avatar player={p} size={34} wide={!!p.logo} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-bold text-navy">{p.name}</span>
          <span className="block truncate text-[0.8125rem] text-muted">
            {categoryName(p.categories[0]!, locale)}
            {p.categories.length > 1 && ` +${p.categories.length - 1}`}
            {loc && <> · {loc}</>}
          </span>
        </span>
      </button>
    </li>
  );
});

/**
 * Alphabetical list of the current results, also the accessible alternative to the map.
 * Players already on the map come first ("Sulla mappa"), then everyone else by initial.
 */
export function PlayerList({ onOpen }: { onOpen: (id: string) => void }) {
  const { results, locale, highlightId, setHighlightId, t } = useExplorer();

  const groups = useMemo(() => {
    const onMap = results.filter((p) => p.location?.lat != null);
    const m = new Map<string, PublicPlayer[]>();
    for (const p of results) {
      if (p.location?.lat != null) continue;
      const first = p.name.normalize('NFD').replace(/[̀-ͯ]/g, '')[0]?.toUpperCase() ?? '#';
      const k = /[A-Z]/.test(first) ? first : '#';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    const letters = [...m.entries()].map(([k, items]) => ({ key: k, label: k, items, highlight: false }));
    return onMap.length ? [{ key: 'map', label: `${t.map.onMap} · ${onMap.length}`, items: onMap, highlight: true }, ...letters] : letters;
  }, [results, t.map.onMap]);

  return (
    <div aria-label={t.map.listTitle} role="region">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <h3
            className={`sticky top-0 z-[1] px-3 py-1.5 text-xs font-extrabold tracking-wider backdrop-blur ${
              g.highlight ? 'bg-savoia-50/95 text-savoia-700' : 'bg-white/95 text-subtle'
            }`}
            aria-hidden={g.highlight ? undefined : 'true'}
          >
            {g.highlight && <span className="mr-1.5 inline-block size-2 rounded-full bg-savoia align-middle" aria-hidden="true" />}
            {g.label}
          </h3>
          <ul>
            {g.items.map((p) => (
              <Row
                key={p.id}
                p={p}
                locale={locale}
                highlighted={highlightId === p.id}
                onEnter={setHighlightId}
                onLeave={() => setHighlightId(null)}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
