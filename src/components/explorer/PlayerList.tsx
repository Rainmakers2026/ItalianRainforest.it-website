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
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
          highlighted ? 'bg-savoia-50' : 'hover:bg-mist'
        }`}
      >
        <Avatar player={p} size={34} />
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

/** Alphabetical list of the current results, grouped by initial. Also the accessible alternative to the map. */
export function PlayerList({ onOpen }: { onOpen: (id: string) => void }) {
  const { results, locale, highlightId, setHighlightId, t } = useExplorer();

  const groups = useMemo(() => {
    const m = new Map<string, PublicPlayer[]>();
    for (const p of results) {
      const first = p.name.normalize('NFD').replace(/[̀-ͯ]/g, '')[0]?.toUpperCase() ?? '#';
      const k = /[A-Z]/.test(first) ? first : '#';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()];
  }, [results]);

  return (
    <div aria-label={t.map.listTitle} role="region">
      {groups.map(([letter, items]) => (
        <section key={letter} aria-label={letter}>
          <h3
            className="sticky top-0 z-[1] bg-white/95 px-3 py-1 text-xs font-extrabold tracking-wider text-subtle backdrop-blur"
            aria-hidden="true"
          >
            {letter}
          </h3>
          <ul>
            {items.map((p) => (
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
